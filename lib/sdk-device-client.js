// php8-style device SDK client — fetch-agnostic.
//
// Mirrors the proven contract from easylink-sdk-study/php8-sample:
//   POST http://<server_IP>:<port>  body: sn=<SN>&limit=<N>
//   content-type: application/x-www-form-urlencoded
//   response JSON: { Data: [...], IsSession: bool, Result: bool }
//   paginate while IsSession === true (session-based, not cursor)
//
// Fetch is injected (deps.fetch) so tests run without a network. The default
// fetch is the global. Device config comes from tb_device (queried via the
// injected db) or env fallback — matching the php8 koneksidb/device.ini split.

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 30_000;

function toPosInt(value, fallback, { max = MAX_LIMIT } = {}) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/**
 * Resolve device connection config from tb_device (php8 reads the same table).
 * Returns { ip, port, sn }. Throws if no row + no env fallback.
 */
async function resolveDeviceConfig(db) {
  if (!db) {
    // env fallback — mirrors php8 device.ini when no DB
    const ip = process.env.EASYLINK_DEVICE_IP;
    const port = process.env.EASYLINK_DEVICE_PORT;
    const sn = process.env.EASYLINK_DEVICE_SN;
    if (!ip || !port || !sn) {
      throw new Error('No device config: tb_device unreachable and EASYLINK_DEVICE_IP/PORT/SN env not set');
    }
    return { ip, port: String(port), sn };
  }
  const [rows] = await db.query('SELECT server_IP, server_port, device_sn FROM tb_device LIMIT 1');
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.device_sn) {
    throw new Error('No device row in tb_device');
  }
  return { ip: row.server_IP, port: String(row.server_port), sn: row.device_sn };
}

function buildRequestBody(sn, limit) {
  return `sn=${encodeURIComponent(sn)}&limit=${limit}`;
}

/**
 * One page of the SDK session. Returns parsed { Data, IsSession, Result }.
 * php8 webservice(): POST form body, no headers beyond content-type.
 */
async function fetchPage({ ip, port, sn, limit }, { fetch = globalThis.fetch } = {}) {
  const url = `http://${ip}:${port}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' },
      body: buildRequestBody(sn, limit),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Device SDK HTTP ${res.status}`);
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Device SDK returned non-JSON: ${text.slice(0, 120)}`);
    }
    return {
      Data: Array.isArray(json?.Data) ? json.Data : [],
      IsSession: Boolean(json?.IsSession),
      Result: json?.Result !== false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull all pages following the IsSession loop. Yields each entry as-is from
 * the device (php8 iterates $content->Data per page). Caller owns persistence.
 *
 * @param {object} deps
 * @param {function} [deps.fetch]  injectable fetch (tests)
 * @param {object}  [deps.db]      mysql2 pool/connection (reads tb_device)
 * @param {number}  [deps.limit]   page size (default 100, max 1000)
 * @param {number}  [deps.maxPages] safety cap (default 200) — prevents a
 *                                 runaway session loop from hanging the route
 * @returns {AsyncGenerator<object>} device entries
 */
async function* pullDeviceScanlogs(deps = {}) {
  const fetch = deps.fetch || globalThis.fetch;
  const limit = toPosInt(deps.limit, DEFAULT_LIMIT);
  const maxPages = toPosInt(deps.maxPages, 200, { max: 10000 });
  // deps.device overrides tb_device/env resolution — tests inject it directly.
  const cfg = deps.device || (await resolveDeviceConfig(deps.db));

  let pages = 0;
  let isSession = true;
  while (isSession && pages < maxPages) {
    pages += 1;
    const page = await fetchPage(cfg, { fetch });
    for (const entry of page.Data) {
      yield entry;
    }
    isSession = page.IsSession;
  }
  if (isSession) {
    // Hit the safety cap mid-session — surface so caller can decide.
    throw new Error(`Device SDK session exceeded ${maxPages} pages (safety cap)`);
  }
}

/**
 * Non-streaming variant: collect all entries into an array. Convenience for
 * routes that want the whole batch. Prefer the generator for large pulls.
 */
async function pullAllDeviceScanlogs(deps = {}) {
  const out = [];
  for await (const entry of pullDeviceScanlogs(deps)) {
    out.push(entry);
  }
  return out;
}

// ponytail: device override must be {ip,port,sn}. resolveDeviceConfig returns
// the same shape, so callers can pass a resolved cfg to skip the DB read.
// Ceiling: a full DeviceConfig type if more fields land here.


module.exports = {
  resolveDeviceConfig,
  fetchPage,
  pullDeviceScanlogs,
  pullAllDeviceScanlogs,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
