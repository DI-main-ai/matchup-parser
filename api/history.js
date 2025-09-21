import { kvKeys, kvGetJSON, kvSetJSON } from './_kv.js';

const PREFIX = 'mp:week:'; // matchup-parser

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get('week');

    if (weekParam) {
      // Return list of records for this week (newest first)
      const key = `${PREFIX}${Number(weekParam)}`;
      const item = await kvGetJSON(key);
      return new Response(JSON.stringify({ items: item ? [item] : [] }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Return all (newest per week; keys are unique by week in this simple impl)
    const keys = await kvKeys(PREFIX);
    const items = [];
    for (const k of keys) {
      const item = await kvGetJSON(k);
      if (item) items.push(item);
    }
    // sort by week asc for UI listing
    items.sort((a, b) => Number(a.week) - Number(b.week));

    return new Response(JSON.stringify({ items }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { week, matchups } = body || {};
    if (!week || !Array.isArray(matchups)) {
      return new Response(JSON.stringify({ error: 'week and matchups required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    const now = new Date();
    const saved = {
      week: Number(week),
      matchups,
      savedAt: now.toISOString(),
      savedAtLocal: now.toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    };
    await kvSetJSON(`${PREFIX}${Number(week)}`, saved);

    return new Response(JSON.stringify({ ok: true, saved }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
