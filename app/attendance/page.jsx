'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import AttendanceFilters from '@/components/attendance/attendance-filters';
import AttendanceTable from '@/components/attendance/attendance-table';
import NoteModal from '@/components/attendance/note-modal';
import InlineStatusPanel from '@/components/ui/inline-status-panel';
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
import { getUIText } from '@/lib/localization/ui-texts';

const ADMIN_TABS = ['summary', 'raw', 'dashboard'];
const MEMBER_TABS = ['summary', 'dashboard'];

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMinutesToHours = (minutes) => {
  const totalMinutes = toSafeNumber(minutes);
  if (totalMinutes <= 0) return '-';
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return `${hours}j ${remainder}m`;
};

const normalizePredictionContext = (context) => {
  if (!context || typeof context !== 'object') {
    return {
      yearMonth: null,
      minimumHours: null,
      targetSource: null,
      hasData: false,
    };
  }

  const rawHours =
    context.minimum_hours ??
    context.minimumHours ??
    context.target_hours ??
    context.targetHours ??
    context.monthly_target_hours ??
    context.monthlyTargetHours;
  const parsedHours = Number(rawHours);

  return {
    yearMonth:
      context.year_month ??
      context.yearMonth ??
      context.month ??
      context.period ??
      context.periode ??
      null,
    minimumHours: Number.isFinite(parsedHours) ? parsedHours : null,
    targetSource: context.target_source ?? context.targetSource ?? null,
    hasData: Boolean(
      context.year_month ??
      context.yearMonth ??
      context.month ??
      context.period ??
      context.periode ??
      context.minimum_hours ??
      context.minimumHours ??
      context.target_hours ??
      context.targetHours ??
      context.monthly_target_hours ??
      context.monthlyTargetHours ??
      context.target_source ??
      context.targetSource
    ),
  };
};

