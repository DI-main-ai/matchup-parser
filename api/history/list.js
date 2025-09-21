// /api/history/list.js
const { kvGet } = require('../_kv');

module.exports = async (req, res) => {
  try {
    const raw = await kvGet('versions:list');
    const list = raw ? JSON.parse(raw) : [];
    res.status(200).json({ items: list });
  } catch (e) {
    console.error('history/list', e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
