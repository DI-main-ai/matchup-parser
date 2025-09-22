// /api/clear-week.js
import { kvDel } from './_kv.js';

export default async function handler(req, res) {
  try {
    const { week } = req.query;
    if (!week) return res.status(400).json({ error: "week query required" });

    const key = `mp:week:${Number(week)}`;
    await kvDel(key);
    res.status(200).json({ ok: true, deleted: key });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
