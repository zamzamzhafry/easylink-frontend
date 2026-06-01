"use client";

import { useEffect, useState, useCallback } from 'react';

const SESSION_CACHE_TTL_MS = 30_000;

let sessionCache = {
  user: null,
  error: '',
  statusCode: 0,
  fetchedAt: 0,
};

let inflightSessionPromise = null;

async function fetchAuthSession(force = false) {
  const now = Date.now();
  if (!force && sessionCache.fetchedAt && now - sessionCache.fetchedAt < SESSION_CACHE_TTL_MS) {
    return sessionCache;
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
      sessionCache = {
        user: res.ok && data?.ok ? (data.user || null) : null,
        error: res.ok && data?.ok ? '' : data?.error || data?.message || `HTTP ${res.status}`,
        statusCode: res.status,
        fetchedAt: Date.now(),
      };
      return sessionCache;
    } catch (err) {
      sessionCache = {
        user: null,
        error: err?.message || 'Failed to load session',
        statusCode: 0,
        fetchedAt: Date.now(),
      };
      return sessionCache;
    } finally {
      inflightSessionPromise = null;
    }
  })();

  return inflightSessionPromise;
}

function applySessionCachePatch(next) {
  sessionCache = { ...sessionCache, ...next };
}

/** Reset cache — call after login/logout to force fresh fetch. */
export function resetSessionCache() {
  sessionCache = { user: null, error: '', statusCode: 0, fetchedAt: 0 };
  inflightSessionPromise = null;
}

export function invalidateAuthSession(reason = 'manual') {
  resetSessionCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('easylink-auth-session-invalidated', { detail: { reason } }));
  }
}

export function setOptimisticAuthSession(user, statusCode = 200) {
  applySessionCachePatch({
    user: user || null,
    error: '',
    statusCode,
    fetchedAt: Date.now(),
  });
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
