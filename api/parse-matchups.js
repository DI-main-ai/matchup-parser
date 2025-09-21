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
    `.trim();

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You extract strict JSON from images precisely." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    // Defensive: content might not exist
    const raw = resp?.choices?.[0]?.message?.content;
    if (!raw) {
      return res.status(500).json({
        error: "No content returned from model",
        debug: resp, // include the whole response to inspect
      });
    }

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

    const matchups = Array.isArray(data.matchups) ? data.matchups : [];
    const extractedWeek =
      typeof data.week === "number" && Number.isFinite(data.week) ? data.week : null;

    const week = extractedWeek ?? (Number.isFinite(hintWeek) ? hintWeek : null);

    return res.status(200).json({
      week,
      matchups,
      meta: {
        extractedWeek,
        weekSource: extractedWeek != null ? "image" : (hintWeek != null ? "manual" : "unknown"),
        rawLength: typeof raw === "string" ? raw.length : 0,
      },
    });
  } catch (err) {
    console.error("parse-matchups error:", err);
    return res.status(500).json({
      error: String(err?.message || err),
    });
  }
}
