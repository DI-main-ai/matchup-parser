// /api/parse-matchups.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageDataUrl, hintWeek } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return res.status(400).json({ error: "imageDataUrl (data URL) is required" });
    }

    // prompt: ask for strict JSON only
    const prompt = `
You are given an ESPN fantasy "Matchups" screenshot. Extract structured data.

Return **only** raw JSON, no backticks or markdown.
Format:
{
  "week": <number or null>,
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
- "week": If visible (e.g., "Week 2" top-left with trophy icon), return that integer. If not visible, return null.
- Scores: use the big top score for each team (not the small projected/secondary numbers).
- "winner": the team name with the higher score.
- "diff": absolute difference (homeScore - awayScore) in absolute value, as a number with up to 2 decimals (no string).
- Team names must be exactly as shown in the UI.
- If any row is ambiguous, skip it rather than guessing.
    `.trim();

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You extract strict JSON from images precisely." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            // IMPORTANT: Use image_url (not input_image)
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      // do NOT set temperature to 0.0 on this model; default is fine
      // temperature: 1 is default; we omit it to avoid model-specific constraints
    });

    const raw = resp?.choices?.[0]?.message?.content || "";
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (e) {
      return res.status(400).json({
        error: "Parser did not return expected JSON.",
        raw,
      });
    }

    // Normalize output
    const matchups = Array.isArray(data.matchups) ? data.matchups : [];
    const extractedWeek =
      typeof data.week === "number" && Number.isFinite(data.week) ? data.week : null;

    // Decide final week for the response (UI will still show TSV separately)
    const week = extractedWeek ?? (Number.isFinite(hintWeek) ? hintWeek : null);

    return res.status(200).json({
      week,
      matchups,
      meta: {
        extractedWeek,
        weekSource: extractedWeek != null ? "image" : (hintWeek != null ? "manual" : "unknown"),
        rawLength: raw.length,
      },
    });
  } catch (err) {
    console.error("parse-matchups error:", err);
    // If OpenAI throws the exact error you saw, pass a helpful message back
    return res.status(500).json({
      error: String(err?.message || err),
    });
  }
}
