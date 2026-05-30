"use client";

import { useEffect, useState, useCallback } from 'react';

const SESSION_CACHE_TTL_MS = 30_000;

let sessionCache = {
  user: null,
  error: '',
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
      const data = await res.json();
      sessionCache = {
        user: data?.ok ? (data.user || null) : null,
        error: data?.ok ? '' : data?.error || data?.message || '',
        fetchedAt: Date.now(),
      };
      return sessionCache;
    } catch (err) {
      sessionCache = {
        user: null,
        error: err?.message || 'Failed to load session',
        fetchedAt: Date.now(),
      };
      return sessionCache;
    } finally {
      inflightSessionPromise = null;
    }
  })();

  return inflightSessionPromise;
}

export default function useAuthSession() {
  const [user, setUser] = useState(sessionCache.fetchedAt ? sessionCache.user : null);
  const [loading, setLoading] = useState(!sessionCache.fetchedAt);
  const [error, setError] = useState(sessionCache.fetchedAt ? sessionCache.error : '');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const next = await fetchAuthSession(force);
    setUser(next.user || null);
    setError(next.error || '');
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { user, loading, error, refresh };
}
