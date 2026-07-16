/**
 * lib/fetcher-client.js — thin client for the remote easylink-fetcher service.
 *
 * Prod /api/scanlog/fetch calls this to trigger an on-demand pull from the
 * Windows fetcher (over Cloudflare Tunnel). Fetcher returns HOP_B-shaped
 * records in the response; prod writes them via insertHopBSafeEvents.
 *
 * Env: FETCHER_URL (e.g. https://fetch.your-domain.com), FETCHER_TOKEN (Bearer).
 */

const FETCHER_SOURCE_SDK = 'fetcher-pull';

function fetcherConfig() {
  const url = process.env.FETCHER_URL;
  const token = process.env.FETCHER_TOKEN;
  if (!url) throw Object.assign(new Error('FETCHER_URL not configured'), { code: 'FETCHER_UNCONFIGURED' });
  if (!token) throw Object.assign(new Error('FETCHER_TOKEN not configured'), { code: 'FETCHER_UNCONFIGURED' });
  return { url: url.replace(/\/$/, ''), token };
}

/**
 * Call the fetcher /fetch endpoint. Returns raw device rows verbatim (Option A).
 * Returns { ok, fetched, rawRows, error, upstreamStatus }.
 * @param {{sn:string, from:string, to:string, limit?:number}} req
 */
export async function fetchRawScanlogsFromFetcher({ sn, from, to, limit = 1000 }) {
  const { url, token } = fetcherConfig();
  const res = await fetch(`${url}/fetch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sn, from, to, limit }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, fetched: 0, rawRows: [], error: `FETCHER_FAILED ${res.status}`, upstreamStatus: res.status, body: text };
  }

  const json = await res.json();
  if (!json || json.ok !== true) {
    return { ok: false, fetched: 0, rawRows: [], error: json?.error || 'FETCHER_BAD_ACK' };
  }

  const rawRows = Array.isArray(json.raw_rows) ? json.raw_rows : [];
  return { ok: true, fetched: json.fetched ?? rawRows.length, rawRows, error: null };
}

export { FETCHER_SOURCE_SDK };
