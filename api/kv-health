// /api/kv-health.js (delete after testing)
import { kv } from './_kv';

export default async function handler(req, res) {
  try {
    await kv.set('mp:health', { ok: true, t: Date.now() }, { ex: 30 });
    const v = await kv.get('mp:health');
    res.status(200).json({ ok: true, env: {
      hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN
    }, value: v });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
