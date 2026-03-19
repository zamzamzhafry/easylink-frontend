'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  CalendarCheck,
  DatabaseZap,
  Download,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TableShell,
  TableHeadRow,
  TableLoadingRow,
  TableEmptyRow,
} from '@/components/ui/table-shell';
import { useToast } from '@/components/ui/toast-provider';

// ─── verify/io maps ────────────────────────────────────────────────────────────
const VERIFY_MAP = {
  1: 'Fingerprint',
  20: 'Face Recognition',
  30: 'Vein Scan',
  4: 'Face',
  8: 'Palm',
  200: 'Card',
};
const IO_MAP = {
  0: { label: 'Check In', cls: 'text-teal-400' },
  1: { label: 'Check Out', cls: 'text-rose-400' },
  2: { label: 'Break Out', cls: 'text-orange-300' },
  3: { label: 'Break In', cls: 'text-orange-200' },
  4: { label: 'OT In', cls: 'text-purple-300' },
  5: { label: 'OT Out', cls: 'text-pink-300' },
};

const SHIFT_ICON_EMOJI = {
  sun: '☀️',
  sunset: '🌇',
  moon: '🌙',
  briefcase: '💼',
  bed: '🛌',
  plane: '✈️',
  star: '⭐',
  shield: '🛡️',
};

