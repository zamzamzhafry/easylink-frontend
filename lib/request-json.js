function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ponytail: dedup concurrent identical GETs + 2s TTL cache. Kills dev
// StrictMode double-fetch and cross-component duplicate calls. Mutations
// bypass cache. Ceiling: for shared data needing longer freshness, raise TTL
// or move to SWR/React Query. Upgrade path: add revalidation hook.
const DEDUP_TTL_MS = 2000;
const inflight = new Map(); // key -> Promise
const cache = new Map(); // key -> { data, expiresAt }

function dedupKey(input, init) {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') return null;
  // ponytail: skip dedup/cache when caller passes an AbortSignal — the
  // request is caller-scoped (e.g. usePaginatedResource), and caching an
  // abortable promise hands a rejection to the next caller → empty results.
  // Ceiling: per-caller AbortController dedup needs request-scoped keys.
  if (init?.signal) return null;
  return `${method} ${input}`;
}

export async function requestJson(input, init) {
  const key = dedupKey(input, init);
  if (key) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const run = (async () => {
    const response = await fetch(input, init);
    const text = await response.text();
    const data = parseJsonSafely(text);

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `Request failed with status ${response.status}`);
    }

    if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  })();

  if (key) {
    inflight.set(key, run);
    run.then((data) => {
      cache.set(key, { data, expiresAt: Date.now() + DEDUP_TTL_MS });
      setTimeout(() => {
        if (cache.get(key)?.expiresAt <= Date.now()) cache.delete(key);
      }, DEDUP_TTL_MS + 50);
    }).catch(() => {}).finally(() => {
      inflight.delete(key);
    });
  }

  return run;
}

// ponytail: test-only escape hatch to reset dedup state between cases.
// Ceiling: none — production never clears this.
export function __clearDedupCache() {
  inflight.clear();
  cache.clear();
}
