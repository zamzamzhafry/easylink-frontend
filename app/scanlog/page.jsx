'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, DatabaseZap, Download, RefreshCw } from 'lucide-react';
import SearchInput from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast-provider';
import {
  TableShell,
  TableHeadRow,
  TableLoadingRow,
  TableEmptyRow,
} from '@/components/ui/table-shell';
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

// ─── quick presets ─────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Today', from: () => todayIso(), to: () => todayIso() },
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => todayIso() },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => todayIso() },
];

// ─── label maps ────────────────────────────────────────────────────────────────
const VERIFY_LABELS = {
  1: { label: 'Finger', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
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
  const [limit, setLimit] = useState(250);
  const [page, setPage] = useState(1);

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const toast = useToast();

  // ── fetch ─────────────────────────────────────────────────────────────────────
  const load = useCallback(
    async (overridePage) => {
      setLoading(true);
      const p = overridePage ?? page;
      try {
        const params = new URLSearchParams({
          from,
          to,
          limit: String(limit),
          page: String(p),
        });
        if (pinFilter.trim()) params.set('pin', pinFilter.trim());

        const res = await fetch(`/api/scanlog?${params.toString()}`);
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        setRecords(data.records ?? []);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
      } catch (err) {
        toast.error(err.message || 'Failed to load scanlog');
      } finally {
        setLoading(false);
      }
    },
    [from, to, pinFilter, limit, page, toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  // ── apply / search ────────────────────────────────────────────────────────────
  const apply = () => {
    setPage(1);
    load(1);
  };

  const applyPreset = (preset) => {
    const f = preset.from();
    const t = preset.to();
    setFrom(f);
    setTo(t);
    setPage(1);
    // Pass updated values directly since state update is async
    setTimeout(() => load(1), 0);
  };

  // ── pagination ────────────────────────────────────────────────────────────────
  const goPage = (p) => {
    const next = Math.max(1, Math.min(p, pages));
    setPage(next);
    load(next);
  };

  // ── CSV download ──────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ from, to, limit: '5000', page: '1', download: '1' });
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

  // ─── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 p-6">
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
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              load(1);
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
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            >
              {LIMIT_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
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
  );
}
