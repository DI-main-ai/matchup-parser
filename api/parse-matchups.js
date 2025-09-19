// api/parse-matchups.js
const fs = require("fs");
const path = require("path");
const multiparty = require("multiparty");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---- helpers ---------------------------------------------------------------

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form();
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

function fileToBase64(file) {
  const buf = fs.readFileSync(file.path);
  // best guess; the site screenshots are usually png
  const ext = (file.headers?.["content-type"] || "").includes("jpeg")
    ? "jpeg"
    : "png";
  return { b64: buf.toString("base64"), mime: `image/${ext}` };
}

// Some models sometimes wrap JSON with prose. This pulls the first JSON block.
function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}$/m) || text.match(/\{[\s\S]*\}/m);
  return m ? m[0] : text;
}

// ---- core: call model ------------------------------------------------------

async function parseImageWithModel(imageBase64, mime) {
  const prompt = `
You are an OCR + parser for fantasy-football matchup screenshots.
Return STRICT JSON only (no code block, no prose) with this shape:

{
  "week": number | null,               // if "Week N" appears, return N, else null
  "matchups": [
    {
      "homeTeam": string,
      "homeScore": number,
      "awayTeam": string,
      "awayScore": number,
      "winner": string,
      "diff": number
    }
  ]
}

Rules:
- Scores must be the MAIN bold scores (not projections or small numbers).
- Team names are the blue names exactly as printed (preserve apostrophes).
- diff = |homeScore - awayScore| (round to 2 decimals).
- If a name is unclear, make your best guess but do NOT invent teams not in the image.
- If "Week N Matchups" (or similar) is present, set "week" = N, else null.
`;

  const input = [
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:${mime};base64,${imageBase64}` }
      ]
    }
  ];

  const resp = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    temperature: 0.1,
    input
  });

  const text = resp.output_text;
  const json = extractJson(text);
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    // Fall back: try to be defensive if model returned something slightly wrapped
    throw new Error("Parser: model did not return valid JSON");
  }

  // sanitize numeric fields
  if (Array.isArray(data.matchups)) {
    for (const m of data.matchups) {
      m.homeScore = Number(m.homeScore);
      m.awayScore = Number(m.awayScore);
      if (!Number.isFinite(m.homeScore) || !Number.isFinite(m.awayScore)) {
        throw new Error("Parser: non-numeric score in result");
      }
      const diff = Math.abs(m.homeScore - m.awayScore);
      m.diff = Number(diff.toFixed(2));
      // winner sanity (recompute if missing)
      if (!m.winner) {
        m.winner = m.homeScore >= m.awayScore ? m.homeTeam : m.awayTeam;
      }
    }
  } else {
    data.matchups = [];
  }

  data.week = data.week == null ? null : Number(data.week);
  if (data.week != null && !Number.isFinite(data.week)) data.week = null;

  return data;
}

// ---- handler ---------------------------------------------------------------

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { fields, files } = await parseForm(req);

    const weekField =
      fields?.week && Array.isArray(fields.week) ? fields.week[0] : null;
    const manualWeek =
      weekField != null && String(weekField).trim() !== ""
        ? Number(weekField)
        : null;

    const file =
      files?.file && Array.isArray(files.file) ? files.file[0] : null;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded (form field name must be "file")' });
      return;
    }

    const { b64, mime } = fileToBase64(file);
    const ai = await parseImageWithModel(b64, mime);

    const out = {
      week: manualWeek ?? ai.week ?? null,
      matchups: ai.matchups || []
    };

    res.status(200).json(out);
  } catch (err) {
    // Show a helpful error in the UI
    res
      .status(500)
      .json({
        error: String(err?.message || err || "Server error"),
        code: "FUNCTION_INVOCATION_FAILED"
      });
  }
};
