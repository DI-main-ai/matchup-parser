// Lightweight Upstash REST helper
const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
  console.warn('⚠️ Missing KV_REST_API_URL or KV_REST_API_TOKEN env vars');
}

async function kvFetch(path, opts = {}) {
  const res = await fetch(`${KV_REST_API_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`KV error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// Store JSON under a key
export async function kvSetJSON(key, value) {
  return kvFetch('/set', {
    method: 'POST',
    body: JSON.stringify({ key, value: JSON.stringify(value) }),
  });
}

// Get JSON from a key
export async function kvGetJSON(key) {
  const out = await kvFetch(`/get/${encodeURIComponent(key)}`);
  if (!out || out.result == null) return null;
  try { return JSON.parse(out.result); } catch { return out.result; }
}

// List keys by prefix
export async function kvKeys(prefix) {
  const out = await kvFetch('/keys', {
    method: 'POST',
    body: JSON.stringify({ match: `${prefix}*`, count: 1000 }),
  });
  return out.result || [];
}