function shiftIconForKey(key) {
  return SHIFT_ICON_EMOJI[key] || '🕒';
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Shift Radar / Pentagon Chart ─────────────────────────────────────────────
/**
 * Renders an SVG spider/radar chart.
 * Up to 8 axes — one per distinct shift type.
 * Each axis: value = count of scheduled days for that shift.
 */
function ShiftRadarChart({ shiftStats }) {
  const cx = 140;
  const cy = 140;
  const r = 110;
  const levels = 4;

  // Take up to 8 shifts for chart axes
  const data = useMemo(() => shiftStats.slice(0, 8), [shiftStats]);
  const n = data.length;

  if (n < 2) return null;

  const maxVal = Math.max(...data.map((d) => d.total), 1);

  // Compute angle for each axis (start top, go clockwise)
  function axisPoint(i, fraction) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: cx + r * fraction * Math.cos(angle),
      y: cy + r * fraction * Math.sin(angle),
    };
  }

  // Polygon points for a given fraction
  function polygonPoints(fraction) {
    return data
      .map((_, i) => {
        const p = axisPoint(i, fraction);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  }

  // Data polygon points
  const dataPoints = data.map((d, i) => {
    const fraction = d.total / maxVal;
    const p = axisPoint(i, Math.max(fraction, 0.04));
    return `${p.x},${p.y}`;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="280" height="280" viewBox="0 0 280 280" className="overflow-visible">
        <title>Shift radar chart</title>
        {/* Background rings */}
        {Array.from({ length: levels }, (_, lvl) => {
          const f = (lvl + 1) / levels;
          return (
            <polygon
              key={`ring-${f.toFixed(2)}`}
              points={polygonPoints(f)}
              fill="none"
              stroke="#334155"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {data.map((d, i) => {
          const outer = axisPoint(i, 1);
          return (
            <line
              key={`axis-${d.nama_shift}`}
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke="#334155"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={dataPoints.join(' ')}
          fill="rgba(20,184,166,0.20)"
          stroke="#14b8a6"
          strokeWidth="2"
        />

        {/* Data dots */}
        {data.map((d, i) => {
          const fraction = d.total / maxVal;
          const p = axisPoint(i, Math.max(fraction, 0.04));
          return (
            <circle
              key={`dot-${d.nama_shift}`}
              cx={p.x}
              cy={p.y}
              r="4"
              fill={d.color_hex || '#14b8a6'}
              stroke="#0f172a"
              strokeWidth="1.5"
            />
          );
        })}

        {/* Axis labels */}
        {data.map((d, i) => {
          const lp = axisPoint(i, 1.22);
          const anchor = lp.x < cx - 4 ? 'end' : lp.x > cx + 4 ? 'start' : 'middle';
          return (
            <text
              key={`label-${d.nama_shift}`}
              x={lp.x}
              y={lp.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize="10"
              fill="#94a3b8"
              className="select-none"
            >
              {d.nama_shift}
            </text>
          );
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" fill="#334155" />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
        {data.map((d) => (
          <div key={d.nama_shift} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.color_hex || '#6B7280' }}
            />
            <span className="text-xs text-slate-400">
              {d.nama_shift} <span className="font-semibold text-white">{d.total}d</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shift bar breakdown ───────────────────────────────────────────────────────
function ShiftBreakdown({ shiftStats }) {
  const total = shiftStats.reduce((s, d) => s + d.total, 0);
  if (total === 0) return <p className="text-xs text-slate-500 italic">No schedule data</p>;

  return (
    <div className="space-y-2">
      {shiftStats.map((d) => (
        <div key={d.nama_shift}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color_hex }} />
              <span className="text-slate-300">{d.nama_shift}</span>
              {d.is_paid && (
                <span className="rounded border border-teal-500/30 bg-teal-500/10 px-1 py-0.5 text-[10px] text-teal-400">
                  Paid
                </span>
              )}
            </span>
            <span className="font-semibold text-white">
              {d.total}d{' '}
              <span className="font-normal text-slate-500">
                ({Math.round((d.total / total) * 100)}%)
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.total / total) * 100}%`,
                backgroundColor: d.color_hex || '#6B7280',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── info card helper ──────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-200">{value ?? '—'}</span>
    </div>
  );
}

// ─── Scanlog table headers ─────────────────────────────────────────────────────
const SCAN_HEADERS = [
  { key: 'scan_date', label: 'Date', className: 'w-28' },
  { key: 'scan_time', label: 'Time', className: 'w-24' },
  { key: 'verifymode', label: 'Verify', className: 'w-24' },
  { key: 'iomode', label: 'IO', className: 'w-28' },
  { key: 'workcode', label: 'Code', className: 'w-16 text-right' },
  { key: 'sn', label: 'Device SN', className: '' },
];

// ─── Schedule table headers ────────────────────────────────────────────────────
const SCHED_HEADERS = [
  { key: 'tanggal', label: 'Date', className: 'w-28' },
  { key: 'nama_shift', label: 'Shift', className: '' },
  { key: 'jam', label: 'Hours', className: 'w-36' },
  { key: 'catatan', label: 'Note', className: '' },
];

// ─── Tab IDs ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'schedule', label: 'Schedule', icon: CalendarCheck },
  { id: 'scanlog', label: 'Scan Log', icon: DatabaseZap },
];

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function EmployeeProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/${id}/profile`);
      if (res.status === 403) {
        toast.error('Not authorized to view this profile');
        router.push('/employees');
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setData(json);
    } catch (err) {
      toast.error(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [id, router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const employee = data?.employee;
  const schedule = data?.schedule ?? [];
  const scanlogs = data?.scanlogs ?? [];
  const shiftStats = data?.shiftStats ?? [];

  const totalScheduled = shiftStats.reduce((s, d) => s + d.total, 0);

  const exportSummaryCsv = useCallback(() => {
    if (!employee) return;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const upcomingCount = schedule.filter((item) => {
      const date = new Date(item.tanggal);
      return date >= todayDate;
    }).length;
    const uniqueDays = new Set(scanlogs.map((r) => `${r.scan_date}`)).size;

    const rows = [
      ['Name', employee.nama || ''],
      ['PIN', employee.pin || ''],
      ['Group', employee.nama_group || ''],
      ['Total Scheduled Days', totalScheduled],
      ['Upcoming Days', upcomingCount],
      ['Scan Days (90d)', uniqueDays],
      ['Total Scans (90d)', scanlogs.length],
      ...shiftStats.map((item) => [`Shift ${item.nama_shift}`, item.total]),
    ];
    downloadCsv(`employee_summary_${employee.pin || id}.csv`, ['Metric', 'Value'], rows);
  }, [employee, id, scanlogs, schedule, shiftStats, totalScheduled]);

  const exportScheduleCsv = useCallback(() => {
    if (!employee) return;
    const rows = schedule.map((s) => [
      s.tanggal,
      s.nama_shift,
      shiftIconForKey(s.icon_key),
      s.icon_key || '',
      s.color_hex || '',
      s.jam_masuk || '',
      s.jam_keluar || '',
      s.next_day ? 'yes' : 'no',
      s.is_paid ? 'paid' : 'unpaid',
      s.needs_scan ? 'scan-required' : 'no-scan',
      s.catatan || '',
    ]);
    downloadCsv(
      `employee_schedule_${employee.pin || id}.csv`,
      [
        'Date',
        'Shift',
        'Shift Icon',
        'Icon Key',
        'Color Hex',
        'Time In',
        'Time Out',
        'Next Day',
        'Pay Type',
        'Needs Scan',
        'Note',
      ],
      rows
    );
  }, [employee, id, schedule]);

  const exportScanlogCsv = useCallback(() => {
    if (!employee) return;
    const rows = scanlogs.map((r) => [
      r.scan_date,
      r.scan_time,
      r.pin,
      VERIFY_MAP[r.verifymode] ?? r.verifymode,
      IO_MAP[r.iomode]?.label ?? String(r.iomode),
      r.workcode,
      r.sn || '',
    ]);
    downloadCsv(
      `employee_scanlog_${employee.pin || id}.csv`,
      ['Date', 'Time', 'PIN', 'Verify', 'IO Mode', 'Workcode', 'Device SN'],
      rows
    );
  }, [employee, id, scanlogs]);
  const uniqueScanDays = useMemo(() => {
    const s = new Set(scanlogs.map((r) => r.scan_date));
    return s.size;
  }, [scanlogs]);

  // upcoming (today or future)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = schedule.filter((s) => s.tanggal && s.tanggal >= today);
  const past = schedule.filter((s) => s.tanggal && s.tanggal < today);

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          Loading profile…
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 text-center text-slate-500">
        Employee not found.{' '}
        <Link href="/employees" className="text-teal-400 hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      {/* Back + title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/employees"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-teal-500/50 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">
              {employee.nama || employee.pin || 'Unknown'}
            </h1>
            <p className="text-xs text-slate-500">
              PIN {employee.pin ?? '—'}
              {employee.nama_group && (
                <>
                  {' '}
                  · <span className="text-teal-400">{employee.nama_group}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={
            tab === 'scanlog'
              ? exportScanlogCsv
              : tab === 'schedule'
                ? exportScheduleCsv
                : exportSummaryCsv
          }
          className="inline-flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-medium text-teal-300 hover:bg-teal-500/20"
        >
          <Download className="h-3.5 w-3.5" />
          {tab === 'scanlog'
            ? 'Export Scan Log'
            : tab === 'schedule'
              ? 'Export Schedule'
              : 'Export Summary'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Scheduled', value: `${totalScheduled}d`, color: 'text-teal-400' },
          { label: 'Upcoming', value: `${upcoming.length}d`, color: 'text-violet-400' },
          { label: 'Scan Days', value: uniqueScanDays.toLocaleString(), color: 'text-amber-400' },
          {
            label: 'Total Scans',
            value: scanlogs.length.toLocaleString(),
            color: 'text-emerald-400',
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center"
          >
            <div className={cn('text-2xl font-bold tabular-nums', color)}>{value}</div>
            <div className="mt-1 text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
        {TABS.map(({ id: tid, label, icon: Icon }) => (
          <button
            key={tid}
            type="button"
            onClick={() => setTab(tid)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors',
              tab === tid ? 'bg-teal-600 text-white shadow' : 'text-slate-400 hover:text-white'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW tab ───────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Employee Info */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <User className="h-4 w-4 text-teal-400" /> Employee Info
            </h2>
            <div className="divide-y divide-slate-800">
              <InfoRow label="Name" value={employee.nama} />
              <InfoRow label="PIN" value={employee.pin} />
              <InfoRow label="NIP" value={employee.nip} />
              <InfoRow label="RFID" value={employee.rfid} />
              <InfoRow label="Group" value={employee.nama_group} />
              <InfoRow
                label="Contract Start"
                value={employee.awal_kontrak ? String(employee.awal_kontrak).slice(0, 10) : null}
              />
              <InfoRow
                label="Contract End"
                value={employee.akhir_kontrak ? String(employee.akhir_kontrak).slice(0, 10) : null}
              />
              <InfoRow
                label="Status"
                value={
                  <span className={employee.isActiveDuty ? 'text-teal-400' : 'text-slate-500'}>
                    {employee.isActiveDuty ? 'Active Duty' : 'Inactive'}
                  </span>
                }
              />
            </div>
          </div>

          {/* Shift Radar Chart */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Briefcase className="h-4 w-4 text-teal-400" /> Shift Breakdown
              <span className="ml-auto text-xs font-normal text-slate-500">
                all-time · {totalScheduled} scheduled days
              </span>
            </h2>

            {shiftStats.length < 2 ? (
              <ShiftBreakdown shiftStats={shiftStats} />
            ) : (
              <div className="space-y-5">
                <ShiftRadarChart shiftStats={shiftStats} />
                <ShiftBreakdown shiftStats={shiftStats} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SCHEDULE tab ────────────────────────────────────────────────────────── */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          {/* Upcoming badge */}
          {upcoming.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
              <Calendar className="h-4 w-4" />
              {upcoming.length} upcoming shifts (next 30 days)
            </div>
          )}

          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <TableHeadRow headers={SCHED_HEADERS} />
              </thead>
              <tbody className="divide-y divide-slate-800">
                {schedule.length === 0 ? (
                  <TableEmptyRow
                    colSpan={SCHED_HEADERS.length}
                    label="No schedule in this period"
                  />
                ) : (
                  schedule.map((s) => {
                    const isFuture = s.tanggal >= today;
                    return (
                      <tr
                        key={s.id}
                        className={cn('hover:bg-slate-800/40', isFuture && 'bg-violet-500/5')}
                      >
                        {/* Date */}
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-slate-300">{s.tanggal}</span>
                          {isFuture && (
                            <span className="ml-1.5 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">
                              upcoming
                            </span>
                          )}
                        </td>

                        {/* Shift name badge */}
                        <td className="px-4 py-2.5">
                          <span
                            className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              borderColor: `${s.color_hex}55`,
                              backgroundColor: `${s.color_hex}18`,
                              color: s.color_hex,
                            }}
                          >
                            <span className="mr-1">{shiftIconForKey(s.icon_key)}</span>
                            {s.nama_shift}
                          </span>
                        </td>

                        {/* Hours */}
                        <td className="px-4 py-2.5 text-xs text-slate-400">
                          {s.jam_masuk && s.jam_keluar ? (
                            <>
                              {s.jam_masuk} → {s.jam_keluar}
                              {s.next_day && (
                                <span className="ml-1 text-[10px] text-amber-400">+1d</span>
                              )}
                            </>
                          ) : (
                            <span className="italic text-slate-600">
                              {s.needs_scan ? 'Flexible' : 'Off'}
                            </span>
                          )}
                        </td>

                        {/* Note */}
                        <td className="px-4 py-2.5 text-xs text-slate-500">{s.catatan || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableShell>

          {past.length > 0 && upcoming.length > 0 && (
            <p className="text-right text-xs text-slate-600">
              Showing {schedule.length} entries (90 days past + 30 days future)
            </p>
          )}
        </div>
      )}

      {/* ── SCANLOG tab ─────────────────────────────────────────────────────────── */}
      {tab === 'scanlog' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Last 90 days · <span className="font-semibold text-slate-300">{scanlogs.length}</span>{' '}
              records · <span className="font-semibold text-slate-300">{uniqueScanDays}</span>{' '}
              unique days
            </p>
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <TableHeadRow headers={SCAN_HEADERS} />
              </thead>
              <tbody className="divide-y divide-slate-800">
                {scanlogs.length === 0 ? (
                  <TableEmptyRow
                    colSpan={SCAN_HEADERS.length}
                    label="No scans in the last 90 days"
                  />
                ) : (
                  scanlogs.map((r) => {
                    const io = IO_MAP[r.iomode];
                    return (
                      <tr
                        key={`${r.scan_date}-${r.scan_time}-${r.pin}-${r.sn || 'nosn'}-${r.workcode}`}
                        className="hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-2 font-mono text-xs text-slate-300">
                          {r.scan_date}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs font-semibold text-white">
                          {r.scan_time}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-400">
                          {VERIFY_MAP[r.verifymode] ?? r.verifymode}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2 text-xs font-medium',
                            io?.cls ?? 'text-slate-400'
                          )}
                        >
                          {io?.label ?? String(r.iomode)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-slate-500">
                          {r.workcode}
                        </td>
                        <td className="px-4 py-2 font-mono text-[11px] text-slate-600">
                          {r.sn || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableShell>
        </div>
      )}
    </div>
  );
}
