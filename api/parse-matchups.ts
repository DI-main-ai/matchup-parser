// api/parse-matchups.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import Busboy from 'busboy';

// ---------- OpenAI client ----------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Helpers: request parsing ----------
type ImgPayload = { buffer: Buffer; mime: string; week?: string; };

async function readMultipart(req: VercelRequest): Promise<ImgPayload> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers as any });
    const chunks: Buffer[] = [];
    let mime = 'image/png';
    let week: string | undefined;

    bb.on('file', (_name, file, info) => {
      if (info && (info as any).mimeType) mime = (info as any).mimeType;
      file.on('data', (d: Buffer) => chunks.push(d));
    });
    bb.on('field', (name, val) => {
      if (name === 'week') week = val;
    });
    bb.on('error', reject);
    bb.on('finish', () => {
      if (!chunks.length) return reject(new Error('No file provided'));
      resolve({ buffer: Buffer.concat(chunks), mime, week });
    });

    // @ts-ignore
    req.pipe(bb);
  });
}

async function readJson(req: VercelRequest): Promise<ImgPayload> {
  // Body may already be parsed by Vercel, or be a string
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const dataUrl: string = body.dataUrl;
  const week: string | undefined = body.week;

  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('JSON body must include "dataUrl" (data:<mime>;base64,...)');
  }
  const m = /^data:(.+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error('Invalid dataUrl format');
  const mime = m[1];
  const b64 = m[2];
  const buffer = Buffer.from(b64, 'base64');
  return { buffer, mime, week };
}

async function readImageFromRequest(req: VercelRequest): Promise<ImgPayload> {
  const ct = (req.headers['content-type'] || '').toString().toLowerCase();
  if (ct.startsWith('multipart/form-data')) return readMultipart(req);
  if (ct.includes('application/json')) return readJson(req);
  throw new Error('Send as multipart/form-data (field "file") or JSON with { dataUrl }');
}

// ---------- Vision prompt ----------
const SYSTEM_PROMPT = `
You convert fantasy football matchup screenshots into strict JSON.
Return ONLY valid JSON.

Output shape:
{
  "matchups": [
    { "homeTeam": string, "homeScore": number, "awayTeam": string, "awayScore": number }
  ]
}

Rules:
- Use the LARGE bold numbers as final scores; ignore smaller projections beneath.
- Team names are the BLUE names; remove records/ranks like "1-1-0 | 6th".
- Preserve capitalization and apostrophes (e.g., "Kyle's Hustle").
- If a character is ambiguous (I vs |), prefer the letter that makes a real name.
- Do not include emoji, icons, or extra fields.
`;

// ---------- Util: safe JSON extraction ----------
function safeParseJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON in model response');
  return JSON.parse(text.slice(start, end + 1));
}

// ---------- Handler ----------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // CORS / preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return res.status(405).json({ error: 'POST only' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server' });
    }

    const { buffer, mime } = await readImageFromRequest(req);
    const b64 = buffer.toString('base64');

    // ----- Vision call (chat.completions with image) -----
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',                 // vision-capable model
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the final results as strict JSON.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mime};base64,${b64}` }
            }
          ]
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content ?? '';
    const parsed = safeParseJson(raw);

    const matchups = Array.isArray(parsed?.matchups) ? parsed.matchups : [];
    // Enrich with winner & diff (optional)
    const enriched = matchups.map((m: any) => {
      const homeScore = Number(m.homeScore);
      const awayScore = Number(m.awayScore);
      const winner = homeScore >= awayScore ? m.homeTeam : m.awayTeam;
      const diff = Math.abs(homeScore - awayScore);
      return { ...m, homeScore, awayScore, winner, diff };
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ matchups: enriched });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return res.status(400).json({ error: msg });
  }
}
