// /api/_kv.js
import { Redis } from '@upstash/redis';

const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
}

export const kv = new Redis({ url, token });

export async function kvSetJSON(key, value) {
  return kv.set(key, value);
}

export async function kvGetJSON(key) {
  return kv.get(key);
}

export async function kvDel(key) {
  return kv.del(key);
}

export async function kvKeys(prefix) {
  return kv.keys(`${prefix}*`);
}
