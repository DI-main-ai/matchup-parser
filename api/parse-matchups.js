const OpenAI = require("openai");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST" });
      return;
    }

    const { imageDataUrl, week } = await readJsonBody(req);
    if (!imageDataUrl) {
      res.status(400).json({ error: "Missing imageDataUrl" });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    if (!client.apiKey) {
      res.status(500).json({ error: "OPENAI_API_KEY missing" });
      return;
    }

    const system = [
      "You receive a screenshot of fantasy football matchups.",
      "Extract an array 'matchups'. For each row extract:",
      "homeTeam, homeScore (number), awayTeam, awayScore (number), winner (team name), diff (abs(homeScore-awayScore) with 2 decimals).",
      "Return ONLY valid JSON. If a team name is OCR'd slightly wrong, fix common mistakes (capitalize I vs |, etc.)."
    ].join(" ");

    const user = [
      { type: "text", text: "Parse the screenshot. Return JSON with a top-level 'matchups' array." },
      { type: "input_image", image_url: { url: imageDataUrl } }
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.2
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try { parsed = JSON.parse(content); } catch { parsed = { matchups: [] }; }
    if (week != null) parsed.week = Number(week);

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({
      error: String(err && err.message ? err.message : err)
    });
  }
};
