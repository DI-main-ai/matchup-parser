const multiparty = require("multiparty");

module.exports = (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const form = new multiparty.Form();
  form.parse(req, (err, fields, files) => {
    if (err) {
      return res.status(400).json({ error: "form parse error", detail: String(err) });
    }

    const week = fields?.week?.[0] ?? null;
    const file = files?.file?.[0] ?? null;

    res.status(200).json({
      ok: true,
      weekReceived: week,
      fileMeta: file
        ? {
            originalFilename: file.originalFilename,
            sizeBytes: file.size,
            contentType: file.headers?.["content-type"]
          }
        : null
    });
  });
};
