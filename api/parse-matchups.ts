// Vercel serverless function
import type { VercelRequest, VercelResponse } from 'vercel';
import OpenAI from 'openai';

// IMPORTANT: set OPENAI_API_KEY in Vercel env
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Helper: read multipart/form-data
async function readImageFromRequest(req: VercelRequest): Promise<{buffer:Buffer, mime:string, week?:string}> {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error('Send as multipart/form-data with field "file"');
  }
  const busboy = await import('busboy').then(m => m.default({ headers: req.headers as any }));
  const chunks: Buffer[] = [];
  let mime = 'image/png';
  let week: string | undefined;

  await new Promise<void>((resolve, reject) => {
    req.pipe(busboy);
    busboy.on('file', (_fieldname, file, info) => {
      mime = info.mimeType || mime;
      file.on('data', (d:Buffer) => chunks.push(d));
      file.on('end', () => {});
    });
    busboy.on('field', (name, val) => {
      if (name === 'week') week = val;
    });
    busboy.on('error', reject);
    busboy.on('finish', () => resolve());
  });

  if (!chunks.length) throw new Error('No file provided');
  return { buffer: Buffer.concat(chunks), mime, week };
}

const SYSTEM_PROMPT = `
You convert fantasy football matchup screenshots into strict JSON.
Return ONLY valid JSON. No commentary.

Extract an array "matchups" where each item is:
{ "homeTeam": string, "homeScore": number, "awayTeam": string, "awayScore": number }

Rules:
- Use the LARGE bold numbers as final scores (ignore smaller projections beneath).
- Team names are the BLUE team names (ignore records/rank like "1-1-0 | 6th").
- Preserve apostrophes and capitalization.
- Do not include emoji or icons.
- If a team name begins with "I", keep the "I" even if it looks like a pipe.
- If you are unsure about a character, prefer letters over punctuation.
- Output must be strict JSON: { "matchups": [...] }`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { buffer, mime } = await readImageFromRequest(req);

    const b64 = buffer.toString('base64');

    // Vision LLM call (uses an image alongside the instructions)
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // any current vision-capable model you use
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_text", text: "Extract the final results as JSON." },
            { type: "input_image", image_url: `data:${mime};base64,${b64}` }
          ]
        }
      ]
    });

    const text = completion.choices[0]?.message?.content || "";
    // Best-effort JSON parse
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON returned');
    const payload = JSON.parse(text.slice(jsonStart, jsonEnd + 1));

    // Optional: add winner/diff here
    const enriched = (payload.matchups || []).map((m:any) => {
      const winner = m.homeScore >= m.awayScore ? m.homeTeam : m.awayTeam;
      const diff = Math.abs(m.homeScore - m.awayScore);
      return { ...m, winner, diff };
    });

    res.status(200).json({ matchups: enriched });
  } catch (err:any) {
    res.status(400).json({ error: err.message || String(err) });
  }
}
