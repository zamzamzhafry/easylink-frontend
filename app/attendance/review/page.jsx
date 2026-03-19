'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, Filter, ShieldCheck, UserRoundSearch } from 'lucide-react';
import {
  TableEmptyRow,
  TableHeadRow,
  TableLoadingRow,
  TableShell,
} from '@/components/ui/table-shell';
import { useToast } from '@/components/ui/toast-provider';
import { isoDate, startOfRange } from '@/lib/attendance-helpers';
import { requestJson } from '@/lib/request-json';

const HEADERS = [
  { key: 'date', label: 'Date' },
  { key: 'name', label: 'Employee' },
  { key: 'group', label: 'Group' },
  { key: 'shift', label: 'Shift' },
  { key: 'times', label: 'Times in one cell' },
  { key: 'status', label: 'Compare Result' },
  { key: 'meta', label: 'Punch Meta' },
  { key: 'actions', label: '' },
];

const STATUS_BADGE = {
  normal: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  terlambat: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  pulang_awal: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  double_punch: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  tidak_hadir: 'border-slate-600 bg-slate-800 text-slate-300',
};

const VERIFY_MAP = {
  1: 'Fingerprint',
  20: 'Face Recognition',
  30: 'Vein Scan',
  2: 'Card',
  4: 'Face',
  15: 'Palm',
};
const IO_MAP = { 0: 'Check In', 1: 'Check Out', 2: 'Break Out', 3: 'Break In' };

function statusLabel(value) {
  if (value === 'double_punch') return 'Double Punch';
  return String(value || 'normal').replaceAll('_', ' ');
}

