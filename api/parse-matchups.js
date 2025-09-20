// api/parse-matchups.js
import OpenAI from "openai";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { imageDataUrl, filenameWeek, selectorWeek } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return res.status(400).json({ error: "imageDataUrl is required" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // Build one vision call that returns strict JSON with optional "week"
    // Week instruction: detect the integer shown as "Week N" in the header if present.
    const messages = [
      {
        role: "system",
        content:
          "You extract fantasy football matchup results from a scoreboard screenshot and return STRICT JSON. " +
          "If the screenshot shows a header like 'Week 2 Matchups', set week to that integer; else set week to null. " +
          "Return ONLY JSON; no markdown fences.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Return JSON of the shape: " +
              `{"week": <number|null>, "matchups":[{"homeTeam":"","homeScore":0,"awayTeam":"","awayScore":0,"winner":"","diff":0}]}. ` +
              "Use the main bold scores for each matchup. Team names and scores must be exact.",
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
          },
        ],
      },
    ];

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: messages,
      temperature: 0.1,
    });

    const text = resp.output_text || "";
    // The model must return plain JSON; try to parse directly
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Some safety: if the model wrapped in ```json fences, strip them.
      const m = text.match(/```json\s*([\s\S]*?)```/i);
      if (m) {
        parsed = JSON.parse(m[1]);
      } else {
        return res
          .status(500)
          .json({ error: "Parser did not return JSON", raw: text.slice(0, 5000) });
      }
    }

    // Normalize/validate minimal fields
    const fromImageWeek =
      typeof parsed?.week === "number" && Number.isFinite(parsed.week)
        ? parsed.week
        : null;

    const matchups = Array.isArray(parsed?.matchups) ? parsed.matchups : [];
    const normalized = matchups
      .map((m) => ({
        homeTeam: String(m.homeTeam || "").trim(),
        homeScore: Number(m.homeScore ?? NaN),
        awayTeam: String(m.awayTeam || "").trim(),
        awayScore: Number(m.awayScore ?? NaN),
      }))
      .filter(
        (m) =>
          m.homeTeam &&
          m.awayTeam &&
          Number.isFinite(m.homeScore) &&
          Number.isFinite(m.awayScore)
      )
      .map((m) => {
        const winner =
          m.homeScore > m.awayScore
            ? m.homeTeam
            : m.awayScore > m.homeScore
            ? m.awayTeam
            : "TIE";
        const diff = Math.abs(m.homeScore - m.awayScore);
        return { ...m, winner, diff: Number(diff.toFixed(2)) };
      });

    // Resolve final week by priority: filename → image OCR → selector
    const weekFinal =
      (Number.isFinite(filenameWeek) && filenameWeek) ||
      (Number.isFinite(fromImageWeek) && fromImageWeek) ||
      (Number.isFinite(selectorWeek) && selectorWeek) ||
      null;

    return res.status(200).json({
      week: weekFinal,
      matchups: normalized,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: String(err?.message || err || "Unknown error") });
  }
}
