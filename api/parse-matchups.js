// Keep this simple first so we confirm routing. We'll plug the full parser back in after ping/debug work.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  // Accept either FormData (image) or JSON body from your UI; echo back to prove it’s wired.
  try {
    let body = "";
    await new Promise((resolve) => {
      req.on("data", (c) => (body += c));
      req.on("end", resolve);
    });

    // Try parse JSON (your UI sends JSON); if not JSON, just send a basic OK.
    let json = {};
    try { json = JSON.parse(body || "{}"); } catch (_) {}

    res.status(200).json({
      ok: true,
      route: "/api/parse-matchups",
      receivedKeys: Object.keys(json),
      note: "API route is working; next step is to re-enable the real parser."
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
