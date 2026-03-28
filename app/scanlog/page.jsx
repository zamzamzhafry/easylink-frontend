'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, DatabaseZap, Download, RefreshCw } from 'lucide-react';
import InlineStatusPanel from '@/components/ui/inline-status-panel';
import SearchInput from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast-provider';
import {
  TableShell,
  TableHeadRow,
  TableLoadingRow,
  TableEmptyRow,
} from '@/components/ui/table-shell';
import { usePaginatedResource } from '@/hooks/use-paginated-resource';
import { requestJson } from '@/lib/request-json';
import { cn } from '@/lib/utils';

// ─── helpers ───────────────────────────────────────────────────────────────────
function toIso(date) {
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return toIso(new Date());
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIso(d);
}

async function parseApiResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ─── quick presets ─────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Today', from: () => todayIso(), to: () => todayIso() },
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => todayIso() },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => todayIso() },
];

// ─── label maps ────────────────────────────────────────────────────────────────
const VERIFY_LABELS = {
  1: { label: 'Fingerprint', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  20: { label: 'Face Recognition', cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30' },
  30: { label: 'Vein Scan', cls: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30' },
  4: { label: 'Face', cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30' },
  8: { label: 'Palm', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  200: { label: 'Card', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
};

const IO_LABELS = {
  0: { label: 'Check In', cls: 'text-teal-300' },
  1: { label: 'Check Out', cls: 'text-rose-300' },
  2: { label: 'Break Out', cls: 'text-orange-300' },
  3: { label: 'Break In', cls: 'text-orange-200' },
  4: { label: 'OT In', cls: 'text-purple-300' },
  5: { label: 'OT Out', cls: 'text-pink-300' },
};

function VerifyBadge({ mode }) {
  const n = Number(mode ?? 0);
  const map = VERIFY_LABELS[n];
  if (!map) return <span className="font-mono text-xs text-slate-500">{n}</span>;
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        map.cls
      )}
    >
      {map.label}
    </span>
  );
}

function IoLabel({ mode }) {
  const n = Number(mode ?? 0);
  const map = IO_LABELS[n];
  return (
    <span className={cn('text-[11px] font-medium opacity-70', map?.cls ?? 'text-slate-500')}>
      {map?.label ?? String(n)}
    </span>
  );
}

// ─── table headers ─────────────────────────────────────────────────────────────
const HEADERS = [
  { key: 'scan_date', label: 'Date', className: 'w-28' },
  { key: 'scan_time', label: 'Time', className: 'w-24' },
  { key: 'pin', label: 'PIN', className: 'w-28' },
  { key: 'verifymode', label: 'Verify', className: 'w-28' },
  { key: 'iomode', label: 'IO Tag', className: 'w-28' },
  { key: 'workcode', label: 'Work Code', className: 'w-24 text-right' },
  { key: 'sn', label: 'Device SN', className: 'min-w-[140px]' },
];

const LIMIT_OPTIONS = [100, 250, 500, 1000, 2000];

// ─── main page ─────────────────────────────────────────────────────────────────
export default function ScanlogPage() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayIso());
  const [pinFilter, setPinFilter] = useState('');
  const [source, setSource] = useState('legacy');
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    from: daysAgo(6),
    to: todayIso(),
    pin: '',
    source: 'legacy',
  }));
  const [reloadToken, setReloadToken] = useState(0);

  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState('new');
  const [syncMaxPages, setSyncMaxPages] = useState(3);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [queueError, setQueueError] = useState('');

  const toast = useToast();

  const {
    items: records,
    total,
    pages,
    page,
    limit,
    loading,
    error: loadError,
    setPage,
    setLimit,
    load,
    retry,
  } = usePaginatedResource({
    fetchPage: async ({ page, limit, signal }) => {
      const params = new URLSearchParams({
        from: appliedFilters.from,
        to: appliedFilters.to,
        limit: String(limit),
        page: String(page),
        source: appliedFilters.source,
      });
      if (appliedFilters.pin) {
        params.set('pin', appliedFilters.pin);
      }
      return requestJson(`/api/scanlog?${params.toString()}`, { signal });
    },
    initialPage: 1,
    initialLimit: 250,
    dependencies: [
      appliedFilters.from,
      appliedFilters.to,
      appliedFilters.pin,
      appliedFilters.source,
      reloadToken,
    ],
    onError: (message) => toast.error(message),
  });

  // ── apply / search ────────────────────────────────────────────────────────────
  const apply = () => {
    setAppliedFilters({
      from,
      to,
      pin: pinFilter.trim(),
      source,
    });
    setReloadToken((value) => value + 1);
    setPage(1);
  };

  const applyPreset = (preset) => {
    const f = preset.from();
    const t = preset.to();
    setFrom(f);
    setTo(t);
    setAppliedFilters((prev) => ({
      ...prev,
      from: f,
      to: t,
      pin: pinFilter.trim(),
      source,
    }));
    setReloadToken((value) => value + 1);
    setPage(1);
  };

  // ── pagination ────────────────────────────────────────────────────────────────
  const goPage = (p) => {
    const next = Math.max(1, Math.min(p, pages));
    setPage(next);
  };

  // ── CSV download ──────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        from,
        to,
        limit: '5000',
        page: '1',
        source,
        download: '1',
      });
      if (pinFilter.trim()) params.set('pin', pinFilter.trim());
      const res = await fetch(`/api/scanlog?${params.toString()}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scanlog_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setDownloading(false);
    }
  };

  const refreshQueue = useCallback(async (batchId) => {
    if (!batchId) return null;
    try {
      setQueueError('');
      const res = await fetch(`/api/scanlog/sync?batch_id=${batchId}`);
      const data = await parseApiResponse(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.raw || `Queue status failed (${res.status})`);
      }
      return data?.row || null;
    } catch (err) {
      setQueueError(err.message || 'Failed to refresh queue status');
      return null;
    }
  }, []);

  const handleBatchState = useCallback(
    (row) => {
      if (!row) return;
      const status = String(row.status || '').toLowerCase();
      if (status === 'success') {
        toast.success(
          `Batch #${row.id} completed. Pulled ${row.pulled_count || 0}, inserted ${row.inserted_count || 0}.`
        );
        setActiveBatchId(null);
        setSource('safe');
        setAppliedFilters((prev) => ({
          ...prev,
          source: 'safe',
        }));
        setReloadToken((value) => value + 1);
        setPage(1);
      } else if (status === 'failed') {
        toast.error(`Batch #${row.id} failed: ${row.error_message || 'Unknown error'}`);
        setActiveBatchId(null);
      }
    },
    [setPage, toast]
  );

  useEffect(() => {
    if (!activeBatchId) {
      setQueueError('');
      return;
    }

    let closed = false;
    const stream = new EventSource('/api/scanlog/stream?limit=12&interval_ms=4000');

    const onQueue = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        setQueueError('');
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        const matched = rows.find((row) => Number(row?.id || 0) === Number(activeBatchId));
        if (matched) {
          handleBatchState(matched);
        }
      } catch {
        // ignore malformed payload
      }
    };

    const onOpen = () => {
      setQueueError('');
    };

    const onError = () => {
      if (closed) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (typeof EventSource !== 'undefined' && stream.readyState === EventSource.OPEN) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setQueueError('Offline. Waiting for network before reconnecting queue stream...');
        return;
      }
      setQueueError('Realtime queue stream reconnecting...');
    };

    stream.addEventListener('open', onOpen);
    stream.addEventListener('queue', onQueue);
    stream.addEventListener('error', onError);

    return () => {
      closed = true;
      stream.removeEventListener('open', onOpen);
      stream.removeEventListener('queue', onQueue);
      stream.removeEventListener('error', onError);
      stream.close();
    };
  }, [activeBatchId, handleBatchState]);

  useEffect(() => {
    if (!activeBatchId) return;

    let cancelled = false;
    const syncState = async () => {
      const row = await refreshQueue(activeBatchId);
      if (!cancelled) {
        handleBatchState(row);
      }
    };

    void syncState();
    return () => {
      cancelled = true;
    };
  }, [activeBatchId, handleBatchState, refreshQueue]);

  const syncFromMachine = async () => {
    setSyncing(true);
    setQueueError('');

    try {
      const res = await fetch('/api/scanlog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          source: 'windows-sdk',
          mode: syncMode,
          limit: Math.min(limit, 1000),
          page: 1,
          max_pages: syncMaxPages,
          async: true,
        }),
      });

      const data = await parseApiResponse(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.raw || `Sync failed (${res.status})`);
      }

      const batchId = Number(data?.batch_id || 0);
      if (!batchId) {
        throw new Error('Batch id missing from server response');
      }

      setActiveBatchId(batchId);
      const firstState = await refreshQueue(batchId);
      handleBatchState(firstState);

      toast.success(
        `Sync job #${batchId} accepted (${data?.status || 'running'}). Queue: active ${data?.queue?.active || 0}, pending ${data?.queue?.pending || 0}.`
      );
    } catch (err) {
      toast.error(err.message || 'Failed to sync from machine');
    } finally {
      setSyncing(false);
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-white">
              <DatabaseZap className="h-5 w-5 text-teal-400" />
              Scan Log
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Primary analysis should focus on time, date, PIN, and machine SN. IO mode is shown as
              reference only.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Data source:{' '}
              <span className="font-semibold text-teal-300">
                {source === 'safe' ? 'Safe Immutable Store' : 'Legacy Scanlog Table'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] text-slate-400">
              Mode
              <select
                value={syncMode}
                onChange={(event) => setSyncMode(event.target.value)}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
                disabled={syncing}
              >
                <option value="new">New only (recommended)</option>
                <option value="all">All range (heavy)</option>
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-[11px] text-slate-400">
              Max pages
              <select
                value={syncMaxPages}
                onChange={(event) => setSyncMaxPages(Number(event.target.value))}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
                disabled={syncing}
              >
                {[1, 2, 3, 5, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={syncFromMachine}
              disabled={syncing}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Fetch From Machine'}
            </button>
            <button
              type="button"
              onClick={() => {
                setReloadToken((value) => value + 1);
                retry();
              }}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {syncMode === 'all' && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Full-range download may take several minutes and keeps the Windows SDK busy. Use this
            mode only when absolutely necessary; prefer the default "New" mode for incremental
            syncs.
          </div>
        )}

        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs">
          <Link
            href="/attendance"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition-colors hover:border-teal-500 hover:text-teal-300"
          >
            Attendance Summary
          </Link>
          <Link
            href="/attendance/review"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition-colors hover:border-amber-500 hover:text-amber-300"
          >
            Attendance Review
          </Link>
          <Link
            href="/schedule"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 transition-colors hover:border-violet-500 hover:text-violet-300"
          >
            Schedule Planner
          </Link>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* From */}
            <div>
              <label
                htmlFor="scanlog-from"
                className="mb-1 block text-[11px] font-medium text-slate-500"
              >
                From
              </label>
              <input
                id="scanlog-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* To */}
            <div>
              <label
                htmlFor="scanlog-to"
                className="mb-1 block text-[11px] font-medium text-slate-500"
              >
                To
              </label>
              <input
                id="scanlog-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
              />
            </div>

            {/* PIN filter */}
            <SearchInput
              value={pinFilter}
              onChange={setPinFilter}
              placeholder="Search PIN..."
              className="w-48"
            />

            {/* Limit */}
            <div>
              <label
                htmlFor="scanlog-limit"
                className="mb-1 block text-[11px] font-medium text-slate-500"
              >
                Per page
              </label>
              <select
                id="scanlog-limit"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
              >
                {LIMIT_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="scanlog-source"
                className="mb-1 block text-[11px] font-medium text-slate-500"
              >
                Source
              </label>
              <select
                id="scanlog-source"
                value={source}
                onChange={(event) => {
                  const nextSource = event.target.value;
                  setSource(nextSource);
                  setAppliedFilters((prev) => ({
                    ...prev,
                    source: nextSource,
                  }));
                  setReloadToken((value) => value + 1);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
              >
                <option value="legacy">Legacy (tb_scanlog)</option>
                <option value="safe">Safe Store (tb_scanlog_safe_events)</option>
              </select>
            </div>

            {/* Apply */}
            <button
              type="button"
              onClick={apply}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Apply
            </button>

            {/* Quick presets */}
            <div className="ml-auto flex items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-teal-600 hover:text-teal-300"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-3 flex items-center gap-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
            <span>
              Showing <span className="font-semibold text-slate-300">{records.length}</span> of{' '}
              <span className="font-semibold text-slate-300">{total.toLocaleString()}</span> records
            </span>
            {pages > 1 && (
              <span>
                Page <span className="font-semibold text-slate-300">{page}</span> /{' '}
                <span className="font-semibold text-slate-300">{pages}</span>
              </span>
            )}
          </div>
        </div>

        <InlineStatusPanel
          message={loadError}
          variant="error"
          actionLabel="Retry"
          onAction={retry}
        />

        <InlineStatusPanel message={queueError} variant="warning" />

        {/* Table */}
        <TableShell>
          <table className="w-full text-sm">
            <thead>
              <TableHeadRow headers={HEADERS} />
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <TableLoadingRow colSpan={HEADERS.length} />
              ) : records.length === 0 ? (
                <TableEmptyRow colSpan={HEADERS.length} label="No scan records found" />
              ) : (
                records.map((r) => (
                  <tr
                    key={`${r.pin}-${r.scan_date}-${r.scan_time}-${r.verifymode}-${r.iomode}-${r.workcode}-${r.sn}`}
                    className="hover:bg-slate-800/40"
                  >
                    {/* Date */}
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{r.scan_date}</td>

                    {/* Time */}
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-white">
                      {r.scan_time}
                    </td>

                    {/* PIN */}
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-teal-300">
                      {r.pin}
                    </td>

                    {/* Verify */}
                    <td className="px-4 py-2.5">
                      <VerifyBadge mode={r.verifymode} />
                    </td>

                    {/* IO Mode */}
                    <td className="px-4 py-2.5">
                      <IoLabel mode={r.iomode} />
                    </td>

                    {/* Work Code */}
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                      {r.workcode}
                    </td>

                    {/* SN */}
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                      {r.sn || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableShell>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => goPage(page - 1)}
              disabled={page <= 1 || loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Page numbers — show up to 7 around current */}
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && arr[idx - 1] !== p - 1) acc.push(`ellipsis-${arr[idx - 1]}-${p}`);
                acc.push(p);
                return acc;
              }, [])
              .map((item) =>
                typeof item === 'string' && item.startsWith('ellipsis-') ? (
                  <span key={item} className="px-1 text-xs text-slate-600">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => goPage(item)}
                    disabled={loading}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium',
                      item === page
                        ? 'bg-teal-600 text-white'
                        : 'border border-slate-700 text-slate-400 hover:text-white'
                    )}
                  >
                    {item}
                  </button>
                )
              )}

            <button
              type="button"
              onClick={() => goPage(page + 1)}
              disabled={page >= pages || loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-white disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
