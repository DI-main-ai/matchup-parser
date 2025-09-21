import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  const { week } = req.query;

  if (!week) return res.status(400).json({ error: "Missing week" });

  try {
    const key = `week:${week}:versions`;
    const history = (await kv.get(key)) || [];
    res.status(200).json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
