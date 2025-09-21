// /api/parse-matchups.js
import OpenAI from "openai";
import { kvSetJSON } from "./_kv.js";

const PREFIX = "mp:week:";

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

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const sys = `
You extract fantasy football matchup results from a screenshot.
Return ONLY valid JSON with this exact shape (no markdown fences):
{
  "matchups": [
    {"homeTeam": "...", "homeScore": number, "awayTeam": "...", "awayScore": number, "winner": "...", "diff": number}
  ]
}
Rules:
- No markdown, no commentary, no code fences.
- Scores must be numbers (decimals ok). "diff" = abs(homeScore - awayScore) to 2 decimals.
- Team names must match exactly as seen.
`;

    const userText = `Here is a matchup screenshot.${hintWeek ? ` (Manual week hint: ${hintWeek})` : ""}`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    // Extract raw text from the model
    const choice = resp?.choices?.[0];
    let raw = choice?.message?.content ?? "";
    if (Array.isArray(raw)) {
      raw = raw.map((p) => (typeof p === "string" ? p : p?.text || p?.content || "")).join("\n");
    }
    if (typeof raw !== "string") raw = String(raw || "");

    if (!raw.trim()) {
      return res.status(502).json({ error: "No content returned from model", debug: resp });
    }

    // Parse JSON from the raw string
    const json = extractJson(raw);
    if (!json || !Array.isArray(json.matchups)) {
      return res.status(422).json({
        error: "Parser did not return expected JSON.",
        raw: truncate(raw, 4000),
        debugModel: resp?.model || "gpt-4o-mini",
      });
    }

    // Normalize/patch matchups
    const matchups = (json.matchups || []).map((m) => {
      const homeTeam = (m.homeTeam || "").trim();
      const awayTeam = (m.awayTeam || "").trim();
      const homeScore = Number(m.homeScore);
      const awayScore = Number(m.awayScore);
      let winner = (m.winner || "").trim();
      if (!winner) {
        if (isFinite(homeScore) && isFinite(awayScore)) {
          if (homeScore > awayScore) winner = homeTeam;
          else if (awayScore > homeScore) winner = awayTeam;
          else winner = ""; // tie (rare)
        }
      }
      let diff = Number(m.diff);
      if (!isFinite(diff) && isFinite(homeScore) && isFinite(awayScore)) {
        diff = Math.abs(homeScore - awayScore);
      }
      return {
        homeTeam,
        homeScore: isFinite(homeScore) ? Number(homeScore.toFixed(2)) : homeScore,
        awayTeam,
        awayScore: isFinite(awayScore) ? Number(awayScore.toFixed(2)) : awayScore,
        winner,
        diff: isFinite(diff) ? Number(diff.toFixed(2)) : diff,
      };
    });

    // Try to infer week from model text; fall back to hintWeek
    const extractedWeek = inferWeekFromText(raw);
    const week = extractedWeek ?? (Number.isInteger(hintWeek) ? hintWeek : (hintWeek ? Number(hintWeek) : null));

    // Save to KV if we have a week number
    let saved = null;
    if (week != null && !Number.isNaN(Number(week))) {
      const payload = {
        week: Number(week),
        matchups,
        savedAt: new Date().toISOString(),
        savedAtLocal: new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
      };
      await kvSetJSON(`${PREFIX}${Number(week)}`, payload);
      saved = payload;
    }

    return res.status(200).json({
      week: week,
      matchups,
      saved, // null if no week available
      meta: {
        weekSource: extractedWeek != null ? "image" : (hintWeek != null ? "manual" : "unknown"),
        model: resp?.model || "gpt-4o-mini",
      },
      // raw: truncate(raw, 1500), // uncomment if you want to see model text
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

/* ---------------- helpers ---------------- */

function extractJson(s) {
  // Prefer fenced ```json blocks, then ``` blocks, then first {...}
  const fence = /```json\s*([\s\S]*?)```/i.exec(s) || /```\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) {
    try { return JSON.parse(cleanTrailingCommas(fence[1])); } catch (_) {}
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);
    try { return JSON.parse(cleanTrailingCommas(candidate)); } catch (_) {}
  }
  try { return JSON.parse(cleanTrailingCommas(s)); } catch (_) { return null; }
}

function cleanTrailingCommas(text) {
  return text.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
}

function truncate(str, n) {
  if (typeof str !== "string") return "";
  return str.length > n ? str.slice(0, n) + " …(truncated)" : str;
}

function inferWeekFromText(s) {
  // matches "Week 3", "Wk 3", "W 3" (be conservative)
  const m = /(?:\bweek|\bwk)\s*([0-9]{1,2})\b/i.exec(s);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  return Number.isFinite(w) ? w : null;
}