export default function AttendanceReviewPage() {
  const { warning, success } = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [groups, setGroups] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [expanded, setExpanded] = useState('');
  const [from, setFrom] = useState(startOfRange('week'));
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [pinFilter, setPinFilter] = useState('');
  const [hasHiddenTable, setHasHiddenTable] = useState(false);

  const isAdmin = Boolean(currentUser?.is_admin);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setCurrentUser(d.user);
          if (!d.user?.is_admin && Array.isArray(d.user?.groups)) {
            setGroups(
              d.user.groups.map((group) => ({
                id: Number(group.group_id),
                nama_group: group.nama_group || `Group ${group.group_id}`,
              }))
            );
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadGroups = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await requestJson('/api/groups');
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    }
  }, [isAdmin]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from, to });
      if (groupId) q.set('group_id', groupId);
      if (pinFilter.trim()) q.set('pin', pinFilter.trim());
      const data = await requestJson(`/api/attendance/review?${q.toString()}`);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setHasHiddenTable(Boolean(data?.has_hidden_table));
    } catch (error) {
      warning(error.message || 'Failed to load attendance review.', 'Review fetch failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, groupId, pinFilter, warning]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const profileOptions = useMemo(() => {
    const seen = new Set();
    const output = [];
    for (const row of rows) {
      if (!row.karyawan_id || seen.has(row.karyawan_id)) continue;
      seen.add(row.karyawan_id);
      output.push({ id: row.karyawan_id, label: `${row.nama} (PIN ${row.pin})` });
    }
    return output;
  }, [rows]);

  const [selectedProfile, setSelectedProfile] = useState('');

  const toggleHidden = async (row, punch) => {
    if (!isAdmin || !hasHiddenTable) return;
    const key = `${row.pin}-${punch.scan_at}-${punch.sn}-${punch.iomode}-${punch.workcode}`;
    setSavingKey(key);
    try {
      await requestJson('/api/attendance/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: punch.is_hidden ? 'unhide' : 'hide',
          pin: row.pin,
          scan_at: punch.scan_at,
          sn: punch.sn,
          iomode: punch.iomode,
          workcode: punch.workcode,
          reason: 'admin normalization',
        }),
      });
      success(
        punch.is_hidden ? 'Punch restored.' : 'Punch hidden from comparison.',
        'Review updated'
      );
      await loadRows();
    } catch (error) {
      warning(error.message || 'Failed to update punch visibility.', 'Action failed');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Attendance Review</h1>
          <p className="text-xs text-slate-500">
            Punch timeline per employee/day. Compare against shift and normalize accidental double
            punches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/attendance"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white"
          >
            Back to Attendance
          </Link>
          <Link
            href="/schedule"
            className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-300 hover:bg-teal-500/20"
          >
            Open Schedule
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="text-xs text-slate-400">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            Group
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"
            >
              <option value="">All groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.nama_group}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            PIN
            <input
              value={pinFilter}
              onChange={(e) => setPinFilter(e.target.value)}
              placeholder="Filter PIN"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={loadRows}
              className="inline-flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-300 hover:bg-teal-500/20"
            >
              <Filter className="h-3.5 w-3.5" /> Apply
            </button>
          </div>

          {isAdmin && (
            <label className="text-xs text-slate-400">
              Admin profile quick-open
              <div className="mt-1 flex gap-2">
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-white"
                >
                  <option value="">Select employee profile</option>
                  {profileOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.label}
                    </option>
                  ))}
                </select>
                <Link
                  href={selectedProfile ? `/employees/${selectedProfile}` : '#'}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs ${
                    selectedProfile
                      ? 'border border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'pointer-events-none border border-slate-700 bg-slate-800 text-slate-600'
                  }`}
                >
                  <UserRoundSearch className="h-3.5 w-3.5" /> Open
                </Link>
              </div>
            </label>
          )}
        </div>
      </div>

      {!hasHiddenTable && isAdmin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          To hide accidental punches, run{' '}
          <code className="font-mono">migration_scanlog_hidden.sql</code>.
        </div>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <TableHeadRow headers={HEADERS} />
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {loading ? (
              <TableLoadingRow colSpan={8} label="Loading review rows..." />
            ) : rows.length === 0 ? (
              <TableEmptyRow colSpan={8} label="No rows for selected range" />
            ) : (
              rows.map((row) => {
                const key = `${row.pin}-${row.scan_date}`;
                const open = expanded === key;
                const statusCls = STATUS_BADGE[row.computed_status] || STATUS_BADGE.normal;
                return (
                  <Fragment key={key}>
                    <tr key={key} className="data-row">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {String(row.scan_date).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-white">
                        {row.karyawan_id ? (
                          <Link
                            href={`/employees/${row.karyawan_id}`}
                            className="hover:text-teal-300"
                          >
                            {row.nama}
                          </Link>
                        ) : (
                          row.nama
                        )}
                        <div className="font-mono text-[11px] text-slate-500">PIN {row.pin}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{row.nama_group || '-'}</td>
                      <td className="px-4 py-3 text-xs">
                        {row.nama_shift ? (
                          <span
                            className="inline-flex rounded border px-2 py-0.5"
                            style={{
                              borderColor: `${row.color_hex || '#64748b'}66`,
                              backgroundColor: `${row.color_hex || '#64748b'}22`,
                              color: row.color_hex || '#cbd5e1',
                            }}
                          >
                            {row.nama_shift}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                        {(row.jam_masuk || row.jam_keluar) && (
                          <div className="mt-1 font-mono text-[11px] text-slate-500">
                            {(row.jam_masuk || '--:--:--').slice(0, 5)} -{' '}
                            {(row.jam_keluar || '--:--:--').slice(0, 5)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.visible_times.length === 0 ? (
                          <span className="text-xs text-slate-600">No visible punches</span>
                        ) : (
                          <div className="space-y-0.5 font-mono text-xs text-teal-300">
                            {row.visible_times.map((time) => (
                              <div key={`${key}-${time}`}>{time}</div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 text-xs ${statusCls}`}
                        >
                          {statusLabel(row.computed_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        <div>Total: {row.scan_count}</div>
                        <div>Hidden: {row.hidden_count}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? '' : key)}
                          className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-white"
                        >
                          {open ? 'Hide detail' : 'Review punches'}
                        </button>
                      </td>
                    </tr>

                    {open && (
                      <tr key={`${key}-detail`}>
                        <td colSpan={8} className="bg-slate-950/60 px-4 py-3">
                          <div className="mb-2 text-xs text-slate-500">
                            Punch timeline (admin can soft-hide accidental duplicates)
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-800 text-left text-slate-500">
                                  <th className="px-2 py-1.5">Time</th>
                                  <th className="px-2 py-1.5">Verify</th>
                                  <th className="px-2 py-1.5">IO</th>
                                  <th className="px-2 py-1.5">SN</th>
                                  <th className="px-2 py-1.5">Workcode</th>
                                  <th className="px-2 py-1.5">State</th>
                                  <th className="px-2 py-1.5 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40">
                                {row.punches.map((punch) => {
                                  const actionKey = `${row.pin}-${punch.scan_at}-${punch.sn}-${punch.iomode}-${punch.workcode}`;
                                  const busy = savingKey === actionKey;
                                  return (
                                    <tr key={actionKey}>
                                      <td className="px-2 py-1.5 font-mono text-teal-300">
                                        {punch.scan_time}
                                      </td>
                                      <td className="px-2 py-1.5 text-slate-300">
                                        {VERIFY_MAP[punch.verifymode] || `Mode ${punch.verifymode}`}
                                      </td>
                                      <td className="px-2 py-1.5 text-slate-400">
                                        {IO_MAP[punch.iomode] || `IO ${punch.iomode}`}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-slate-500">
                                        {punch.sn || '-'}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-slate-500">
                                        {punch.workcode}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {punch.is_hidden ? (
                                          <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
                                            hidden
                                          </span>
                                        ) : (
                                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                            visible
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 text-right">
                                        {isAdmin ? (
                                          <button
                                            type="button"
                                            disabled={busy || !hasHiddenTable}
                                            onClick={() => toggleHidden(row, punch)}
                                            className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-white disabled:opacity-50"
                                          >
                                            <EyeOff className="h-3 w-3" />{' '}
                                            {punch.is_hidden ? 'Unhide' : 'Hide'}
                                          </button>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-slate-500">
                                            <ShieldCheck className="h-3 w-3" /> admin only
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
