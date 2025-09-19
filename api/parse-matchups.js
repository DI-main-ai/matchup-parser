// api/parse-matchups.js
const fs = require("fs");
const multiparty = require("multiparty");
const OpenAI = require("openai");

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form();
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });
}

function readFileB64(file) {
  const buf = fs.readFileSync(file.path);
  const ct = file.headers?.["content-type"] || "image/png";
  return { b64: buf.toString("base64"), mime: ct };
}

function extractJsonBlock(s) {
  const m = s.match(/\{[\s\S]*\}$/m) || s.match(/\{[\s\S]*\}/m);
  return m ? m[0] : s;
}

async function callOpenAI(b64, mime) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Quick feature test – if this throws, your openai package is too old.
  if (!client.responses || !client.responses.create) {
    throw new Error("OpenAI SDK version doesn’t support responses.create – update 'openai' to ^4.58.0");
  }

  const prompt = `
Return STRICT JSON ONLY:

{
  "week": number | null,
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
- Use the bold main scores (ignore projections/smaller numbers).
- Preserve team names exactly (blue text).
- diff = |homeScore - awayScore| round to 2 decimals.
- If the header shows "Week N", set week = N; else null.
`;

  const input = [
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:${mime};base64,${b64}` }
      ]
    }
  ];

  const resp = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    temperature: 0.1,
    input
  });

  const raw = resp.output_text || "";
  const json = extractJsonBlock(raw);
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Model did not return valid JSON");
  }

  if (!Array.isArray(data.matchups)) data.matchups = [];

  for (const m of data.matchups) {
    m.homeScore = Number(m.homeScore);
    m.awayScore = Number(m.awayScore);
    if (!Number.isFinite(m.homeScore) || !Number.isFinite(m.awayScore)) {
      throw new Error("Non-numeric score in model result");
    }
    const diff = Math.abs(m.homeScore - m.awayScore);
    m.diff = Number(diff.toFixed(2));
    if (!m.winner) m.winner = m.homeScore >= m.awayScore ? m.homeTeam : m.awayTeam;
  }

  const wk = data.week == null ? null : Number(data.week);
  data.week = Number.isFinite(wk) ? wk : null;

  return data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment" });
  }

  try {
    const { fields, files } = await parseForm(req);

    const manualWeekRaw = fields?.week?.[0] ?? null;
    const manualWeek =
      manualWeekRaw != null && String(manualWeekRaw).trim() !== ""
        ? Number(manualWeekRaw)
        : null;

    const file = files?.file?.[0];
    if (!file) return res.status(400).json({ error: 'No file uploaded (field "file")' });

    const { b64, mime } = readFileB64(file);
    const ai = await callOpenAI(b64, mime);

    return res.status(200).json({
      week: manualWeek ?? ai.week ?? null,
      matchups: ai.matchups
    });
  } catch (err) {
    console.error("parse-matchups error:", err);
    return res.status(500).json({
      error: String(err?.message || err || "Server error"),
      code: "FUNCTION_INVOCATION_FAILED"
    });
  }
};
