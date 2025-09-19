module.exports = (req, res) => {
  res.status(200).json({ ok: true, route: "/api/ping", ts: Date.now() });
};
