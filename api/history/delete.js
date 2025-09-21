// /api/history/delete.js
const { kvGet, kvSet, kvDel } = require('../_kv');

module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    // remove the version
    await kvDel(`version:${id}`);

    // update list
    const raw = await kvGet('versions:list');
    const list = raw ? JSON.parse(raw) : [];
    const next = list.filter(x => x.id !== id);
    await kvSet('versions:list', JSON.stringify(next));

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('history/delete', e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
