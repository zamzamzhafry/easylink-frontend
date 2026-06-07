"use client";

import { useEffect, useState, useCallback } from 'react';

const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_STORAGE_KEY = 'easylink_auth_session_cache';

let sessionCache = {
  user: null,
  error: '',
  statusCode: 0,
  fetchedAt: 0,
};

let inflightSessionPromise = null;

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readStoredSessionCache() {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      user: parsed.user || null,
      error: typeof parsed.error === 'string' ? parsed.error : '',
      statusCode: Number.isFinite(parsed.statusCode) ? parsed.statusCode : 0,
      fetchedAt: Number.isFinite(parsed.fetchedAt) ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeStoredSessionCache(nextCache) {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(SESSION_CACHE_STORAGE_KEY, JSON.stringify(nextCache));
  } catch {}
}

function clearStoredSessionCache() {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.removeItem(SESSION_CACHE_STORAGE_KEY);
  } catch {}
}

function applySessionCache(nextCache) {
  sessionCache = nextCache;
  if (nextCache.statusCode === 200 || nextCache.statusCode === 401) {
    writeStoredSessionCache(nextCache);
  } else {
    clearStoredSessionCache();
  }
  return sessionCache;
}

function getCachedSession(force = false) {
  const now = Date.now();
  if (!force && sessionCache.fetchedAt && now - sessionCache.fetchedAt < SESSION_CACHE_TTL_MS) {
    return sessionCache;
  }

  const storedCache = readStoredSessionCache();
  if (!force && storedCache?.fetchedAt && now - storedCache.fetchedAt < SESSION_CACHE_TTL_MS) {
    sessionCache = storedCache;
    return sessionCache;
  }

  return null;
}

async function fetchAuthSession(force = false) {
  const cachedSession = getCachedSession(force);
  if (cachedSession) {
    return cachedSession;
  }

  if (!force && inflightSessionPromise) {
    return inflightSessionPromise;
  }

  inflightSessionPromise = (async () => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      return applySessionCache({
        user: res.ok && data?.ok ? (data.user || null) : null,
        error: res.ok && data?.ok ? '' : data?.error || data?.message || `HTTP ${res.status}`,
        statusCode: res.status,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      return applySessionCache({
        user: null,
        error: err?.message || 'Failed to load session',
        statusCode: 0,
        fetchedAt: Date.now(),
      });
    } finally {
      inflightSessionPromise = null;
    }
  })();

  return inflightSessionPromise;
}

/** Reset cache — call after login/logout to force fresh fetch. */
export function resetSessionCache() {
  sessionCache = { user: null, error: '', statusCode: 0, fetchedAt: 0 };
  inflightSessionPromise = null;
  clearStoredSessionCache();
}

export { fetchAuthSession };

export default function useAuthSession() {
  const [user, setUser] = useState(sessionCache.fetchedAt ? sessionCache.user : null);
  const [loading, setLoading] = useState(!sessionCache.fetchedAt);
  const [error, setError] = useState(sessionCache.fetchedAt ? sessionCache.error : '');
  const [statusCode, setStatusCode] = useState(sessionCache.fetchedAt ? sessionCache.statusCode : 0);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const next = await fetchAuthSession(force);
    setUser(next.user || null);
    setError(next.error || '');
    setStatusCode(next.statusCode || 0);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { user, loading, error, statusCode, refresh };
}
