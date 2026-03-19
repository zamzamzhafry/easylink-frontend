'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import AttendanceFilters from '@/components/attendance/attendance-filters';
import AttendanceTable from '@/components/attendance/attendance-table';
import NoteModal from '@/components/attendance/note-modal';
import { TableEmptyRow, TableLoadingRow, TableShell } from '@/components/ui/table-shell';
import { useToast } from '@/components/ui/toast-provider';
import {
  attendanceCsv,
  countAnomalies,
  endOfRange,
  isoDate,
  lateChartData,
  rawScanlogCsv,
  startOfRange,
} from '@/lib/attendance-helpers';
import { requestJson } from '@/lib/request-json';

const ADMIN_TABS = [
  { key: 'summary', label: 'Daily Attendance' },
  { key: 'raw', label: 'Raw Scanlog' },
  { key: 'dashboard', label: 'Employee Dashboard' },
];
const MEMBER_TABS = [
  { key: 'summary', label: 'Daily Attendance' },
  { key: 'dashboard', label: 'Employee Dashboard' },
];

export default function AttendancePage() {
  const { warning } = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [from, setFrom] = useState(startOfRange('week'));
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [summaryPage, setSummaryPage] = useState(1);
  const [rawPage, setRawPage] = useState(1);
  const [dashboardPage, setDashboardPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Fetch user role on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, []);

  const isAdmin = Boolean(currentUser?.is_admin);
  const isLeader = Boolean(currentUser?.is_leader);
  const canEditNotes = isAdmin || isLeader;
  const TABS = isAdmin ? ADMIN_TABS : MEMBER_TABS;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      if (groupId) query.set('group_id', groupId);
      const data = await requestJson(`/api/attendance?${query.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      warning(error.message || 'Failed to fetch attendance data.', 'Attendance request failed');
    } finally {
      setLoading(false);
    }
  }, [from, to, groupId, warning]);

  const loadRaw = useCallback(async () => {
    if (!isAdmin) {
      setRawRows([]);
      return;
    }
    setRawLoading(true);
    try {
      const query = new URLSearchParams({ from, to, limit: '2000' });
      if (groupId) query.set('group_id', groupId);
      const data = await requestJson(`/api/attendance/raw?${query.toString()}`);
      setRawRows(Array.isArray(data) ? data : []);
    } catch (error) {
      warning(error.message || 'Failed to fetch raw scanlog.', 'Raw scanlog request failed');
    } finally {
      setRawLoading(false);
    }
  }, [from, to, groupId, warning, isAdmin]);

  const loadGroups = useCallback(async () => {
    if (!isAdmin && currentUser?.groups) {
      setGroups(
        currentUser.groups.map((group) => ({
          id: Number(group.group_id),
          nama_group: group.nama_group || `Group ${group.group_id}`,
        }))
      );
      return;
    }
    try {
      const data = await requestJson('/api/groups');
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    }
  }, [currentUser, isAdmin]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    load();
    if (isAdmin) {
      loadRaw();
    } else {
      setRawRows([]);
    }
  }, [load, loadRaw, isAdmin]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'raw') setActiveTab('summary');
  }, [isAdmin, activeTab]);

  const setRange = (unit) => {
    if (unit === 'today') {
      const today = isoDate();
      setFrom(today);
      setTo(today);
      return;
    }

    setFrom(startOfRange(unit));
    setTo(endOfRange(unit));
  };

  const exportCsv = () => {
    const isRawTab = activeTab === 'raw';
    const csv = isRawTab ? rawScanlogCsv(filteredRawRows) : attendanceCsv(filteredSummaryRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = isRawTab ? `raw_scanlog_${from}_${to}.csv` : `absensi_${from}_${to}.csv`;
    link.click();
  };

  const saveNote = async ({ status, catatan, manual_hours, manual_approved }) => {
    if (!editing) return false;
    const dateValue = String(editing.scan_date ?? '');
    const normalizedDate = dateValue.includes('T') ? dateValue.slice(0, 10) : dateValue;

    try {
      await requestJson('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: editing.pin,
          tanggal: normalizedDate,
          status,
          catatan,
          manual_hours,
          manual_approved,
        }),
      });
      await load();
      return true;
    } catch (error) {
      warning(error.message || 'Failed to save attendance note.', 'Unable to save note');
      return false;
    }
  };

  const lateData = useMemo(() => lateChartData(rows).slice(0, 12), [rows]);
  const maxLate = lateData.length ? Math.max(...lateData.map((item) => item.lateCount), 1) : 1;

  const employeeOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const id = row.karyawan_id ? `emp-${row.karyawan_id}` : `pin-${row.pin}`;
      if (map.has(id)) return;
      map.set(id, {
        id,
        name: row.nama || `PIN ${row.pin}`,
      });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filteredSummaryRows = useMemo(() => {
    return rows.filter((row) => {
      if (employeeFilter) {
        if (
          employeeFilter.startsWith('emp-') &&
          String(row.karyawan_id) !== employeeFilter.slice(4)
        ) {
          return false;
        }
        if (employeeFilter.startsWith('pin-') && String(row.pin) !== employeeFilter.slice(4)) {
          return false;
        }
      }

      if (!incompleteOnly) return true;
      const status = String(row.computed_status || '').toLowerCase();
      return status !== 'normal' && status !== 'reviewed';
    });
  }, [rows, employeeFilter, incompleteOnly]);

  const filteredRawRows = useMemo(() => {
    return rawRows.filter((row) => {
      if (!employeeFilter) return true;
      if (employeeFilter.startsWith('emp-')) {
        return String(row.karyawan_id || '') === employeeFilter.slice(4);
      }
      return String(row.pin || '') === employeeFilter.slice(4);
    });
  }, [rawRows, employeeFilter]);

  const filteredLateData = useMemo(() => {
    if (!employeeFilter) return lateData;
    if (employeeFilter.startsWith('emp-')) {
      const target = employeeFilter.slice(4);
      return lateData.filter((item) => String(item.karyawan_id || '') === target);
    }
    const pin = employeeFilter.slice(4);
    return lateData.filter((item) => String(item.pin || '') === pin);
  }, [lateData, employeeFilter]);

  const pageMeta = (total) => {
    const pages = Math.max(1, Math.ceil(total / rowsPerPage));
    return { pages, total };
  };

  const summaryMeta = pageMeta(filteredSummaryRows.length);
  const rawMeta = pageMeta(filteredRawRows.length);
  const dashboardMeta = pageMeta(filteredLateData.length);

  const pagedSummaryRows = filteredSummaryRows.slice(
    (summaryPage - 1) * rowsPerPage,
    summaryPage * rowsPerPage
  );
  const pagedRawRows = filteredRawRows.slice((rawPage - 1) * rowsPerPage, rawPage * rowsPerPage);
  const pagedLateData = filteredLateData.slice(
    (dashboardPage - 1) * rowsPerPage,
    dashboardPage * rowsPerPage
  );

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const isRawTab = activeTab === 'raw';
    const records = isRawTab ? filteredRawRows : filteredSummaryRows;
    const worksheet = XLSX.utils.json_to_sheet(records);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, isRawTab ? 'Raw Scanlog' : 'Attendance');
    XLSX.writeFile(
      workbook,
      isRawTab ? `raw_scanlog_${from}_${to}.xlsx` : `absensi_${from}_${to}.xlsx`
    );
  };

  const printCurrentTab = () => {
    const isRawTab = activeTab === 'raw';
    const records = isRawTab ? filteredRawRows : filteredSummaryRows;
    const headers = records.length ? Object.keys(records[0]) : [];
    const rowsHtml = records
      .slice(0, 1000)
      .map(
        (row) => `<tr>${headers.map((key) => `<td>${String(row[key] ?? '-')}</td>`).join('')}</tr>`
      )
      .join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Attendance Print</title><style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
      th { background: #f1f5f9; }
    </style></head><body>
      <h2>${isRawTab ? 'Raw Scanlog' : 'Daily Attendance'} (${from} to ${to})</h2>
      <table><thead><tr>${headers.map((key) => `<th>${key}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>`;

    const popup = window.open('', '_blank', 'width=1200,height=900');
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const resetPages = () => {
    setSummaryPage(1);
    setRawPage(1);
    setDashboardPage(1);
  };

  const renderPager = (page, setPage, meta) => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
      <div>
        Showing {(page - 1) * rowsPerPage + 1}-{Math.min(page * rowsPerPage, meta.total)} of{' '}
        {meta.total}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-rows" className="text-slate-500">
          Rows
        </label>
        <select
          id="attendance-rows"
          value={rowsPerPage}
          onChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            resetPages();
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
        >
          {[10, 20, 30, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
          className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span className="font-mono text-slate-300">
          {page}/{meta.pages}
        </span>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(meta.pages, prev + 1))}
          disabled={page >= meta.pages}
          className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Records</p>
          <h1 className="text-3xl font-bold text-white">Absensi Karyawan</h1>
          <p className="mt-1 text-sm text-slate-400">
            Raw scanlog linked to employee fullname, group filtering, and late dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/attendance/review"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300 transition-colors hover:bg-amber-500/20"
          >
            Review Punches
          </Link>
          <button
            type="button"
            onClick={exportExcel}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-400 transition-colors hover:bg-teal-500/20"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={printCurrentTab}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
        </div>
      </div>

      <AttendanceFilters
        from={from}
        to={to}
        count={activeTab === 'raw' ? filteredRawRows.length : filteredSummaryRows.length}
        anomalyCount={countAnomalies(filteredSummaryRows)}
        groupId={groupId}
        groups={groups}
        employeeId={employeeFilter}
        employees={employeeOptions}
        incompleteOnly={incompleteOnly}
        onFromChange={(value) => {
          setFrom(value);
          resetPages();
        }}
        onToChange={(value) => {
          setTo(value);
          resetPages();
        }}
        onGroupChange={(value) => {
          setGroupId(value);
          resetPages();
        }}
        onEmployeeChange={(value) => {
          setEmployeeFilter(value);
          resetPages();
        }}
        onIncompleteOnlyChange={(checked) => {
          setIncompleteOnly(checked);
          resetPages();
        }}
        onSetRange={(unit) => {
          setRange(unit);
          resetPages();
        }}
      />

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              resetPages();
            }}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-teal-500 text-slate-900'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <AttendanceTable
            loading={loading}
            rows={pagedSummaryRows}
            onEdit={canEditNotes ? setEditing : null}
          />
          {renderPager(summaryPage, setSummaryPage, summaryMeta)}
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">Jam</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">PIN</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
                    Employee Fullname
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
                    Group
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
                    Review
                  </th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
                    Verify / IO / Workcode
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {rawLoading ? (
                  <TableLoadingRow colSpan={7} />
                ) : filteredRawRows.length === 0 ? (
                  <TableEmptyRow colSpan={7} label="No raw scanlog rows in range" />
                ) : (
                  pagedRawRows.map((row) => (
                    <tr
                      key={`${row.pin}-${row.scan_date}-${row.scan_time}-${row.verifymode}-${row.iomode}-${row.workcode}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {String(row.scan_date).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-teal-300">
                        {String(row.scan_time).slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.pin}</td>
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
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.nama_group || '-'}</td>
                      <td className="px-4 py-3">
                        {row.reviewed_status === 'reviewed' ? (
                          <span className="inline-flex rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                            Reviewed
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {row.verifymode}/{row.iomode}/{row.workcode}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableShell>
          {renderPager(rawPage, setRawPage, rawMeta)}
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-white">
              How Many Times Employee Is Late (Top 12)
            </h2>
            <div className="mt-4 space-y-2">
              {filteredLateData.length === 0 ? (
                <p className="text-xs text-slate-500">No attendance rows in selected range.</p>
              ) : (
                pagedLateData.map((item) => (
                  <div key={`${item.pin}-${item.nama}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">
                        {item.karyawan_id ? (
                          <Link
                            href={`/employees/${item.karyawan_id}`}
                            className="hover:text-teal-300"
                          >
                            {item.nama}
                          </Link>
                        ) : (
                          item.nama
                        )}{' '}
                        <span className="text-slate-500">(PIN {item.pin})</span>
                      </span>
                      <span className="font-mono text-amber-300">{item.lateCount} late</span>
                    </div>
                    <div className="h-2 rounded bg-slate-800">
                      <div
                        className="h-2 rounded bg-amber-400"
                        style={{
                          width: `${Math.max((item.lateCount / maxLate) * 100, item.lateCount ? 8 : 0)}%`,
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Group: {item.group} | Anomaly: {item.anomalyCount} | Pulang awal:{' '}
                      {item.earlyCount} | Records: {item.totalRows}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                    Employee
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                    Group
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Late</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                    Pulang Awal
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                    Anomaly
                  </th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                    Total Rows
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {pagedLateData.map((item) => (
                  <tr key={`dashboard-${item.pin}-${item.nama}`}>
                    <td className="px-4 py-2 text-white">
                      {item.karyawan_id ? (
                        <Link
                          href={`/employees/${item.karyawan_id}`}
                          className="hover:text-teal-300"
                        >
                          {item.nama}
                        </Link>
                      ) : (
                        item.nama
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{item.group}</td>
                    <td className="px-4 py-2 font-mono text-xs text-amber-300">{item.lateCount}</td>
                    <td className="px-4 py-2 font-mono text-xs text-rose-300">{item.earlyCount}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">
                      {item.anomalyCount}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{item.totalRows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          {renderPager(dashboardPage, setDashboardPage, dashboardMeta)}
        </div>
      )}

      {editing && canEditNotes && (
        <NoteModal row={editing} onClose={() => setEditing(null)} onSave={saveNote} />
      )}
    </div>
  );
}
