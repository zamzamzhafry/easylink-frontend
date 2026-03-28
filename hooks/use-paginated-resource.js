'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveItemsFromPayload } from '@/lib/pagination';

const DEFAULT_ITEM_KEYS = ['items', 'rows', 'records', 'users'];

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePayload(data, { page, limit, itemKeys }) {
  const items = resolveItemsFromPayload(data, itemKeys);
  const total = Math.max(0, toNumber(data?.total, items.length));
  const normalizedLimit = Math.max(1, toNumber(data?.limit, limit));
  const fallbackPages = Math.max(1, Math.ceil(total / normalizedLimit));
  const pages = Math.max(1, toNumber(data?.pages, fallbackPages));
  const normalizedPage = Math.min(Math.max(1, toNumber(data?.page, page)), pages);

  return {
    items,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    pages,
    raw: data,
  };
}

export function usePaginatedResource({
  fetchPage,
  initialPage = 1,
  initialLimit = 20,
  itemKeys = DEFAULT_ITEM_KEYS,
  enabled = true,
  auto = true,
  dependencies = [],
  onError,
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(Math.max(1, Number(initialPage) || 1));
  const [limit, setLimit] = useState(Math.max(1, Number(initialLimit) || 20));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState(null);

  const abortRef = useRef(null);
  const fetchPageRef = useRef(fetchPage);
  const itemKeysRef = useRef(itemKeys);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  useEffect(() => {
    itemKeysRef.current = itemKeys;
  }, [itemKeys]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const load = useCallback(
    async (options = {}) => {
      if (!enabled) {
        return null;
      }

      const targetPage = Math.max(1, Number(options.page ?? page) || 1);
      const targetLimit = Math.max(1, Number(options.limit ?? limit) || 1);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError('');

      try {
        const data = await fetchPageRef.current({
          page: targetPage,
          limit: targetLimit,
          signal: controller.signal,
        });

        const normalized = normalizePayload(data, {
          page: targetPage,
          limit: targetLimit,
          itemKeys: itemKeysRef.current,
        });

        setItems(normalized.items);
        setTotal(normalized.total);
        setPages(normalized.pages);
        setRaw(normalized.raw);

        if (normalized.page !== page) {
          setPage(normalized.page);
        }
        if (normalized.limit !== limit) {
          setLimit(normalized.limit);
        }

        return normalized;
      } catch (err) {
        if (err?.name === 'AbortError') {
          return null;
        }

        const message = err?.message || 'Failed to load data';
        setItems([]);
        setTotal(0);
        setPages(1);
        setRaw(null);
        setError(message);

        if (typeof onErrorRef.current === 'function') {
          onErrorRef.current(message, err);
        }

        return null;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [enabled, limit, page]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !auto) return;
    void load();
  }, [auto, enabled, load, ...dependencies]);

  const retry = useCallback(() => load(), [load]);

  return {
    items,
    total,
    pages,
    page,
    limit,
    loading,
    error,
    raw,
    setPage,
    setLimit,
    setError,
    load,
    retry,
  };
}
