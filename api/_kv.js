// /api/_kv.js - Upstash Redis REST helper (works with Vercel KV REST vars too)
const BASE = process.env.KV_REST_API_URL || process.env.REDIS_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN || process.env.REDIS_TOKEN || '';

async function kvCommand(...command) {
  if (!BASE || !TOKEN) throw new Error('KV credentials missing');
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ command })
  });
  const data = await res.json().catch(async () => ({ error: await res.text() }));
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data?.result;
}

async function kvGet(key) {
  const res = await kvCommand('GET', key);
  return typeof res === 'string' ? res : (res ?? null);
}
async function kvSet(key, val) {
  return kvCommand('SET', key, typeof val === 'string' ? val : JSON.stringify(val));
}
async function kvDel(key) { return kvCommand('DEL', key); }

module.exports = { kvGet, kvSet, kvDel };
