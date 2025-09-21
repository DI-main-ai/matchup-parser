// /api/history/get.js
const { kvGet } = require('../_kv');

module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const raw = await kvGet(`version:${id}`);
    if (!raw) return res.status(404).json({ error: 'Not found' });
    const obj = JSON.parse(raw);
    res.status(200).json({ week: obj.week, matchups: obj.matchups, meta: obj.meta || {} });
  } catch (e) {
    console.error('history/get', e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
