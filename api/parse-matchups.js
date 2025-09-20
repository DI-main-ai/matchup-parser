// /api/parse-matchups.js
// CommonJS serverless function for Vercel

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ---------- Robust JSON extraction ---------- */
function extractJson(text) {
  if (!text) return null;
  const s = String(text).trim();

  // 1) Prefer a fenced ```json ... ``` block (capture inner, ignore fences)
  const fence = s.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1]) {
    const inner = fence[1].trim();
    try {
      return JSON.parse(inner);
    } catch (_) {
      // continue to other strategies
    }
  }

  // 2) If we can find the JSON object that starts at {"matchups":
  const startIdx = s.indexOf('{"matchups"');
  if (startIdx !== -1) {
    const endIdx = s.lastIndexOf("}");
    if (endIdx > startIdx) {
      const candidate = s.slice(startIdx, endIdx + 1).trim();
      try {
        return JSON.parse(candidate);
      } catch (_) {
        // continue
      }
    }
  }

  // 3) Very last resort: largest brace pair
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = s.slice(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch (_) {
      // give up
    }
  }

  return null;
}

/* ---------- Small helpers ---------- */
const toNum = (v) =>
  typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, "") || 0);

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    // read JSON body sent by the UI
    let body = "";
    await new Promise((resolve) => {
      req.on("data", (c) => (body += c));
      req.on("end", resolve);
    });

    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      res.status(400).json({ error: "Body must be JSON." });
      return;
    }

    const { week, imageDataUrl } = payload || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      res.status(400).json({
        error:
          "Missing or invalid 'imageDataUrl'. Provide a data URL or public HTTP(S) image URL.",
      });
      return;
    }

    const instruction = `
You are a strict JSON API. From this fantasy football screenshot "Week X Matchups", extract matchups.

Return ONLY valid JSON (no prose, no code fences) exactly like:
{
  "matchups": [
    {
      "homeTeam": "string",
      "homeScore": number,
      "awayTeam": "string",
      "awayScore": number,
      "winner": "string",
      "diff": number
    }
  ]
}

Rules:
- Team names exactly as shown (case & punctuation).
- Scores numeric.
- winner = team with higher score.
- diff = |homeScore - awayScore| with two decimals.
- Do NOT include extra keys. Do NOT include "week".
- Output JSON object ONLY (no Markdown fences).
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You convert fantasy football screenshots into clean JSON. Respond with JSON only.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                instruction +
                `\n(Week hint from user: ${week ?? "unknown"})`,
            },
            // IMPORTANT: correct image payload shape
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 700,
    });

    const raw = (completion.choices?.[0]?.message?.content || "").trim();

    const parsed = extractJson(raw);

    if (!parsed || !parsed.matchups) {
      res.status(502).json({
        error: "Parser did not return expected JSON.",
        raw,
      });
      return;
    }

    // Normalize/verify winner & diff just in case
    parsed.matchups = parsed.matchups.map((m) => {
      const homeTeam = String(m.homeTeam || "").trim();
      const awayTeam = String(m.awayTeam || "").trim();
      const homeScore = toNum(m.homeScore);
      const awayScore = toNum(m.awayScore);
      const diff = Number(Math.abs(homeScore - awayScore).toFixed(2));
      const winner =
        homeScore === awayScore ? "" : homeScore > awayScore ? homeTeam : awayTeam;

      return { homeTeam, homeScore, awayTeam, awayScore, winner, diff };
    });

    res.status(200).json({ ok: true, week: week ?? null, ...parsed });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
