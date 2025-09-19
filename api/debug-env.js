export default function handler(req, res) {
  res.status(200).json({ has_OPENAI_API_KEY: !!process.env.OPENAI_API_KEY });
}
