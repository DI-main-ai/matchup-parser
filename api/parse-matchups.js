// /api/parse-matchups.js
const OpenAI = require("openai");

module.exports = async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const bad = (status, msg, extra = {}) =>
    res.status(status).json({ error: msg, requestId, ...extra });

  try {
    if (req.method !== "POST") {
      return bad(405, "Method not allowed");
    }

    if (!process.env.OPENAI_API_KEY) {
      return bad(500, "Missing OPENAI_API_KEY");
    }

    let body;
    try {
      body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    } catch {
      return bad(400, "Body must be JSON");
    }

    const week = (body.week || "").toString().trim();
    const imageDataUrl = (body.imageDataUrl || "").toString();

    if (!imageDataUrl.startsWith("data:image/")) {
      return bad(400, "imageDataUrl must be a data URL (data:image/...)");
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build the prompt
    const systemPrompt =
      "You are a strict JSON parser. Return only JSON with the shape: " +
      '{"matchups":[{"homeTeam":string,"homeScore":number,"awayTeam":string,"awayScore":number,"winner":string,"diff":number}]} ' +
      "No extra commentary or code fences.";

    const userText =
      "Parse the attached ESPN fantasy screenshot into JSON. " +
      (week ? `The week for these matchups is ${week}. ` : "") +
      "Use exact team names and two-decimal scores. Winner is the higher score; diff is absolute difference to two decimals.";

    // Chat Completions w/ image
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    if (!raw) {
      return bad(502, "OpenAI returned no content");
    }

    // Extract raw JSON (strip ```json fences if present)
    const jsonText = (() => {
      const fence = raw.match(/```json\s*([\s\S]*?)```/i);
      if (fence) return fence[1].trim();
      // otherwise assume whole content is JSON
      return raw.trim();
    })();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return bad(422, "Parser did not return expected JSON.", { raw });
    }

    // Basic validation
    if (!parsed || !Array.isArray(parsed.matchups)) {
      return bad(422, "JSON missing matchups array.", { raw: jsonText });
    }

    // Normalize numbers
    parsed.matchups = parsed.matchups.map((m) => ({
      homeTeam: String(m.homeTeam || "").trim(),
      homeScore: Number(m.homeScore),
      awayTeam: String(m.awayTeam || "").trim(),
      awayScore: Number(m.awayScore),
      winner: String(m.winner || "").trim(),
      diff: Number(m.diff),
    }));

    return res.status(200).json({
      week: week || null,
      matchups: parsed.matchups,
      requestId,
    });
  } catch (err) {
    // Surface a clean JSON error no matter what
    return res
      .status(500)
      .json({ error: "A server error has occurred", requestId, detail: String(err && err.message || err) });
  }
};
