import OpenAI from "openai";
import Busboy from "busboy";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- helpers ----------
function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const chunks = [];
    let mime = "image/png";

    bb.on("file", (_name, file, info) => {
      if (info && info.mimeType) mime = info.mimeType;
      file.on("data", d => chunks.push(d));
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      if (!chunks.length) return reject(new Error("No file uploaded"));
      resolve({ buffer: Buffer.concat(chunks), mime });
    });
    req.pipe(bb);
  });
}
async function readJson(req) {
  const bodyStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const body = bodyStr ? JSON.parse(bodyStr) : {};
  const dataUrl = body.dataUrl;
  if (!dataUrl) throw new Error('JSON body must include "dataUrl" (data:<mime>;base64,...)');
  const m = /^data:(.+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Invalid dataUrl format");
  const mime = m[1];
  const buffer = Buffer.from(m[2], "base64");
  return { buffer, mime };
}
async function readImage(req) {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.startsWith("multipart/form-data")) return readMultipart(req);
  if (ct.includes("application/json"))    return readJson(req);
  throw new Error('Send as multipart/form-data with field "file", or JSON with { dataUrl }');
}
function safeParseJson(text) {
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON returned by model");
  return JSON.parse(text.slice(start, end + 1));
}

const SYSTEM_PROMPT = `
Return ONLY:
{ "matchups": [ { "homeTeam": string, "homeScore": number, "awayTeam": string, "awayScore": number } ] }
Use the large bold numbers as final scores; ignore projections. Team names are the blue names. Keep capitalization and apostrophes. No extra text.
`;

// ---------- handler ----------
export default async function handler(req, res) {
  try {
    // Simple HTML form for GET (so you can test in the browser)
    if (req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`
        <html><body style="font-family:system-ui;padding:20px">
          <h2>/api/parse-matchups</h2>
          <p>Choose an image and click Upload to parse.</p>
          <form method="POST" enctype="multipart/form-data">
            <input type="file" name="file" accept="image/*"/>
            <button type="submit">Upload</button>
          </form>
          <p style="margin-top:10px">Need raw JSON? POST <code>{ dataUrl }</code> to this endpoint.</p>
        </body></html>
      `);
    }

    // CORS preflight (optional)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, OPTIONS");
      return res.status(405).json({ error: "Use GET (form) or POST (image) only" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set on server" });
    }

    const { buffer, mime } = await readImage(req);
    const b64 = buffer.toString("base64");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract final results as strict JSON." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }
          ]
        }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);
    const matchups = Array.isArray(parsed.matchups) ? parsed.matchups : [];

    const enriched = matchups.map(m => {
      const homeScore = Number(m.homeScore);
      const awayScore = Number(m.awayScore);
      const winner = homeScore >= awayScore ? m.homeTeam : m.awayTeam;
      const diff = Math.abs(homeScore - awayScore);
      return { ...m, homeScore, awayScore, winner, diff };
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({ matchups: enriched });
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(400).json({ error: msg });
  }
}
