// /api/parse-matchups.js
// Robust, no .length on undefined, and always returns helpful debug when parsing fails.

import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { imageDataUrl, hintWeek } = req.body || {};

    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "imageDataUrl must be a data URL (data:image/...)" });
    }

    // Extract base64 and make a blob URL for the image message.
    // OpenAI chat.completions accepts `image_url` with base64 data URLs.
    const imageUrl = imageDataUrl;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const sys = `
You extract fantasy football matchup results from a screenshot.
Return ONLY valid JSON with this shape:
{
  "matchups": [
    {"homeTeam": "...", "homeScore": number, "awayTeam": "...", "awayScore": number, "winner": "...", "diff": number}
  ]
}
Rules:
- No markdown fences. No commentary.
- Scores must be numbers (use decimals as in the image). "diff" = abs(homeScore - awayScore) to 2 decimals.
- Team names must match exactly as seen.
`;

    const userText = `Here is a matchup screenshot.${hintWeek ? ` (Manual week hint: ${hintWeek})` : ""}`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1, // (0 is not supported by this model)
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    // Get a safe "raw" string no matter what the SDK returns.
    // Some SDKs may return content as a string; others may return an array of parts.
    const choice = resp?.choices?.[0];
    let raw = choice?.message?.content ?? "";

    // If content is an array of parts, join only textual parts
    if (Array.isArray(raw)) {
      raw = raw
        .map((p) => (typeof p === "string" ? p : p?.text || p?.content || ""))
        .join("\n");
    }
    if (typeof raw !== "string") raw = String(raw || "");

    if (!raw.trim()) {
      return res.status(502).json({
        error: "No content returned from model",
        debug: resp,
      });
    }

    // Try to extract just the JSON blob from the response
    const json = extractJson(raw);

    if (!json || !Array.isArray(json.matchups)) {
      return res.status(422).json({
        error: "Parser did not return expected JSON.",
        raw: truncate(raw, 4000),
        debug: resp,
      });
    }

    // Final payload back to the UI
    return res.status(200).json({
      week: hintWeek ?? null,
      matchups: json.matchups,
      meta: {
        weekSource: hintWeek ? "manual" : "unknown",
        extractedWeek: null,
        model: resp?.model || "gpt-4o-mini",
      },
      raw: truncate(raw, 2000),
    });

    import { kvSetJSON } from './_kv.js';

    const PREFIX = 'mp:week:';
    
    async function saveToHistory(week, matchups) {
      const now = new Date();
      const payload = {
        week: Number(week),
        matchups,
        savedAt: now.toISOString(),
        savedAtLocal: now.toLocaleString('en-US', { timeZone: 'America/Chicago' }),
      };
      await kvSetJSON(`${PREFIX}${Number(week)}`, payload);
      return payload;
    }
    
    export async function POST(req) {
      try {
        const { imageDataUrl, hintWeek } = await req.json();
    
        // ... your existing OCR/vision parsing ...
        // Must finish with:
        //   const week = extractedWeek || hintWeek || 1;
        //   const matchups = [ { homeTeam, homeScore, awayTeam, awayScore, winner, diff }, ... ];
    
        // ---------------------------
        // Fake stub so file compiles; REPLACE with your real parser results:
        const week = hintWeek || 1;
        const matchups = []; // <-- fill from your parser
        // ---------------------------
    
        // Save to KV
        const saved = await saveToHistory(week, matchups);
    
        return new Response(JSON.stringify({ week, matchups, saved }), {
          headers: { 'content-type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err.message || err) }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
  } catch (err) {
    return res.status(500).json({
      error: String(err?.message || err),
    });
  }
}

// ---- helpers ----

// Find the first JSON object in a string (handles code fences gracefully).
function extractJson(s) {
  // If it contains fenced code ```json ... ```, prefer that
  const fence = /```json\s*([\s\S]*?)```/i.exec(s) || /```\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) {
    try {
      return JSON.parse(cleanTrailingCommas(fence[1]));
    } catch (_) {}
  }
  // Otherwise, try to find the first {...} block
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try {
      return JSON.parse(cleanTrailingCommas(candidate));
    } catch (_) {}
  }
  // Last resort: attempt a direct parse
  try {
    return JSON.parse(cleanTrailingCommas(s));
  } catch (_) {
    return null;
  }
}

// Very light cleanup (helps with loose JSON commas some models emit)
function cleanTrailingCommas(text) {
  // Remove trailing commas before } or ]
  return text
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");
}

function truncate(str, n) {
  if (typeof str !== "string") return "";
  return str.length > n ? str.slice(0, n) + " …(truncated)" : str;
}
