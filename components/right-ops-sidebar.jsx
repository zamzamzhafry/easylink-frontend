'use client';

import Link from 'next/link';
import { Bell, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestJson } from '@/lib/request-json';
import { cn } from '@/lib/utils';

const REFRESH_MS = 15000;

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'success' || normalized === 'done' || normalized === 'completed') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (normalized === 'running') return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  if (normalized === 'queued' || normalized === 'pending') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'cancelled') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  }
  return 'border-border bg-muted text-muted-foreground';
}

function QueueList({ rows, emptyLabel = 'No jobs' }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (safeRows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {safeRows.slice(0, 5).map((row) => {
        const status = row?.status || 'unknown';
        const label = row?.id ? `#${row.id}` : row?.job_id ? `#${row.job_id}` : 'job';
        return (
          <div
            key={`${label}-${row?.created_at || row?.started_at || status}`}
            className="rounded-lg border border-border bg-background/60 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-foreground">{label}</p>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  statusClass(status)
                )}
              >
                {String(status).toLowerCase()}
              </span>
            </div>
            {row?.action && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{row.action}</p>
            )}
            {row?.error_message && (
              <p className="mt-1 truncate text-[11px] text-rose-300">{row.error_message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RightOpsSidebar({ currentUser }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanlogQueue, setScanlogQueue] = useState({ concurrency: 1, active: 0, pending: 0 });
  const [machineQueue, setMachineQueue] = useState({ concurrency: 1, active: 0, pending: 0 });
  const [scanlogRows, setScanlogRows] = useState([]);
  const [machineRows, setMachineRows] = useState([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const isAdmin = Boolean(currentUser?.is_admin);

  const refreshData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const today = todayIso();
      const [scanlogData, machineData, reviewData] = await Promise.all([
        requestJson('/api/scanlog/sync?limit=6'),
        requestJson('/api/machine?limit=6'),
        requestJson(`/api/attendance/review?from=${today}&to=${today}`),
      ]);

      const reviewRows = Array.isArray(reviewData?.rows) ? reviewData.rows : [];
      const pendingReviews = reviewRows.filter(
        (row) => String(row?.computed_status || 'normal').toLowerCase() !== 'normal'
      ).length;

      setScanlogQueue(scanlogData?.queue || { concurrency: 1, active: 0, pending: 0 });
      setMachineQueue(machineData?.queue || { concurrency: 1, active: 0, pending: 0 });
      setScanlogRows(Array.isArray(scanlogData?.rows) ? scanlogData.rows : []);
      setMachineRows(Array.isArray(machineData?.rows) ? machineData.rows : []);
      setPendingReviewCount(pendingReviews);
      setError('');
    } catch (fetchError) {
      setError(fetchError?.message || 'Failed to load ops status');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshData();
    const timer = setInterval(() => {
      void refreshData();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [isAdmin, refreshData]);

  const debugPreview = useMemo(
    () => ({
      scanlog: scanlogRows[0] || null,
      machine: machineRows[0] || null,
      fetched_at: new Date().toISOString(),
    }),
    [scanlogRows, machineRows]
  );

  if (!isAdmin) return null;

  return (
    <aside className="app-right-sidebar fixed inset-y-0 right-0 z-30 hidden w-80 flex-col border-l border-border bg-card/95 p-4 backdrop-blur xl:flex">
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            <ShieldCheck className="h-4 w-4 text-teal-400" /> Admin Ops
          </p>
          <p className="text-[11px] text-muted-foreground">Queue monitor + review alerts</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshData()}
          className="rounded-lg border border-border bg-background/70 p-2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Refresh right sidebar"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      <Link
        href="/attendance/review"
        className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 transition-colors hover:bg-amber-500/15"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <p className="text-xs font-semibold">Punch-time reviews</p>
          </div>
          <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] font-semibold">
            {pendingReviewCount}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-200/90">
          <Clock3 className="h-3 w-3" />
          Rows that need review today
        </p>
      </Link>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="space-y-4 overflow-y-auto pb-4">
        <section className="rounded-xl border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Scanlog Queue</p>
            <p className="text-[10px] text-muted-foreground">
              Active {scanlogQueue.active}/{scanlogQueue.concurrency} · Pending{' '}
              {scanlogQueue.pending}
            </p>
          </div>
          <QueueList rows={scanlogRows} emptyLabel="No scanlog jobs" />
        </section>

        <section className="rounded-xl border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Machine Queue</p>
            <p className="text-[10px] text-muted-foreground">
              Active {machineQueue.active}/{machineQueue.concurrency} · Pending{' '}
              {machineQueue.pending}
            </p>
          </div>
          <QueueList rows={machineRows} emptyLabel="No machine jobs" />
        </section>

        <details className="rounded-xl border border-border bg-background/30 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
            Admin JSON preview
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-background p-2 text-[11px] text-foreground">
            {JSON.stringify(debugPreview, null, 2)}
          </pre>
        </details>
      </div>
    </aside>
  );
}
