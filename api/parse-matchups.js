// /api/parse-matchups.js
const { kvGet, kvSet } = require('./_kv');
const OpenAI = require('openai');

function ctLabel(ts) {
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat('en-US', {
      timeZone:'America/Chicago',
      month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:true
    }).format(d).replace(',', '');
  } catch { return String(ts); }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

    const { imageDataUrl, hintWeek, previousId } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({ error: 'imageDataUrl required' });
    }

    const hasKey = !!process.env.OPENAI_API_KEY;
    if (!hasKey) return res.status(500).json({ error: 'OPENAI_API_KEY missing' });

    // ---- Call OpenAI (gpt-4o-mini) to OCR & parse ----
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
You are given a fantasy football "Week X Matchups" screenshot.
Extract EXACTLY this JSON (no code fences):

{
  "week": <number or null>,
  "matchups": [
    {"homeTeam": "...", "homeScore": <number>, "awayTeam": "...", "awayScore": <number>, "winner": "...", "diff": <number>}
    ...
  ],
  "meta": {"extractedWeek": <number or null>, "weekSource": "image" | "none"}
}

Rules:
- Scores must be numbers with 2 decimals.
- winner = team with higher score.
- diff = abs(homeScore - awayScore) with 2 decimals.
- extractedWeek comes from the "Week N" heading in the screenshot if visible; else null.
`;

    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You extract structured JSON from images.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.trim() },
            { type: 'input_image', image_url: { url: imageDataUrl } }
          ]
        }
      ]
      // (no temperature; some models only accept default)
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // If model wrapped in ```json fences, try to strip
      const m = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/);
      if (m) parsed = JSON.parse(m[1]);
      else throw new Error('Parser did not return valid JSON.');
    }

    const wkFromImage = (parsed.meta && parsed.meta.extractedWeek) ? parsed.meta.extractedWeek : null;
    const weekFinal = hintWeek ?? parsed.week ?? wkFromImage ?? null;

    // prepare payload
    const matchups = Array.isArray(parsed.matchups) ? parsed.matchups : [];
    const out = { week: weekFinal, matchups, meta: { extractedWeek: wkFromImage, weekSource: wkFromImage ? 'image' : 'none' } };

    // ---- Save to KV as a new version (keep last 5) ----
    const id = String(Date.now());
    const label = `W${weekFinal || '?'} • ${ctLabel(Date.now())}`;
    const versionObj = { id, week: weekFinal, matchups, createdAt: Date.now(), label, meta: out.meta, previousId: previousId || null };

    // list
    const existingRaw = await kvGet('versions:list').catch(() => '[]');
    const list = existingRaw ? JSON.parse(existingRaw) : [];
    const updated = [versionObj, ...list].slice(0, 5);
    await kvSet(`version:${id}`, JSON.stringify(versionObj));
    await kvSet('versions:list', JSON.stringify(updated));

    res.status(200).json(out);
  } catch (e) {
    console.error('parse-matchups', e);
    // Always return JSON so the UI never sees HTML
    res.status(500).json({ error: String(e.message || e) });
  }
};
