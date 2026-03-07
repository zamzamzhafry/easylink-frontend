'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, LineChart } from 'lucide-react';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';

function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function monthStart(value = new Date()) {
  const date = new Date(value);
  date.setDate(1);
  return isoDate(date);
}

function trendPoints(data, width, height, padding) {
  if (!data.length) return '';
  const maxValue = Math.max(1, ...data.map((item) => item.late));
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  return data
    .map((item, index) => {
      const x = padding + (data.length === 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);
      const y = padding + innerH - (item.late / maxValue) * innerH;
      return `${x},${y}`;
    })
    .join(' ');
}

function StatCard({ label, value, className }) {
  return (
    <div className={`rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 ${className || ''}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-mono text-lg font-bold text-white">{value}</p>
    </div>
  );
}

export default function PerformancePage() {
  const { warning } = useToast();
  const [auth, setAuth] = useState(null);
  const [groups, setGroups] = useState([]);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [data, setData] = useState({ rows: [], summary: [], daily: [] });
  const [loading, setLoading] = useState(false);

  const loadAuth = useCallback(async () => {
    try {
      const me = await requestJson('/api/auth/me');
      const user = me?.user || null;
      setAuth(user);

      if (user?.is_admin) {
        const groupData = await requestJson('/api/groups');
        setGroups(Array.isArray(groupData?.groups) ? groupData.groups : []);
      } else {
        setGroups((user?.groups || []).map((item) => ({ id: item.group_id, nama_group: item.nama_group })));
      }
    } catch {
      setAuth(null);
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      if (groupId) query.set('group_id', groupId);
      if (employeeId) query.set('employee_id', employeeId);
      const result = await requestJson(`/api/performance?${query.toString()}`);
      setData({
        rows: Array.isArray(result?.rows) ? result.rows : [],
        summary: Array.isArray(result?.summary) ? result.summary : [],
        daily: Array.isArray(result?.daily) ? result.daily : [],
      });
    } catch (error) {
      warning(error.message || 'Failed to load performance dashboard.', 'Dashboard request failed');
    } finally {
      setLoading(false);
    }
  }, [employeeId, from, groupId, to, warning]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setEmployeeId('');
  }, [groupId]);

  const totals = useMemo(() => {
    return data.summary.reduce(
      (acc, item) => {
        acc.totalDays += item.total_days;
        acc.onTime += item.on_time_days;
        acc.late += item.late_days;
        acc.early += item.early_days;
        acc.anomaly += item.anomaly_days;
        return acc;
      },
      { totalDays: 0, onTime: 0, late: 0, early: 0, anomaly: 0 }
    );
  }, [data.summary]);

  const employeeOptions = useMemo(
    () =>
      data.summary.map((item) => ({
        id: item.employee_id,
        label: `${item.nama} (${item.pin})`,
      })),
    [data.summary]
  );

  const topLate = useMemo(() => data.summary.slice(0, 12), [data.summary]);
  const maxLate = useMemo(
    () => (topLate.length ? Math.max(...topLate.map((item) => item.late_days), 1) : 1),
    [topLate]
  );
  const line = useMemo(() => trendPoints(data.daily, 760, 220, 26), [data.daily]);
  const maxDailyLate = useMemo(
    () => (data.daily.length ? Math.max(...data.daily.map((item) => item.late), 1) : 1),
    [data.daily]
  );

  const downloadBatch = () => {
    const query = new URLSearchParams({ from, to, download: '1' });
    if (groupId) query.set('group_id', groupId);
    if (employeeId) query.set('employee_id', employeeId);
    window.location.href = `/api/performance?${query.toString()}`;
  };

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Analytics</p>
          <h1 className="text-3xl font-bold text-white">Profile Performance Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Per employee trend for on-time, late, and anomaly statistics.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadBatch}
          className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-300 transition-colors hover:bg-teal-500/20"
        >
          <Download className="h-4 w-4" />
          Download Batch CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 md:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs text-slate-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Group</label>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Allowed Groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.nama_group}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Employee</label>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="">All Employees</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id ?? employee.label} value={employee.id || ''}>
                {employee.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={load}
            className="w-full rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Profiles" value={data.summary.length} />
        <StatCard label="Total Days" value={totals.totalDays} />
        <StatCard label="On Time" value={totals.onTime} className="text-emerald-300" />
        <StatCard label="Late" value={totals.late} className="text-amber-300" />
        <StatCard label="Anomaly" value={totals.anomaly} className="text-rose-300" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center gap-2">
            <LineChart className="h-4 w-4 text-teal-300" />
            <h2 className="text-sm font-semibold text-white">Daily Late Trend (Line)</h2>
          </div>
          {data.daily.length === 0 ? (
            <p className="text-xs text-slate-500">No daily data in selected range.</p>
          ) : (
            <div className="overflow-x-auto">
              <svg width="760" height="220" viewBox="0 0 760 220" className="min-w-[760px]">
                <rect x="0" y="0" width="760" height="220" fill="transparent" />
                <line x1="26" y1="194" x2="734" y2="194" stroke="#334155" strokeWidth="1" />
                <polyline fill="none" stroke="#22d3ee" strokeWidth="2.5" points={line} />
                {data.daily.map((item, index) => {
                  const x = 26 + (data.daily.length === 1 ? 354 : (index / (data.daily.length - 1)) * 708);
                  const y = 26 + 168 - (item.late / maxDailyLate) * 168;
                  return (
                    <g key={item.tanggal}>
                      <circle cx={x} cy={y} r="3" fill="#14b8a6" />
                      {index % Math.max(1, Math.round(data.daily.length / 8)) === 0 && (
                        <text x={x} y="210" fill="#64748b" fontSize="10" textAnchor="middle">
                          {item.tanggal.slice(5)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Top Late Profiles (Bar)</h2>
          <div className="space-y-2">
            {topLate.length === 0 ? (
              <p className="text-xs text-slate-500">No profile rows for selected range.</p>
            ) : (
              topLate.map((item) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">
                      {item.nama} <span className="text-slate-500">({item.group})</span>
                    </span>
                    <span className="font-mono text-amber-300">{item.late_days}</span>
                  </div>
                  <div className="h-2 rounded bg-slate-800">
                    <div
                      className="h-2 rounded bg-amber-400"
                      style={{ width: `${Math.max((item.late_days / maxLate) * 100, item.late_days ? 8 : 0)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Employee</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Group</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Total Days</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">On Time</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Late</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Early Leave</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Anomaly</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Late Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">
                    Loading dashboard data...
                  </td>
                </tr>
              ) : data.summary.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">
                    No performance rows found in selected range.
                  </td>
                </tr>
              ) : (
                data.summary.map((item) => (
                  <tr key={item.key}>
                    <td className="px-4 py-3 text-white">
                      {item.nama} <span className="font-mono text-xs text-slate-500">({item.pin})</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.group}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{item.total_days}</td>
                    <td className="px-4 py-3 font-mono text-xs text-emerald-300">{item.on_time_days}</td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-300">{item.late_days}</td>
                    <td className="px-4 py-3 font-mono text-xs text-rose-300">{item.early_days}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{item.anomaly_days}</td>
                    <td className="px-4 py-3 font-mono text-xs text-violet-300">{item.late_rate}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!auth && <p className="text-xs text-rose-400">Session not loaded. Please re-login.</p>}
    </div>
  );
}

