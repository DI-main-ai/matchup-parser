// api/parse-matchups.js
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }
  try {
    const { imageDataUrl, hintWeek } = req.body || {};
    if (!imageDataUrl) {
      res.status(400).json({ error: 'imageDataUrl is required' });
      return;
    }

    const systemPrompt = `
You extract structured data from fantasy-football matchup screenshots.

Rules:
- Look for a label like "Week N" at the top-left; *only* if you can clearly read it, set weekSource="image" and return that number in "extractedWeek".
- Do NOT infer week from standings (e.g., "2-0-0 | 1st") or any other numbers; if you cannot see an explicit "Week N", set extractedWeek=null and weekSource=null.
- Return matchups shown from top to bottom. Each matchup has a left team (home) and a right team (away) with scores (decimals allowed).
- Output STRICT JSON with keys:
  {
    "extractedWeek": number | null,
    "weekSource": "image" | null,
    "matchups": [
      {"homeTeam": string, "homeScore": number, "awayTeam": string, "awayScore": number}
    ]
  }
- No code fences, no commentary.
`.trim();

    const userPrompt = `Extract data.`.trim();

    // Note: no temperature here (the model enforces its default).
    const response = await client.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ]
    });

    let raw = response.choices?.[0]?.message?.content?.trim() || '';
    // strip accidental code fences
    raw = raw.replace(/^```json\s*|\s*```$/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      return res.status(500).json({ error: 'Model returned non-JSON', raw });
    }

    const extractedWeek = Number.isFinite(parsed.extractedWeek) ? parsed.extractedWeek : null;
    const weekSource = parsed.weekSource === 'image' ? 'image' : null;
    const matchups = Array.isArray(parsed.matchups) ? parsed.matchups : [];

    // Respect precedence: image-extracted (only if weekSource==='image') > manual hint
    const finalWeek = (weekSource === 'image' && extractedWeek)
      ? extractedWeek
      : (Number.isFinite(hintWeek) ? hintWeek : hintWeek || null);

    res.json({
      week: finalWeek,
      matchups,
      meta: {
        extractedWeek,
        weekSource,
        hintWeek: hintWeek ?? null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
