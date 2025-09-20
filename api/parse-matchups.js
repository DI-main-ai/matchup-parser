// /api/parse-matchups.js
// CommonJS serverless function for Vercel

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    // Collect request body (we send JSON from the UI)
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

    // Prompt: keep it strict to encourage valid JSON only
    const instruction = `
You are a strict JSON API. From this fantasy football "Week X Matchups" screenshot, extract matchups.

Return ONLY valid minified JSON (no prose) with:
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
- Team names must be exactly as shown (case and punctuation).
- Scores must be numbers (use two decimals when present).
- "winner" is the team with the higher score.
- "diff" = |homeScore - awayScore| with two decimals.
- Do not include extra keys. Do not include a "week" key (the client passes it separately).
- Output ONLY the JSON object, nothing else.
    `.trim();

    // IMPORTANT: image_url must be an object: { url: ... }
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You convert fantasy football screenshots into clean, validated JSON. Respond with JSON only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: instruction + `\n(Week hint from user: ${week ?? "unknown"})` },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 700,
    });

    const raw = (completion.choices?.[0]?.message?.content || "").trim();

    // Try to JSON.parse directly; if it fails, try to salvage the first {...} block.
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}$/); // last JSON object in the string
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          // fall through
        }
      }
    }

    if (!parsed || !parsed.matchups) {
      res.status(502).json({
        error: "Parser did not return expected JSON.",
        raw,
      });
      return;
    }

    // Optional: light validation/normalization
    const norm = (n) =>
      typeof n === "number" ? n : Number(String(n).replace(/[^\d.]/g, "") || 0);

    parsed.matchups = (parsed.matchups || []).map((m) => {
      const homeScore = norm(m.homeScore);
      const awayScore = norm(m.awayScore);
      const diff = Math.abs(homeScore - awayScore);

      return {
        homeTeam: String(m.homeTeam || "").trim(),
        homeScore,
        awayTeam: String(m.awayTeam || "").trim(),
        awayScore,
        winner:
          homeScore === awayScore
            ? ""
            : homeScore > awayScore
            ? String(m.homeTeam || "").trim()
            : String(m.awayTeam || "").trim(),
        diff: Number(diff.toFixed(2)),
      };
    });

    res.status(200).json({
      ok: true,
      week: week ?? null,
      ...parsed,
    });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
