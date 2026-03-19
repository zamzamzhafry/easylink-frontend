'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Pencil,
  Printer,
  Upload,
  Users,
  X,
} from 'lucide-react';
import BulkAssignModal from '@/components/schedule/bulk-assign-modal';
import ScheduleGrid from '@/components/schedule/schedule-grid';
import ShiftLegend from '@/components/schedule/shift-legend';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';
import {
  addDays,
  employeeScheduleMetrics,
  formatIsoDate,
  groupOptionsFromEmployees,
  monthDates,
  monthEnd,
  monthLabel,
  monthStart,
  parseScheduleTemplateImport,
  parseScheduleTemplateRows,
  scheduleCsvTemplate,
  schedulePrintHtml,
  scheduleTemplateRows,
} from '@/lib/schedule-helpers';

const TABS = [
  { key: 'plan', label: 'Monthly Plan' },
  { key: 'punches', label: 'Punch Shortcut' },
  { key: 'import', label: 'Import / Check' },
  { key: 'summary', label: 'Employee Metrics' },
];

function excelCol(index) {
  let n = index;
  let col = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    col = String.fromCharCode(65 + mod) + col;
    n = Math.floor((n - mod) / 26);
  }
  return col;
}

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10);
  }
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return text.includes('T') ? text.slice(0, 10) : text.slice(0, 10);
}