const formatTargetSource = (source) => {
  if (!source) return '-';
  return String(source)
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

export default function AttendancePage() {
  const { warning } = useToast();
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [from, setFrom] = useState(startOfRange('week'));
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState([]);
  const [scopePayload, setScopePayload] = useState({
    cumulative_summary: null,
    prediction_context: null,
  });
  const [rawRows, setRawRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState('');
  const [rawTotal, setRawTotal] = useState(0);
  const [rawPages, setRawPages] = useState(1);
  const [rawLimit, setRawLimit] = useState(50);
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
  const TABS = useMemo(() => {
    const keys = isAdmin ? ADMIN_TABS : MEMBER_TABS;
    return keys.map((key) => ({ key, label: t(`attendancePage.tabs.${key}`) }));
  }, [isAdmin, t]);
  const rawEmployeeQuery = useMemo(() => {
    if (!employeeFilter) return { pin: '', employeeId: '' };
    if (employeeFilter.startsWith('emp-')) {
      return { pin: '', employeeId: employeeFilter.slice(4) };
    }
    if (employeeFilter.startsWith('pin-')) {
      return { pin: employeeFilter.slice(4), employeeId: '' };
    }
    return { pin: '', employeeId: '' };
  }, [employeeFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      if (groupId) query.set('group_id', groupId);
      const data = await requestJson(`/api/attendance?${query.toString()}`);
      const nextRows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
      setScopePayload({
        cumulative_summary:
          !Array.isArray(data) &&
          data?.cumulative_summary &&
          typeof data.cumulative_summary === 'object'
            ? data.cumulative_summary
            : null,
        prediction_context:
          !Array.isArray(data) &&
          data?.prediction_context &&
          typeof data.prediction_context === 'object'
            ? data.prediction_context
            : null,
      });
    } catch (error) {
      setRows([]);
      setScopePayload({ cumulative_summary: null, prediction_context: null });
      warning(
        error.message || t('reportPage.errors.fetchFailed'),
        t('reportPage.errors.requestFailed')
      );
    } finally {
      setLoading(false);
    }
  }, [from, to, groupId, warning, t]);

  const loadRaw = useCallback(async () => {
    if (!isAdmin) {
      setRawRows([]);
      setRawTotal(0);
      setRawPages(1);
      setRawError('');
      return;
    }

    setRawLoading(true);
    setRawError('');

    try {
      const query = new URLSearchParams({
        from,
        to,
        limit: String(rawLimit),
        page: String(rawPage),
      });

      if (groupId) query.set('group_id', groupId);
      if (rawEmployeeQuery.pin) query.set('pin', rawEmployeeQuery.pin);
      if (rawEmployeeQuery.employeeId) query.set('employee_id', rawEmployeeQuery.employeeId);

      const data = await requestJson(`/api/attendance/raw?${query.toString()}`);

      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      const nextTotal = Number(data?.total ?? nextRows.length);
      const nextPages = Math.max(1, Number(data?.pages ?? 1));
      const nextPage = Math.max(1, Number(data?.page ?? rawPage));

      setRawRows(nextRows);
      setRawTotal(nextTotal);
      setRawPages(nextPages);

      if (nextPage !== rawPage) {
        setRawPage(nextPage);
      }
    } catch (error) {
      const message = error.message || t('reportPage.errors.fetchFailed');
      setRawRows([]);
      setRawTotal(0);
      setRawPages(1);
      setRawError(message);
      warning(message, t('reportPage.errors.requestFailed'));
    } finally {
      setRawLoading(false);
    }
  }, [from, to, groupId, warning, isAdmin, rawPage, rawLimit, rawEmployeeQuery, t]);

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
    const csv = isRawTab ? rawScanlogCsv(rawRows) : attendanceCsv(filteredSummaryRows);
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
      warning(
        error.message || t('attendancePage.noteModal.saveFailedMessage'),
        t('attendancePage.noteModal.saveFailedTitle')
      );
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

  const filteredLateData = useMemo(() => {
    if (!employeeFilter) return lateData;
    if (employeeFilter.startsWith('emp-')) {
      const target = employeeFilter.slice(4);
      return lateData.filter((item) => String(item.karyawan_id || '') === target);
    }
    const pin = employeeFilter.slice(4);
    return lateData.filter((item) => String(item.pin || '') === pin);
  }, [lateData, employeeFilter]);

  const roleScopeSummary = useMemo(() => {
    if (isAdmin) return null;

    const scopedRows = rows.filter((row) => {
      if (!employeeFilter) return true;
      if (employeeFilter.startsWith('emp-')) {
        return String(row.karyawan_id || '') === employeeFilter.slice(4);
      }
      if (employeeFilter.startsWith('pin-')) {
        return String(row.pin || '') === employeeFilter.slice(4);
      }
      return true;
    });

    const summaryByScopeKey = new Map();
    const predictionByScopeKey = new Map();

    scopedRows.forEach((row, index) => {
      const scopeKey =
        row.pin != null
          ? `pin-${row.pin}`
          : row.karyawan_id != null
            ? `emp-${row.karyawan_id}`
            : `row-${index}`;

      if (
        !summaryByScopeKey.has(scopeKey) &&
        row.cumulative_summary &&
        typeof row.cumulative_summary === 'object'
      ) {
        summaryByScopeKey.set(scopeKey, row.cumulative_summary);
      }

      if (
        !predictionByScopeKey.has(scopeKey) &&
        row.prediction_context &&
        typeof row.prediction_context === 'object'
      ) {
        predictionByScopeKey.set(scopeKey, row.prediction_context);
      }
    });

    const scopeCumulative =
      scopePayload.cumulative_summary && typeof scopePayload.cumulative_summary === 'object'
        ? scopePayload.cumulative_summary
        : summaryByScopeKey.size > 0
          ? [...summaryByScopeKey.values()].reduce(
              (acc, item) => {
                acc.total_days += toSafeNumber(item.total_days);
                acc.total_scans += toSafeNumber(item.total_scans);
                acc.late_days += toSafeNumber(item.late_days);
                acc.early_leave_days += toSafeNumber(item.early_leave_days);
                acc.manual_adjustments += toSafeNumber(item.manual_adjustments);
                acc.reviewed_days += toSafeNumber(item.reviewed_days);
                acc.pending_review_days += toSafeNumber(item.pending_review_days);
                acc.total_duration_minutes += toSafeNumber(item.total_duration_minutes);
                return acc;
              },
              {
                total_days: 0,
                total_scans: 0,
                late_days: 0,
                early_leave_days: 0,
                manual_adjustments: 0,
                reviewed_days: 0,
                pending_review_days: 0,
                total_duration_minutes: 0,
              }
            )
          : null;

    const normalizedPredictionFromPayload = normalizePredictionContext(
      scopePayload.prediction_context
    );
    const normalizedPredictionRows = [...predictionByScopeKey.values()]
      .map((item) => normalizePredictionContext(item))
      .filter((item) => item.hasData);

    const primaryPrediction = normalizedPredictionFromPayload.hasData
      ? normalizedPredictionFromPayload
      : normalizedPredictionRows[0] || {
          yearMonth: null,
          minimumHours: null,
          targetSource: null,
          hasData: false,
        };

    const hasMixedPrediction = normalizedPredictionRows.some(
      (item) =>
        item.yearMonth !== primaryPrediction.yearMonth ||
        item.minimumHours !== primaryPrediction.minimumHours ||
        item.targetSource !== primaryPrediction.targetSource
    );

    return {
      employeesInScope: Math.max(summaryByScopeKey.size, predictionByScopeKey.size),
      recordsInScope: scopedRows.length,
      cumulative: scopeCumulative
        ? {
            ...scopeCumulative,
            average_duration_minutes: toSafeNumber(scopeCumulative.total_days)
              ? Math.round(
                  toSafeNumber(scopeCumulative.total_duration_minutes) /
                    Math.max(1, toSafeNumber(scopeCumulative.total_days))
                )
              : null,
          }
        : null,
      prediction: {
        ...primaryPrediction,
        hasData: primaryPrediction.hasData,
        hasMixedPrediction,
        scopedCount: normalizedPredictionRows.length,
      },
    };
  }, [isAdmin, rows, employeeFilter, scopePayload]);

  const pageMeta = (total) => {
    const pages = Math.max(1, Math.ceil(total / rowsPerPage));
    return { pages, total };
  };

  const summaryMeta = pageMeta(filteredSummaryRows.length);
  const dashboardMeta = pageMeta(filteredLateData.length);

  const pagedSummaryRows = filteredSummaryRows.slice(
    (summaryPage - 1) * rowsPerPage,
    summaryPage * rowsPerPage
  );
  const pagedLateData = filteredLateData.slice(
    (dashboardPage - 1) * rowsPerPage,
    dashboardPage * rowsPerPage
  );

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const isRawTab = activeTab === 'raw';
    const records = isRawTab ? rawRows : filteredSummaryRows;
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
    const records = isRawTab ? rawRows : filteredSummaryRows;
    const headers = records.length ? Object.keys(records[0]) : [];
    const rowsHtml = records
      .slice(0, 1000)
      .map(
        (row) => `<tr>${headers.map((key) => `<td>${String(row[key] ?? '-')}</td>`).join('')}</tr>`
      )
      .join('');

    const printTitle = t('attendancePage.print.title');
    const printRangeLabel = t('attendancePage.print.rangeLabel');
    const printTabLabel = isRawTab
      ? t('attendancePage.print.rawTitle')
      : t('attendancePage.print.summaryTitle');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${printTitle}</title><style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
      th { background: #f1f5f9; }
    </style></head><body>
      <h2>${printTabLabel} (${printRangeLabel}: ${from} - ${to})</h2>
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <div>
        {getUIText('attendancePage.pager.showing', resolvedLocale)
          .replace('{{from}}', String((page - 1) * rowsPerPage + 1))
          .replace('{{to}}', String(Math.min(page * rowsPerPage, meta.total)))
          .replace('{{total}}', String(meta.total))}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-rows" className="ui-control-label">
          {t('attendanceShared.rows')}
        </label>
        <select
          id="attendance-rows"
          value={rowsPerPage}
          onChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            resetPages();
          }}
          className="ui-control-select !w-auto min-h-0 py-1 pl-2 pr-8 text-xs"
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
          className="ui-btn-secondary min-h-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('attendanceShared.previous')}
        </button>
        <span className="font-mono text-foreground">
          {page}/{meta.pages}
        </span>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(meta.pages, prev + 1))}
          disabled={page >= meta.pages}
          className="ui-btn-secondary min-h-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('attendanceShared.next')}
        </button>
      </div>
    </div>
  );

  const renderRawPager = () => (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <div>
        {getUIText('attendancePage.pager.showing', resolvedLocale)
          .replace('{{from}}', String(rawRows.length === 0 ? 0 : (rawPage - 1) * rawLimit + 1))
          .replace('{{to}}', String(Math.min((rawPage - 1) * rawLimit + rawRows.length, rawTotal)))
          .replace('{{total}}', String(rawTotal))}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-raw-rows" className="ui-control-label">
          {t('attendanceShared.rows')}
        </label>
        <select
          id="attendance-raw-rows"
          value={rawLimit}
          onChange={(event) => {
            setRawLimit(Number(event.target.value));
            setRawPage(1);
          }}
          className="ui-control-select !w-auto min-h-0 py-1 pl-2 pr-8 text-xs"
        >
          {[20, 50, 100, 200, 500].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRawPage((prev) => Math.max(1, prev - 1))}
          disabled={rawPage <= 1}
          className="ui-btn-secondary min-h-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('attendanceShared.previous')}
        </button>
        <span className="font-mono text-foreground">
          {rawPage}/{rawPages}
        </span>
        <button
          type="button"
          onClick={() => setRawPage((prev) => Math.min(rawPages, prev + 1))}
          disabled={rawPage >= rawPages}
          className="ui-btn-secondary min-h-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('attendanceShared.next')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="ui-page-shell max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">
            {t('attendancePage.header.label')}
          </p>
          <h1 className="text-3xl font-bold text-foreground">{t('attendancePage.header.title')}</h1>
          <p className="ui-readable-muted mt-1">{t('attendancePage.header.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link
              href="/attendance/review"
              className="ui-btn-secondary border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            >
              {t('attendancePage.actions.reviewPunches')}
            </Link>
          )}
          <button
            type="button"
            onClick={exportExcel}
            className="ui-btn-secondary border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          >
            <FileSpreadsheet className="h-4 w-4" /> {t('attendancePage.actions.exportExcel')}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="ui-btn-secondary border-teal-500/30 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20"
          >
            <Download className="h-4 w-4" /> {t('attendancePage.actions.exportCsv')}
          </button>
          <button type="button" onClick={printCurrentTab} className="ui-btn-secondary">
            <Printer className="h-4 w-4" /> {t('attendancePage.actions.printPdf')}
          </button>
        </div>
      </div>

      <AttendanceFilters
        from={from}
        to={to}
        count={activeTab === 'raw' ? rawTotal : filteredSummaryRows.length}
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

      {!isAdmin && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ui-card-shell p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-teal-400">
              {t('attendancePage.roleScope.eyebrow')}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">
              {t('attendancePage.roleScope.title')}
            </h2>
            {!roleScopeSummary?.cumulative ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('attendancePage.roleScope.empty')}
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="ui-card-muted p-2">
                  <p className="text-muted-foreground">{t('attendancePage.roleScope.totalDays')}</p>
                  <p className="mt-1 font-mono text-foreground">
                    {toSafeNumber(roleScopeSummary.cumulative.total_days)}
                  </p>
                </div>
                <div className="ui-card-muted p-2">
                  <p className="text-muted-foreground">{t('attendancePage.roleScope.totalScan')}</p>
                  <p className="mt-1 font-mono text-foreground">
                    {toSafeNumber(roleScopeSummary.cumulative.total_scans)}
                  </p>
                </div>
                <div className="ui-card-muted p-2">
                  <p className="text-muted-foreground">{t('attendancePage.roleScope.late')}</p>
                  <p className="mt-1 font-mono text-amber-300">
                    {toSafeNumber(roleScopeSummary.cumulative.late_days)}
                  </p>
                </div>
                <div className="ui-card-muted p-2">
                  <p className="text-muted-foreground">
                    {t('attendancePage.roleScope.earlyLeave')}
                  </p>
                  <p className="mt-1 font-mono text-rose-300">
                    {toSafeNumber(roleScopeSummary.cumulative.early_leave_days)}
                  </p>
                </div>
                <div className="ui-card-muted p-2">
                  <p className="text-muted-foreground">{t('attendancePage.roleScope.reviewed')}</p>
                  <p className="mt-1 font-mono text-emerald-300">
                    {toSafeNumber(roleScopeSummary.cumulative.reviewed_days)}
                  </p>
                </div>
                <div className="ui-card-muted p-2">
                  <p className="text-muted-foreground">
                    {t('attendancePage.roleScope.pendingReview')}
                  </p>
                  <p className="mt-1 font-mono text-amber-300">
                    {toSafeNumber(roleScopeSummary.cumulative.pending_review_days)}
                  </p>
                </div>
                <div className="ui-card-muted col-span-2 p-2">
                  <p className="text-muted-foreground">
                    {t('attendancePage.roleScope.avgDuration')}
                  </p>
                  <p className="mt-1 font-mono text-foreground">
                    {formatMinutesToHours(roleScopeSummary.cumulative.average_duration_minutes)}
                  </p>
                </div>
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              {getUIText('attendancePage.roleScope.footer', resolvedLocale)
                .replace('{{employees}}', String(roleScopeSummary?.employeesInScope || 0))
                .replace('{{records}}', String(roleScopeSummary?.recordsInScope || 0))}
            </p>
          </section>

          <section className="ui-card-shell p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-teal-400">
              {t('attendancePage.prediction.eyebrow')}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">
              {t('attendancePage.prediction.title')}
            </h2>
            {!roleScopeSummary?.prediction?.hasData ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('attendancePage.prediction.empty')}
              </p>
            ) : (
              <div className="mt-4 space-y-3 text-xs">
                <div className="ui-card-muted p-3">
                  <p className="text-muted-foreground">
                    {t('attendancePage.prediction.monthTarget')}
                  </p>
                  <p className="mt-1 font-mono text-foreground">
                    {roleScopeSummary.prediction.yearMonth || '-'}
                  </p>
                </div>
                <div className="ui-card-muted p-3">
                  <p className="text-muted-foreground">
                    {t('attendancePage.prediction.monthlyMinimum')}
                  </p>
                  <p className="mt-1 font-mono text-sky-300">
                    {roleScopeSummary.prediction.minimumHours != null
                      ? `${roleScopeSummary.prediction.minimumHours} ${t('attendancePage.prediction.hourSuffix')}`
                      : '-'}
                  </p>
                </div>
                <div className="ui-card-muted p-3">
                  <p className="text-muted-foreground">
                    {t('attendancePage.prediction.targetSource')}
                  </p>
                  <p className="mt-1 font-mono text-foreground">
                    {formatTargetSource(roleScopeSummary.prediction.targetSource)}
                  </p>
                </div>
                {roleScopeSummary.prediction.hasMixedPrediction && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    {t('attendancePage.prediction.mixedWarning')}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="ui-card-shell flex flex-wrap gap-2 p-2">
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
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="ui-table-shell">
          <AttendanceTable
            loading={loading}
            rows={pagedSummaryRows}
            onEdit={canEditNotes ? setEditing : null}
          />
          {renderPager(summaryPage, setSummaryPage, summaryMeta)}
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="ui-table-shell">
          <InlineStatusPanel
            message={rawError}
            variant="error"
            actionLabel={t('attendancePage.raw.retry')}
            onAction={() => loadRaw()}
            className="m-4"
          />
          <TableShell>
            <table className="w-full text-sm">
              <thead className="ui-table-head">
                <tr className="text-left">
                  <th className="ui-table-head-cell px-4 py-3">{t('attendancePage.raw.date')}</th>
                  <th className="ui-table-head-cell px-4 py-3">{t('attendancePage.raw.time')}</th>
                  <th className="ui-table-head-cell px-4 py-3">{t('attendancePage.raw.pin')}</th>
                  <th className="ui-table-head-cell px-4 py-3">
                    {t('attendancePage.raw.employee')}
                  </th>
                  <th className="ui-table-head-cell px-4 py-3">{t('attendancePage.raw.group')}</th>
                  <th className="ui-table-head-cell px-4 py-3">{t('attendancePage.raw.review')}</th>
                  <th className="ui-table-head-cell px-4 py-3">
                    {t('attendancePage.raw.verifyIoWorkcode')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rawLoading ? (
                  <TableLoadingRow colSpan={7} />
                ) : rawRows.length === 0 ? (
                  <TableEmptyRow colSpan={7} label={t('attendancePage.raw.empty')} />
                ) : (
                  rawRows.map((row) => (
                    <tr
                      key={`${row.pin}-${row.scan_date}-${row.scan_time}-${row.verifymode}-${row.iomode}-${row.workcode}`}
                      className="ui-table-row"
                    >
                      <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">
                        {String(row.scan_date).slice(0, 10)}
                      </td>
                      <td className="ui-table-cell px-4 py-3 font-mono text-xs text-teal-300">
                        {String(row.scan_time).slice(0, 8)}
                      </td>
                      <td className="ui-table-cell px-4 py-3 font-mono text-xs text-foreground">
                        {row.pin}
                      </td>
                      <td className="ui-table-cell px-4 py-3 text-foreground">
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
                      <td className="ui-table-cell-muted px-4 py-3 text-xs">
                        {row.nama_group || '-'}
                      </td>
                      <td className="ui-table-cell px-4 py-3">
                        {row.reviewed_status === 'reviewed' ? (
                          <span className="inline-flex rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                            {t('attendancePage.raw.reviewed')}
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                            {t('attendancePage.raw.pending')}
                          </span>
                        )}
                      </td>
                      <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">
                        {row.verifymode}/{row.iomode}/{row.workcode}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableShell>
          {renderRawPager()}
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="ui-card-shell p-4">
            <h2 className="text-sm font-semibold text-foreground">
              {t('attendancePage.dashboard.title')}
            </h2>
            <div className="mt-4 space-y-2">
              {filteredLateData.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('attendancePage.dashboard.empty')}
                </p>
              ) : (
                pagedLateData.map((item) => (
                  <div key={`${item.pin}-${item.nama}`} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground">
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
                        <span className="text-muted-foreground">(PIN {item.pin})</span>
                      </span>
                      <span className="font-mono text-amber-300">
                        {item.lateCount} {t('attendancePage.dashboard.lateSuffix')}
                      </span>
                    </div>
                    <div className="h-2 rounded bg-muted">
                      <div
                        className="h-2 rounded bg-amber-400"
                        style={{
                          width: `${Math.max((item.lateCount / maxLate) * 100, item.lateCount ? 8 : 0)}%`,
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {t('attendancePage.dashboard.group')}: {item.group} |{' '}
                      {t('attendancePage.dashboard.anomaly')}: {item.anomalyCount} |{' '}
                      {t('attendancePage.dashboard.earlyLeave')}: {item.earlyCount} |{' '}
                      {t('attendancePage.dashboard.records')}: {item.totalRows}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <TableShell>
            <table className="w-full text-sm">
              <thead className="ui-table-head">
                <tr className="text-left">
                  <th className="ui-table-head-cell px-4 py-2">
                    {t('attendancePage.dashboard.employee')}
                  </th>
                  <th className="ui-table-head-cell px-4 py-2">{t('attendancePage.raw.group')}</th>
                  <th className="ui-table-head-cell px-4 py-2">
                    {t('attendancePage.dashboard.late')}
                  </th>
                  <th className="ui-table-head-cell px-4 py-2">
                    {t('attendancePage.dashboard.earlyLeave')}
                  </th>
                  <th className="ui-table-head-cell px-4 py-2">
                    {t('attendancePage.dashboard.anomaly')}
                  </th>
                  <th className="ui-table-head-cell px-4 py-2">
                    {t('attendancePage.dashboard.totalRows')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedLateData.map((item) => (
                  <tr key={`dashboard-${item.pin}-${item.nama}`} className="ui-table-row">
                    <td className="ui-table-cell px-4 py-2 text-foreground">
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
                    <td className="ui-table-cell-muted px-4 py-2 text-xs">{item.group}</td>
                    <td className="ui-table-cell px-4 py-2 font-mono text-xs text-amber-300">
                      {item.lateCount}
                    </td>
                    <td className="ui-table-cell px-4 py-2 font-mono text-xs text-rose-300">
                      {item.earlyCount}
                    </td>
                    <td className="ui-table-cell px-4 py-2 font-mono text-xs text-foreground">
                      {item.anomalyCount}
                    </td>
                    <td className="ui-table-cell-muted px-4 py-2 font-mono text-xs">
                      {item.totalRows}
                    </td>
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
