import { kv } from '@vercel/kv';
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// helper: central timezone
function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { week, imageDataUrl, selectedVersionIndex } = req.body;

    if (!week || !imageDataUrl) {
      return res.status(400).json({ error: "Missing week or image" });
    }

    // Call OpenAI with image
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "Extract matchups from the fantasy football screenshot into JSON format.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Parse this image into matchups JSON with homeTeam, awayTeam, homeScore, awayScore, winner, and diff." },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ],
        },
      ],
    });

    const raw = response.choices[0].message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Parser did not return valid JSON", raw });
    }

    const newVersion = {
      timestamp: formatTimestamp(),
      data: parsed,
    };

    const key = `week:${week}:versions`;

    // Fetch existing history
    let history = (await kv.get(key)) || [];

    // If user picked an older version, base update on that one
    if (selectedVersionIndex !== undefined && history[selectedVersionIndex]) {
      newVersion.data = { ...history[selectedVersionIndex].data, ...parsed };
    }

    // Insert at front, max 5
    history.unshift(newVersion);
    if (history.length > 5) history = history.slice(0, 5);

    await kv.set(key, history);

    return res.status(200).json({ ok: true, week, newVersion, history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
