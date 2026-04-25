"use client";

import { useEffect, useState, useCallback } from 'react';

export default function useAuthSession() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data?.ok) {
        setUser(data.user || null);
      } else {
        setUser(null);
        if (data?.error || data?.message) setError(data.error || data.message);
      }
    } catch (err) {
      setUser(null);
      setError(err?.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { user, loading, error, refresh: load };
}
