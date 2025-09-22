// /api/_kv.js
import { Redis } from '@upstash/redis';

const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  // Fail loudly so we don't get confusing WRONGPASS errors
  throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
}

export const kv = new Redis({ url, token });

// Helpers we used elsewhere
export async function kvSetJSON(key, value) {
  // Upstash stores JSON fine; no need to stringify manually.
  // If you prefer strings: await kv.set(key, JSON.stringify(value))
  return kv.set(key, value);
}

export async function kvGetJSON(key) {
  const v = await kv.get(key);
  return v ?? null;
}

export async function kvDel(key) {
  return kv.del(key);
}

export async function kvKeys(prefix) {
  // Use KEYS for small keyspaces; for very large, switch to SCAN.
  // Upstash exposes "keys" safely for small usage.
  return kv.keys(`${prefix}*`);
}
