// /api/history/use.js
// This is a no-op placeholder to let the UI "select a base". You could copy/clone here if needed.
module.exports = async (_req, res) => {
  try {
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