export default function SchedulePage() {
  const { success, warning } = useToast();
  const [activeTab, setActiveTab] = useState('plan');
  const [monthOf, setMonthOf] = useState(() => monthStart(new Date()));
  const [groupTab, setGroupTab] = useState('all');
  const [data, setData] = useState({
    shifts: [],
    schedules: [],
    employees: [],
    scanCompletions: [],
  });
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulkModal, setBulkModal] = useState(false);
  const [importResult, setImportResult] = useState({ entries: [], errors: [] });
  const [uploadFileName, setUploadFileName] = useState('');
  const [applyingImport, setApplyingImport] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [editMode, setEditMode] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [holidayMap, setHolidayMap] = useState({});
  const [groupFilterOpen, setGroupFilterOpen] = useState(true);
  const [employeePage, setEmployeePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const dates = useMemo(() => monthDates(monthOf), [monthOf]);
  const from = formatIsoDate(monthStart(monthOf));
  const to = formatIsoDate(monthEnd(monthOf));
  const monthTitle = useMemo(() => monthLabel(monthOf, 'id-ID'), [monthOf]);

  const getShift = useCallback(
    (employeeId, dateString) =>
      data.schedules.find(
        (item) =>
          Number(item.karyawan_id) === Number(employeeId) &&
          normalizeDate(item.tanggal) === dateString
      ),
    [data.schedules]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleResult, attendanceResult] = await Promise.all([
        requestJson(`/api/schedule?from=${from}&to=${to}`),
        requestJson(`/api/attendance?from=${from}&to=${to}`),
      ]);
      const normalizedSchedules = Array.isArray(scheduleResult?.schedules)
        ? scheduleResult.schedules.map((item) => ({
            ...item,
            tanggal: normalizeDate(item.tanggal),
          }))
        : [];
      const normalizedCompletions = Array.isArray(scheduleResult?.scanCompletions)
        ? scheduleResult.scanCompletions.map((item) => ({
            ...item,
            tanggal: normalizeDate(item.tanggal),
          }))
        : [];
      const allShifts = Array.isArray(scheduleResult?.shifts) ? scheduleResult.shifts : [];
      const activeShifts = allShifts.filter((shift) => Number(shift?.is_active ?? 1) === 1);
      setData({
        shifts: activeShifts.length ? activeShifts : allShifts,
        schedules: normalizedSchedules,
        employees: Array.isArray(scheduleResult?.employees) ? scheduleResult.employees : [],
        scanCompletions: normalizedCompletions,
      });
      setAttendanceRows(
        Array.isArray(attendanceResult)
          ? attendanceResult.map((row) => ({ ...row, scan_date: normalizeDate(row.scan_date) }))
          : []
      );
    } catch (error) {
      warning(error.message || 'Failed to fetch schedule data.', 'Schedule request failed');
    } finally {
      setLoading(false);
    }
  }, [from, to, warning]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch current user to gate edit button
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setCurrentUser(d.user);
      })
      .catch(() => {});
  }, []);

  const canEdit = currentUser?.is_admin || currentUser?.is_leader;

  useEffect(() => {
    if (!canEdit) setEditMode(false);
  }, [canEdit]);

  useEffect(() => {
    const year = new Date(from).getFullYear();
    let cancelled = false;

    requestJson(`/api/holidays?year=${year}`)
      .then((result) => {
        if (cancelled) return;
        const map = new Map();
        (result?.rows || []).forEach((row) => {
          if (!row?.date) return;
          map.set(row.date, {
            name: row.name || 'Hari Libur',
            isCutiBersama: Boolean(row.is_cuti_bersama),
          });
        });
        setHolidayMap(Object.fromEntries(map.entries()));
      })
      .catch(() => {
        if (!cancelled) setHolidayMap({});
      });

    return () => {
      cancelled = true;
    };
  }, [from]);

  const setShift = async (employeeId, dateString, shiftId) => {
    const employee = data.employees.find((item) => Number(item.id) === Number(employeeId));
    const shift = data.shifts.find((item) => Number(item.id) === Number(shiftId));
    try {
      await requestJson('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: shiftId ? 'set' : 'clear',
          karyawan_id: employeeId,
          tanggal: dateString,
          ...(shiftId ? { shift_id: shiftId } : {}),
        }),
      });
      await load();
      success(
        `${employee?.nama || `Employee #${employeeId}`} | ${dateString} -> ${shift ? shift.nama_shift : 'Not Assigned'}`,
        'Schedule updated'
      );
    } catch (error) {
      warning(error.message || 'Failed to set shift schedule.', 'Unable to set shift');
    }
  };

  const groups = useMemo(() => groupOptionsFromEmployees(data.employees), [data.employees]);

  const filteredEmployees = useMemo(() => {
    if (groupTab === 'all') return data.employees;
    if (groupTab === 'ungrouped') return data.employees.filter((employee) => !employee.group_id);
    return data.employees.filter((employee) => String(employee.group_id) === String(groupTab));
  }, [data.employees, groupTab]);

  const selectedGroupLabel = useMemo(() => {
    if (groupTab === 'all') return 'All Groups';
    if (groupTab === 'ungrouped') return 'Unassigned';
    return groups.find((item) => String(item.id) === String(groupTab))?.name || 'Unknown Group';
  }, [groupTab, groups]);

  const totalEmployeePages = useMemo(
    () => Math.max(1, Math.ceil(filteredEmployees.length / rowsPerPage)),
    [filteredEmployees.length, rowsPerPage]
  );

  const paginatedEmployees = useMemo(() => {
    const page = Math.min(employeePage, totalEmployeePages);
    const start = (page - 1) * rowsPerPage;
    return filteredEmployees.slice(start, start + rowsPerPage);
  }, [employeePage, filteredEmployees, rowsPerPage, totalEmployeePages]);

  const punchRows = useMemo(() => {
    const sourceRows = attendanceRows
      .filter((row) => {
        if (groupTab === 'all') return true;
        if (groupTab === 'ungrouped') return !row.group_id;
        return String(row.group_id) === String(groupTab);
      })
      .sort(
        (a, b) =>
          String(b.scan_date).localeCompare(String(a.scan_date)) ||
          String(a.nama).localeCompare(String(b.nama))
      );

    const byDay = new Map();
    sourceRows.forEach((row) => {
      const key = `${row.pin}|${row.scan_date}`;
      const current = byDay.get(key);
      if (!current) {
        byDay.set(key, row);
        return;
      }

      const currentCount = Number(current.scan_count || 0);
      const nextCount = Number(row.scan_count || 0);
      const currentOut = String(current.keluar || '');
      const nextOut = String(row.keluar || '');
      if (nextCount > currentCount || nextOut > currentOut) {
        byDay.set(key, row);
      }
    });

    return [...byDay.values()].map((row) => {
      const scanCount = Number(row.scan_count || 0);
      const hasMultiplePunches =
        scanCount > 1 && row.masuk && row.keluar && row.masuk !== row.keluar;
      const manualHours = Number(row.note_manual_hours || 0);
      const manualApproved = Boolean(Number(row.note_manual_approved || 0));
      const durationHours =
        Number(row.durasi_menit || 0) > 0 ? Number(row.durasi_menit || 0) / 60 : 0;
      const shiftHours = Number(row.jam_kerja || 0);

      let totalHours = durationHours;
      if (manualApproved && manualHours > 0) {
        totalHours = manualHours;
      } else if (
        !hasMultiplePunches &&
        shiftHours > 0 &&
        ['normal', 'reviewed'].includes(String(row.computed_status || ''))
      ) {
        totalHours = shiftHours;
      }

      const decision = ['normal', 'reviewed'].includes(String(row.computed_status || ''))
        ? 'Accepted'
        : 'Needs Review';

      return {
        ...row,
        punch_in: row.masuk || '-',
        punch_out: hasMultiplePunches ? row.keluar : '-',
        punch_count: scanCount,
        total_hours: Number.isFinite(totalHours) ? totalHours : 0,
        decision,
      };
    });
  }, [attendanceRows, groupTab]);

  const metricsByEmployee = useMemo(
    () =>
      employeeScheduleMetrics(
        data.employees,
        data.schedules,
        data.shifts,
        data.scanCompletions,
        new Date()
      ),
    [data.employees, data.schedules, data.shifts, data.scanCompletions]
  );

  const filteredSummary = useMemo(
    () =>
      filteredEmployees.map((employee) => ({
        employee,
        metrics: metricsByEmployee.get(Number(employee.id)) || {
          shifted_days: 0,
          planned_hours: 0,
          done_hours: 0,
          pending_hours: 0,
          future_hours: 0,
        },
      })),
    [filteredEmployees, metricsByEmployee]
  );

  const anomalyByKey = useMemo(() => {
    const employeeIdByPin = new Map(
      data.employees
        .filter((employee) => employee.pin)
        .map((employee) => [String(employee.pin), Number(employee.id)])
    );
    const map = new Map();

    attendanceRows.forEach((row) => {
      if (!row || row.computed_status === 'normal') return;
      const employeeId = employeeIdByPin.get(String(row.pin));
      if (!employeeId) return;
      const dateKey = normalizeDate(row.scan_date);
      if (!dateKey) return;
      map.set(`${employeeId}|${dateKey}`, row.computed_status);
    });

    return map;
  }, [attendanceRows, data.employees]);

  const exportTemplateCsv = () => {
    const csv = scheduleCsvTemplate(filteredEmployees, dates, getShift);
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `schedule_${from}_${to}_${groupTab}.csv`;
    link.click();
  };

  const exportTemplateExcel = async () => {
    const XLSX = await import('xlsx');
    const headerRows = scheduleTemplateRows(filteredEmployees, dates, getShift);
    const scheduleSheetRows = headerRows.map((row, index) => {
      if (index === 0) {
        return ['Nama', 'PIN', 'Total Jam (Formula)', ...row.slice(2)];
      }
      return [row[0], row[1], '', ...row.slice(2)];
    });

    const formulaCol = 3;
    const startDateCol = 4;
    const endDateCol = startDateCol + dates.length - 1;

    for (let i = 1; i < scheduleSheetRows.length; i += 1) {
      const rowIndex = i + 1;
      const startCol = excelCol(startDateCol);
      const endCol = excelCol(endDateCol);
      const formulaCell = {
        f: `SUMPRODUCT(IFERROR(VLOOKUP(${startCol}${rowIndex}:${endCol}${rowIndex},'Shift Reference'!A:B,2,FALSE),0))`,
      };
      scheduleSheetRows[i][formulaCol - 1] = formulaCell;
    }

    const shiftRefRows = [
      ['Shift Name', 'Hours'],
      ...data.shifts.map((shift) => [shift.nama_shift, Number(shift.jam_kerja || 0)]),
    ];

    const noteRows = [
      ['Instructions'],
      ['1. Fill shift names exactly as listed in Shift Reference sheet.'],
      ['2. Total Jam is calculated automatically.'],
      ['3. You can use Excel formulas around the date columns as needed.'],
      ['4. Upload this file back in Import / Check tab.'],
    ];

    const workbook = XLSX.utils.book_new();
    const scheduleSheet = XLSX.utils.aoa_to_sheet(scheduleSheetRows);
    const shiftRefSheet = XLSX.utils.aoa_to_sheet(shiftRefRows);
    const infoSheet = XLSX.utils.aoa_to_sheet(noteRows);

    XLSX.utils.book_append_sheet(workbook, scheduleSheet, 'Schedule Template');
    XLSX.utils.book_append_sheet(workbook, shiftRefSheet, 'Shift Reference');
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Info');

    XLSX.writeFile(workbook, `schedule_${from}_${to}_${groupTab}.xlsx`);
  };

  const printSchedule = () => {
    const popup = window.open('', '_blank', 'width=1280,height=800');
    if (!popup) {
      warning('Unable to open print window. Please allow popups.', 'Print blocked');
      return;
    }
    popup.document.write(schedulePrintHtml(filteredEmployees, dates, getShift, { holidayMap }));
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const applyBulkGroup = async ({ group_id, shift_id, from: dateFrom, to: dateTo }) => {
    try {
      const result = await requestJson('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_group',
          group_id,
          shift_id,
          from: dateFrom,
          to: dateTo,
        }),
      });
      success(
        `Applied bulk schedule for ${result?.affected ?? 0} row(s).`,
        'Bulk assignment successful'
      );
      return result?.affected ?? 0;
    } catch (error) {
      warning(error.message || 'Bulk assignment failed.', 'Unable to apply bulk assignment');
      return null;
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);

    try {
      const lowerName = file.name.toLowerCase();
      let result;

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          raw: false,
          defval: '',
        });
        result = parseScheduleTemplateRows(rows, data.employees, data.shifts);
      } else {
        const text = await file.text();
        result = parseScheduleTemplateImport(text, data.employees, data.shifts);
      }

      setImportResult(result);
    } catch {
      warning(
        'Failed to parse uploaded file. Use .xlsx, .xls, or .csv template.',
        'Import parsing failed'
      );
    }
  };

  const applyImport = async () => {
    if (!importResult.entries.length) {
      warning('No valid rows to import.', 'Import warning');
      return;
    }
    if (importResult.errors.length) {
      warning('Please fix validation errors before applying import.', 'Import warning');
      return;
    }

    setApplyingImport(true);
    try {
      const result = await requestJson('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_rows',
          rows: importResult.entries.map((entry) => ({
            karyawan_id: entry.karyawan_id,
            tanggal: entry.tanggal,
            shift_id: entry.shift_id,
          })),
        }),
      });

      success(
        `Imported ${result.affected || 0} rows${result.skipped ? `, skipped ${result.skipped}` : ''}.`,
        'Import complete'
      );
      await load();
    } catch (error) {
      warning(error.message || 'Failed to apply import rows.', 'Import failed');
    } finally {
      setApplyingImport(false);
    }
  };

  const totalStats = useMemo(() => {
    return filteredSummary.reduce(
      (acc, row) => {
        acc.shiftedDays += row.metrics.shifted_days;
        acc.plannedHours += row.metrics.planned_hours;
        acc.doneHours += row.metrics.done_hours;
        acc.pendingHours += row.metrics.pending_hours;
        acc.futureHours += row.metrics.future_hours;
        return acc;
      },
      { shiftedDays: 0, plannedHours: 0, doneHours: 0, pendingHours: 0, futureHours: 0 }
    );
  }, [filteredSummary]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Planning</p>
          <h1 className="text-3xl font-bold text-white">Monthly Group Schedule</h1>
          <p className="mt-1 text-sm text-slate-400">
            Monthly planning by group, with done/pending/future estimated work hours.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportTemplateExcel}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export Excel
          </button>
          <button
            type="button"
            onClick={exportTemplateCsv}
            className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-400 transition-colors hover:bg-teal-500/20"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={printSchedule}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </button>
          <Link
            href="/attendance/review"
            className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            Review Punches Shortcut
          </Link>
          {editMode && canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setBulkModal(true)}
                className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-4 py-2.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/30"
              >
                <Users className="h-4 w-4" /> Bulk Assign Group
              </button>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300 transition-colors hover:bg-rose-500/20"
              >
                <X className="h-4 w-4" /> Done Editing
              </button>
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300 transition-colors hover:bg-amber-500/20"
                >
                  <Pencil className="h-4 w-4" /> Plan a Schedule
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
        <button
          type="button"
          onClick={() => setMonthOf((current) => addDays(monthStart(current), -1))}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="rounded-lg border border-slate-700 px-3 py-2 font-mono text-sm text-white">
          {monthTitle}
        </div>
        <button
          type="button"
          onClick={() => setMonthOf((current) => addDays(monthEnd(current), 1))}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition-colors hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="ml-auto font-mono text-xs text-slate-500">
          {from} - {to}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <label htmlFor="schedule-zoom" className="text-xs text-slate-400">
          Day Columns Zoom
        </label>
        <input
          id="schedule-zoom"
          type="range"
          min={75}
          max={150}
          step={5}
          value={zoomPercent}
          onChange={(event) => setZoomPercent(Number(event.target.value))}
          className="h-1.5 w-48 cursor-pointer accent-teal-500"
        />
        <span className="font-mono text-xs text-teal-300">{zoomPercent}%</span>
        <button
          type="button"
          onClick={() => setZoomPercent(100)}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:text-white"
        >
          Reset
        </button>
        <span className="text-xs text-slate-500">Employee column stays fixed.</span>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
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

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-2">
        <button
          type="button"
          onClick={() => setGroupFilterOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 transition-colors hover:bg-slate-800"
        >
          <span>Group Employee Filter</span>
          <span className="font-mono text-[11px] text-teal-300">
            {groupFilterOpen ? 'Hide' : 'Show'}
          </span>
        </button>
        {groupFilterOpen && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setGroupTab('all');
                setEmployeePage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                groupTab === 'all'
                  ? 'bg-teal-500 text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              All Groups ({data.employees.length})
            </button>
            {groups.map((group) => {
              const count = data.employees.filter(
                (employee) => String(employee.group_id) === String(group.id)
              ).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setGroupTab(String(group.id));
                    setEmployeePage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                    String(groupTab) === String(group.id)
                      ? 'bg-teal-500 text-slate-900'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {group.name} ({count})
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setGroupTab('ungrouped');
                setEmployeePage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                groupTab === 'ungrouped'
                  ? 'bg-teal-500 text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              Unassigned ({data.employees.filter((employee) => !employee.group_id).length})
            </button>
          </div>
        )}
      </div>

      {activeTab === 'plan' && (
        <div className="space-y-6">
          <ShiftLegend shifts={data.shifts} />

          <ScheduleGrid
            loading={loading}
            employees={paginatedEmployees}
            shifts={data.shifts}
            dates={dates}
            getShift={getShift}
            metricsByEmployee={metricsByEmployee}
            anomalyByKey={anomalyByKey}
            holidayMap={holidayMap}
            selectedGroupLabel={selectedGroupLabel}
            zoomPercent={zoomPercent}
            readOnly={!editMode}
            onSetShift={editMode ? setShift : undefined}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
            <div>
              Showing {(employeePage - 1) * rowsPerPage + 1}-
              {Math.min(employeePage * rowsPerPage, filteredEmployees.length)} of{' '}
              {filteredEmployees.length} employees
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="schedule-rows" className="text-slate-500">
                Rows
              </label>
              <select
                id="schedule-rows"
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value));
                  setEmployeePage(1);
                }}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200"
              >
                {[10, 15, 20, 30, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setEmployeePage((page) => Math.max(1, page - 1))}
                disabled={employeePage <= 1}
                className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-slate-300">
                {employeePage}/{totalEmployeePages}
              </span>
              <button
                type="button"
                onClick={() => setEmployeePage((page) => Math.min(totalEmployeePages, page + 1))}
                disabled={employeePage >= totalEmployeePages}
                className="rounded border border-slate-700 px-2 py-1 text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'punches' && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Daily Punch Shortcut</h2>
              <p className="text-xs text-slate-400">
                Quick review by employee/date without opening full Scan Log.
              </p>
            </div>
            <Link
              href="/attendance/review"
              className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/20"
            >
              Open Attendance Review
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Shift</th>
                  <th className="px-3 py-2">Punch In</th>
                  <th className="px-3 py-2">Punch Out</th>
                  <th className="px-3 py-2">Punch Count</th>
                  <th className="px-3 py-2">Total Hours</th>
                  <th className="px-3 py-2">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {punchRows.slice(0, 250).map((row) => (
                  <tr key={`${row.pin}-${row.scan_date}`}>
                    <td className="px-3 py-2 text-white">{row.nama || row.pin}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{row.scan_date}</td>
                    <td className="px-3 py-2 text-slate-300">{row.shift || '-'}</td>
                    <td className="px-3 py-2 font-mono text-emerald-300">{row.punch_in || '-'}</td>
                    <td className="px-3 py-2 font-mono text-amber-300">{row.punch_out || '-'}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{row.punch_count || 0}</td>
                    <td className="px-3 py-2 font-mono text-cyan-300">
                      {Number(row.total_hours || 0).toFixed(1)}h
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          row.decision === 'Accepted'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {row.decision}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-white">Import / Check Schedule Template</h2>
          <p className="text-xs text-slate-400">
            Download template per selected group, fill in Excel, validate, then apply to schedule
            table.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportTemplateExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Download Excel Template
            </button>
            <button
              type="button"
              onClick={exportTemplateCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" /> Download CSV Template
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-300 transition-colors hover:bg-teal-500/20">
              <Upload className="h-3.5 w-3.5" /> Upload Excel / CSV
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={handleUpload}
              />
            </label>
          </div>
          {uploadFileName && <p className="text-xs text-slate-500">File: {uploadFileName}</p>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-xs text-emerald-300">Valid entries</p>
              <p className="font-mono text-xl font-bold text-white">
                {importResult.entries.length}
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-300">Validation errors</p>
              <p className="font-mono text-xl font-bold text-white">{importResult.errors.length}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              <p className="text-xs text-slate-400">Selected month</p>
              <p className="font-mono text-sm text-white">{monthTitle}</p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-300">Import check errors</p>
              <ul className="space-y-1 text-xs text-amber-200">
                {importResult.errors.slice(0, 20).map((error) => (
                  <li key={`${error.row}-${error.message}`}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={applyImport}
            disabled={applyingImport || !importResult.entries.length}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400 disabled:opacity-50"
          >
            {applyingImport ? 'Applying import...' : 'Apply Import'}
          </button>
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-xs text-slate-500">Total Shifted</p>
              <p className="font-mono text-lg font-bold text-white">{totalStats.shiftedDays}d</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-xs text-slate-500">Planned Hours</p>
              <p className="font-mono text-lg font-bold text-teal-300">
                {totalStats.plannedHours.toFixed(1)}h
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-xs text-slate-500">Done Hours</p>
              <p className="font-mono text-lg font-bold text-emerald-300">
                {totalStats.doneHours.toFixed(1)}h
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-xs text-slate-500">Pending Hours</p>
              <p className="font-mono text-lg font-bold text-amber-300">
                {totalStats.pendingHours.toFixed(1)}h
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-xs text-slate-500">Future Hours</p>
              <p className="font-mono text-lg font-bold text-violet-300">
                {totalStats.futureHours.toFixed(1)}h
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Per Employee Schedule Metrics</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Employee
                    </th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Group
                    </th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Total Shifted
                    </th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Planned Hours
                    </th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Done Hours
                    </th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Pending Hours
                    </th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">
                      Future Hours
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredSummary.map(({ employee, metrics }) => (
                    <tr key={employee.id}>
                      <td className="px-4 py-3 text-white">
                        <Link href={`/employees/${employee.id}`} className="hover:text-teal-300">
                          {employee.nama}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {employee.nama_group || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {metrics.shifted_days}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-teal-300">
                        {metrics.planned_hours.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-emerald-300">
                        {metrics.done_hours.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-amber-300">
                        {metrics.pending_hours.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-violet-300">
                        {metrics.future_hours.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <BulkAssignModal
          shifts={data.shifts}
          groups={groups}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setBulkModal(false)}
          onApply={applyBulkGroup}
          onDone={async () => {
            setBulkModal(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
