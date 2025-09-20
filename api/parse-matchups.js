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
    let body = "";
    await new Promise((resolve) => {
      req.on("data", (c) => (body += c));
      req.on("end", resolve);
    });

    const { week, imageDataUrl } = JSON.parse(body || "{}");
    if (!imageDataUrl) {
      res.status(400).json({ error: "Missing imageDataUrl" });
      return;
    }

    // Call OpenAI with the screenshot
    const prompt = `
You are given a fantasy football screenshot. 
Extract each matchup as structured JSON. 
Include: team1 name, team1 score, team2 name, team2 score. 
Also include the week number if provided (${week || "unknown"}).
Return JSON only.
    `;

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a JSON API that extracts structured data from fantasy football matchup screenshots." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: imageDataUrl },
          ],
        },
      ],
      max_tokens: 500,
    });

    let parsed;
    try {
      parsed = JSON.parse(result.choices[0].message.content);
    } catch {
      parsed = { raw: result.choices[0].message.content };
    }

    res.status(200).json({
      ok: true,
      week: week || null,
      matchups: parsed,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
