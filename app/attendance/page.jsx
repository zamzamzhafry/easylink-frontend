'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, PieChart, Printer } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import AttendanceFilters from '@/components/attendance/attendance-filters';
import AttendanceTable from '@/components/attendance/attendance-table';
import NoteModal from '@/components/attendance/note-modal';
import QuickSummariesTable from '@/components/schedule/quick-summaries-table';
import { SvgBarChart, SvgPieChart } from '@/components/ui/charts';
import { Button } from '@/components/ui/button';
import InlineStatusPanel from '@/components/ui/inline-status-panel';

import { useToast } from '@/components/ui/toast-provider';
import {
  attendanceCsv,
  countAnomalies,
  endOfRange,
  isoDate,

  startOfRange,
} from '@/lib/attendance-helpers';
import {
  buildQuickSummariesMetadataRows,
  buildQuickSummariesTableColumns,
  quickSummaryDateLabel,
  quickSummaryRowsToArrays,
  sanitizeExcelSheetName,
  splitQuickSummaryRowsByGroup,
} from '@/lib/quick-summaries-export';
import { requestJson } from '@/lib/request-json';
import { getUIText } from '@/lib/localization/ui-texts';

import { PAGE_SIZE_OPTIONS } from '@/lib/constants';
import useAuthSession from '@/hooks/use-auth-session';
import {
  canAccessAttendanceReviewQueue,
  canAccessRawAttendance,
  canManageAttendanceNotes,
  getAttendanceScope,
} from '@/lib/authz/authorization-adapter';

const ALL_TABS = ['summary', 'quick_summaries'];

const ATTENDANCE_PIE_COLORS = {
  on_time: '#10b981',
  late: '#f59e0b',
  early_leave: '#fb7185',
  anomaly: '#a78bfa',
};

const FOCUS_REFRESH_THROTTLE_MS = 15_000;

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

const buildDateRange = (from, to) => {
  if (!from || !to) return [];
  const dates = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const buildYearRange = (from, to) => {
  const fromYear = Number(String(from || '').slice(0, 4));
  const toYear = Number(String(to || '').slice(0, 4));
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear) || fromYear > toYear) return [];
  const years = [];
  for (let year = fromYear; year <= toYear; year += 1) years.push(year);
  return years;
};

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return text.includes('T') ? text.slice(0, 10) : text.slice(0, 10);
};

const compactDateWithDay = (value, locale = 'id-ID') => {
  const normalized = normalizeDateKey(value);
  if (!normalized) return '-';
  return quickSummaryDateLabel(normalized, locale);
};

const quickSummaryDayMeta = (dateValue, holidayMap, todayIso) => {
  const isoDate = normalizeDateKey(dateValue);
  const weekday = new Date(`${isoDate}T00:00:00`).getDay();
  return {
    isoDate,
    isToday: isoDate === todayIso,
    isSunday: weekday === 0,
    isFriday: weekday === 5,
    holiday: holidayMap?.[isoDate] || null,
  };
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

const filterQuickSummaryRowsByEmployee = (rows, employeeFilter) => {
  const source = Array.isArray(rows) ? rows : [];
  if (!employeeFilter) return source;

  if (employeeFilter.startsWith('emp-')) {
    const employeeId = employeeFilter.slice(4);
    return source.filter(
      (row) => String(row?.employee?.id ?? row?.employee?.karyawan_id ?? '') === employeeId
    );
  }

  if (employeeFilter.startsWith('pin-')) {
    const pin = employeeFilter.slice(4);
    return source.filter((row) => String(row?.employee?.pin ?? '') === pin);
  }

  return source;
};

export default function AttendancePage() {
  const { warning } = useToast();
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const { user: currentUser } = useAuthSession();
  const [activeTab, setActiveTab] = useState('summary');
  const [from, setFrom] = useState(startOfRange('week'));
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState([]);
  const [quickSummariesData, setQuickSummariesData] = useState({
    from: '',
    to: '',
    dates: [],
    rows: [],
  });
  const [quickSummariesLoading, setQuickSummariesLoading] = useState(false);

  const [quickSummariesError, setQuickSummariesError] = useState('');
  const [holidayMap, setHolidayMap] = useState({});
  const [quickSummaryExportScope, setQuickSummaryExportScope] = useState('current');
  const [scopePayload, setScopePayload] = useState({
    cumulative_summary: null,
    prediction_context: null,
  });
  const [interactiveReport, setInteractiveReport] = useState({
    filters: null,
    series: { pie: [], bar: [] },
    drilldown: { rows: [], total: 0 },
    metadata: { totalRecords: 0, availableGroups: [], availableEmployees: [] },
  });
  const [drilldownState, setDrilldownState] = useState({
    status: null,
    group: null,
  });
  const [groups, setGroups] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [summaryPage, setSummaryPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const displayLocale = resolvedLocale === 'id' ? 'id-ID' : 'en-US';
  const warningRef = useRef(warning);
  const tRef = useRef(t);
  const lastRefreshAtRef = useRef(0);
  const groupsWarnedRef = useRef(false);
  const holidaysWarnedRef = useRef(false);

  useEffect(() => {
    warningRef.current = warning;
  }, [warning]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const attendanceScope = getAttendanceScope(currentUser);
  const isAdmin = canAccessRawAttendance(currentUser);
  const isLeader = attendanceScope === 'leader';
  const isEmployee = attendanceScope === 'employee';
  const canEditNotes = canManageAttendanceNotes(currentUser);
  const canAccessReviewQueue = canAccessAttendanceReviewQueue(currentUser);
  const TABS = useMemo(
    () => ALL_TABS.map((key) => ({ key, label: t(`attendancePage.tabs.${key}`) })),
    [t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const query = new URLSearchParams({ from, to, reporting: 'interactive' });
      if (groupId) query.set('group_id', groupId);
      if (drilldownState.status) query.set('drilldown_status', drilldownState.status);
      if (drilldownState.group) query.set('drilldown_group', drilldownState.group);
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
      setInteractiveReport(
        !Array.isArray(data) && data?.interactive_report && typeof data.interactive_report === 'object'
          ? {
              filters: data.interactive_report.filters || null,
              series: {
                pie: Array.isArray(data.interactive_report?.series?.pie)
                  ? data.interactive_report.series.pie
                  : [],
                bar: Array.isArray(data.interactive_report?.series?.bar)
                  ? data.interactive_report.series.bar
                  : [],
              },
              drilldown: {
                rows: Array.isArray(data.interactive_report?.drilldown?.rows)
                  ? data.interactive_report.drilldown.rows
                  : [],
                total: toSafeNumber(data.interactive_report?.drilldown?.total),
              },
              metadata: data.interactive_report.metadata || {
                totalRecords: 0,
                availableGroups: [],
                availableEmployees: [],
              },
            }
          : {
              filters: null,
              series: { pie: [], bar: [] },
              drilldown: { rows: [], total: 0 },
              metadata: { totalRecords: 0, availableGroups: [], availableEmployees: [] },
            }
      );
    } catch (error) {
      setRows([]);
      setScopePayload({ cumulative_summary: null, prediction_context: null });
      setInteractiveReport({
        filters: null,
        series: { pie: [], bar: [] },
        drilldown: { rows: [], total: 0 },
        metadata: { totalRecords: 0, availableGroups: [], availableEmployees: [] },
      });
      const message = error.message || tRef.current('attendancePage.errors.loadFailed');
      setLoadError(message);
      warningRef.current(
        message,
        tRef.current('reportPage.errors.requestFailed')
      );
    } finally {
      setLoading(false);
    }
  }, [drilldownState.group, drilldownState.status, from, to, groupId]);

  const loadQuickSummaries = useCallback(async () => {
    setQuickSummariesLoading(true);
    setQuickSummariesError('');
    try {
      const query = new URLSearchParams({ from, to });
      if (groupId) query.set('group_id', String(groupId));
      const data = await requestJson(`/api/schedule/quick-summaries?${query.toString()}`);
      setQuickSummariesData({
        from: String(data?.from || from),
        to: String(data?.to || to),
        dates: Array.isArray(data?.dates)
          ? data.dates.map((dateValue) => String(dateValue).slice(0, 10))
          : buildDateRange(from, to),
        rows: Array.isArray(data?.rows) ? data.rows : [],
      });
    } catch (error) {
      setQuickSummariesError(
        error.message || 'Failed to load quick summaries for selected date range.'
      );
      setQuickSummariesData({
        from,
        to,
        dates: buildDateRange(from, to),
        rows: [],
      });
    } finally {
      setQuickSummariesLoading(false);
    }
  }, [from, to, groupId]);

  const refreshActiveTab = useCallback(async () => {
    lastRefreshAtRef.current = Date.now();
    if (activeTab === 'quick_summaries') {
      await loadQuickSummaries();
      return;
    }
    await load();
  }, [activeTab, load, loadQuickSummaries]);

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
      groupsWarnedRef.current = false;
    } catch {
      setGroups([]);
      if (!groupsWarnedRef.current) {
        groupsWarnedRef.current = true;
        warningRef.current(
          tRef.current('attendancePage.errors.groupsFailedMessage'),
          tRef.current('attendancePage.errors.groupsFailedTitle')
        );
      }
    }
  }, [currentUser, isAdmin]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab !== 'quick_summaries') return;
    loadQuickSummaries();
  }, [activeTab, loadQuickSummaries]);

  useEffect(() => {
    const handleWindowFocusRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      void refreshActiveTab();
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      void refreshActiveTab();
    };

    window.addEventListener('focus', handleWindowFocusRefresh);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', handleWindowFocusRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [refreshActiveTab]);

  useEffect(() => {
    const years = buildYearRange(from, to);
    if (years.length === 0) {
      setHolidayMap({});
      return;
    }

    let cancelled = false;

    Promise.all(
      years.map((year) =>
        requestJson(`/api/holidays?year=${year}`).catch(() => ({
          rows: [],
        }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map();
        results.forEach((result) => {
          (result?.rows || []).forEach((row) => {
            if (!row?.date) return;
            map.set(row.date, {
              name: row.name || 'Hari Libur',
              isCutiBersama: Boolean(row.is_cuti_bersama),
            });
          });
        });
        setHolidayMap(Object.fromEntries(map.entries()));
        holidaysWarnedRef.current = false;
      })
      .catch(() => {
        if (cancelled) return;
        setHolidayMap({});
        if (!holidaysWarnedRef.current) {
          holidaysWarnedRef.current = true;
          warningRef.current(
            tRef.current('attendancePage.errors.holidaysFailedMessage'),
            tRef.current('attendancePage.errors.holidaysFailedTitle')
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const handleSetRange = useCallback((unit) => {
    if (unit === 'today') {
      const today = isoDate();
      setFrom(today);
      setTo(today);
      return;
    }

    setFrom(startOfRange(unit));
    setTo(endOfRange(unit));
  }, []);

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

  const filteredQuickSummaryRows = useMemo(() => {
    return filterQuickSummaryRowsByEmployee(quickSummariesData?.rows, employeeFilter);
  }, [quickSummariesData, employeeFilter]);

  const quickSummaryEmployees = useMemo(
    () => filteredQuickSummaryRows.map((row) => row.employee).filter(Boolean),
    [filteredQuickSummaryRows]
  );

  const quickSummaryRowMap = useMemo(() => {
    const map = new Map();
    filteredQuickSummaryRows.forEach((row) => {
      const employeeId = Number(row?.employee?.id);
      if (!employeeId || map.has(employeeId)) return;
      map.set(employeeId, row);
    });
    return map;
  }, [filteredQuickSummaryRows]);

  const quickSummaryDates = useMemo(() => {
    if (Array.isArray(quickSummariesData?.dates) && quickSummariesData.dates.length > 0) {
      return quickSummariesData.dates;
    }
    return buildDateRange(from, to);
  }, [quickSummariesData, from, to]);

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

  const pieSeries = useMemo(
    () =>
      (Array.isArray(interactiveReport?.series?.pie) ? interactiveReport.series.pie : []).map(
        (item, index) => ({
          ...item,
          label: String(item?.name || item?.key || `Series ${index + 1}`),
          value: toSafeNumber(item?.value),
          color:
            ATTENDANCE_PIE_COLORS[String(item?.key || '').toLowerCase()] ||
            item?.color ||
            '#22d3ee',
        })
      ),
    [interactiveReport]
  );

  const pieTotal = useMemo(
    () => pieSeries.reduce((sum, item) => sum + toSafeNumber(item.value), 0),
    [pieSeries]
  );

  const barRows = useMemo(() => {
    return (Array.isArray(interactiveReport?.series?.bar) ? interactiveReport.series.bar : []).map(
      (item, index) => ({
        ...item,
        id: item?.category || `group-${index}`,
        label: String(item?.category || `Group ${index + 1}`),
        value: toSafeNumber(item?.total),
        color: item?.color || '#22d3ee',
      })
    );
  }, [interactiveReport]);

  const barMax = useMemo(
    () => Math.max(...barRows.map((row) => row.value), 1),
    [barRows]
  );

  const barHasUniformTarget = useMemo(() => {
    const targets = barRows
      .map((row) => toSafeNumber(row?.prediction_context?.minimum_hours))
      .filter((v) => v > 0);
    if (targets.length === 0) return false;
    return targets.every((v) => v === targets[0]);
  }, [barRows]);

  const barUniformTargetValue = useMemo(() => {
    if (!barHasUniformTarget) return null;
    const first = barRows.find((row) => toSafeNumber(row?.prediction_context?.minimum_hours) > 0);
    return first ? toSafeNumber(first.prediction_context.minimum_hours) : null;
  }, [barRows, barHasUniformTarget]);

  const drilldownRows = useMemo(
    () => (Array.isArray(interactiveReport?.drilldown?.rows) ? interactiveReport.drilldown.rows : []),
    [interactiveReport]
  );

  const handlePieClick = useCallback((item) => {
    const nextKey = item?.key || null;
    setDrilldownState((current) => ({
      ...current,
      status: current.status === nextKey ? null : nextKey,
    }));
  }, []);

  const handleBarClick = useCallback((item) => {
    const nextGroup = item?.label || item?.category || null;
    setDrilldownState((current) => ({
      ...current,
      group: current.group === nextGroup ? null : nextGroup,
    }));
  }, []);

  const clearDrilldownFilters = useCallback(() => {
    setDrilldownState({ status: null, group: null });
  }, []);

  const pageMeta = (total) => {
    const pages = Math.max(1, Math.ceil(total / rowsPerPage));
    return { pages, total };
  };

  const summaryMeta = pageMeta(filteredSummaryRows.length);

  const pagedSummaryRows = filteredSummaryRows.slice(
    (summaryPage - 1) * rowsPerPage,
    summaryPage * rowsPerPage
  );

  const selectedGroupLabel = useMemo(() => {
    if (groupId) {
      const selected = groups.find((group) => String(group.id) === String(groupId));
      if (selected?.nama_group) return selected.nama_group;
      return `Group ${groupId}`;
    }
    return t('attendancePage.print.allGroupsFallback');
  }, [groupId, groups, t]);

  const quickSummaryRangeLabel = useMemo(
    () =>
      `${compactDateWithDay(quickSummariesData?.from || from, displayLocale)} - ${compactDateWithDay(
        quickSummariesData?.to || to,
        displayLocale
      )}`,
    [quickSummariesData, from, to, displayLocale]
  );

  const quickSummaryScopeLabel = useMemo(
    () =>
      quickSummaryExportScope === 'all'
        ? t('attendancePage.actions.exportScopeAllGroups')
        : selectedGroupLabel,
    [quickSummaryExportScope, selectedGroupLabel, t]
  );

  const loadQuickSummaryExportData = useCallback(
    async (scope) => {
      if (scope === 'all') {
        const query = new URLSearchParams({ from, to });
        const data = await requestJson(`/api/schedule/quick-summaries?${query.toString()}`);
        const rows = filterQuickSummaryRowsByEmployee(data?.rows, employeeFilter);
        const dates =
          Array.isArray(data?.dates) && data.dates.length > 0
            ? data.dates.map((dateValue) => String(dateValue || '').slice(0, 10))
            : buildDateRange(from, to);
        return {
          from: String(data?.from || from),
          to: String(data?.to || to),
          rows,
          dates,
        };
      }

      return {
        from: String(quickSummariesData?.from || from),
        to: String(quickSummariesData?.to || to),
        rows: filteredQuickSummaryRows,
        dates: quickSummaryDates,
      };
    },
    [from, to, quickSummariesData, employeeFilter, filteredQuickSummaryRows, quickSummaryDates]
  );

  const buildQuickSummaryColumns = useCallback(
    (dates) =>
      buildQuickSummariesTableColumns(dates).map((column) => {
        if (column.key === 'employee_name') {
          return { ...column, label: t('attendancePage.raw.employee') };
        }
        if (column.key === 'employee_group') {
          return { ...column, label: t('attendancePage.print.groupLabel') };
        }
        if (column.key === 'total_punches') {
          return { ...column, label: t('attendancePage.print.totalPunches') };
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(column.key)) {
          return { ...column, label: quickSummaryDateLabel(column.key, displayLocale) };
        }
        return column;
      }),
    [t, displayLocale]
  );

  const exportCsv = async () => {
    const isQuickTab = activeTab === 'quick_summaries';

    if (!isQuickTab) {
      const csv = attendanceCsv(filteredSummaryRows);
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `absensi_${from}_${to}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }

    const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    try {
      const scope = quickSummaryExportScope;
      const quickData = await loadQuickSummaryExportData(scope);
      const columns = buildQuickSummaryColumns(quickData.dates);
      const headerRow = columns.map((column) => column.label);
      const lines = [
        ...buildQuickSummariesMetadataRows(
          {
            reportTitle: t('attendancePage.tabs.quick_summaries'),
            from: quickData.from,
            to: quickData.to,
            groupLabel: quickSummaryScopeLabel,
          },
          {
            labels: {
              report: t('attendancePage.print.title'),
              dateRange: t('attendancePage.print.dateRangeLabel'),
              group: t('attendancePage.print.groupLabel'),
            },
          }
        ),
        headerRow,
        ...quickSummaryRowsToArrays(quickData.rows, quickData.dates, {
          emptyGroupLabel: t('attendancePage.print.allGroupsFallback'),
          emptyCellLabel: '-',
        }),
      ];

      const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `quick_summaries_${quickData.from}_${quickData.to}${
        scope === 'all' ? '_all_groups' : ''
      }.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      warning(error.message || t('reportPage.errors.fetchFailed'), t('reportPage.errors.requestFailed'));
    }
  };

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const isQuickTab = activeTab === 'quick_summaries';
    const ungroupedLabel = t('attendancePage.print.allGroupsFallback') || 'Ungrouped';

    if (!isQuickTab) {
      const workbook = XLSX.utils.book_new();

      const infoRows = [
        [t('attendancePage.print.title') || 'Attendance Summary'],
        [`${t('attendancePage.print.dateRangeLabel') || 'Date Range'}: ${from} — ${to}`],
        [],
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(infoRows), 'Info');

      const groupBuckets = new Map();
      const ungrouped = [];
      for (const row of filteredSummaryRows) {
        const gName = String(row.nama_group || '').trim();
        if (gName) {
          if (!groupBuckets.has(gName)) groupBuckets.set(gName, []);
          groupBuckets.get(gName).push(row);
        } else {
          ungrouped.push(row);
        }
      }

      for (const [gName, gRows] of groupBuckets) {
        const ws = XLSX.utils.json_to_sheet(gRows);
        XLSX.utils.book_append_sheet(workbook, ws, sanitizeExcelSheetName(gName));
      }
      if (ungrouped.length > 0) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(ungrouped),
          sanitizeExcelSheetName(ungroupedLabel, 'Ungrouped')
        );
      }
      if (groupBuckets.size === 0 && ungrouped.length === 0) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['No data']]), 'Attendance');
      }

      XLSX.writeFile(workbook, `absensi_${from}_${to}.xlsx`);
      return;
    }

    try {
      const scope = quickSummaryExportScope;
      const quickData = await loadQuickSummaryExportData(scope);
      const columns = buildQuickSummaryColumns(quickData.dates);
      const headerRow = columns.map((column) => column.label);
      const workbook = XLSX.utils.book_new();

      const infoRows = [
        ...buildQuickSummariesMetadataRows(
          {
            reportTitle: t('attendancePage.tabs.quick_summaries'),
            from: quickData.from,
            to: quickData.to,
            groupLabel: quickSummaryScopeLabel,
          },
          {
            labels: {
              report: t('attendancePage.print.title'),
              dateRange: t('attendancePage.print.dateRangeLabel'),
              group: t('attendancePage.print.groupLabel'),
            },
          }
        ),
      ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(infoRows), 'Info');

      const groupBuckets = splitQuickSummaryRowsByGroup(quickData.rows, {
        emptyGroupLabel: ungroupedLabel,
      });

      for (const bucket of groupBuckets) {
        const sheetRows = [
          headerRow,
          ...quickSummaryRowsToArrays(bucket.rows, quickData.dates, {
            emptyGroupLabel: ungroupedLabel,
            emptyCellLabel: '-',
          }),
        ];
        const ws = XLSX.utils.aoa_to_sheet(sheetRows);
        XLSX.utils.book_append_sheet(
          workbook,
          ws,
          sanitizeExcelSheetName(bucket.groupName, 'Ungrouped')
        );
      }
      if (groupBuckets.length === 0) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headerRow, ['No data']]), 'Quick');
      }

      XLSX.writeFile(
        workbook,
        `quick_summaries_${quickData.from}_${quickData.to}${scope === 'all' ? '_all_groups' : ''}.xlsx`
      );
    } catch (error) {
      warning(error.message || t('reportPage.errors.fetchFailed'), t('reportPage.errors.requestFailed'));
    }
  };

  const printCurrentTab = async () => {
    const escapeHtml = (value) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const isQuickTab = activeTab === 'quick_summaries';

    if (isQuickTab) {
      try {
        const scope = quickSummaryExportScope;
        const quickData = await loadQuickSummaryExportData(scope);
        const columns = buildQuickSummaryColumns(quickData.dates);
        const todayIso = normalizeDateKey(new Date());
        const columnMetas = columns.map((column) =>
          /^\d{4}-\d{2}-\d{2}$/.test(String(column.key))
            ? quickSummaryDayMeta(column.key, holidayMap, todayIso)
            : null
        );

        const columnClassName = (columnIndex) => {
          const meta = columnMetas[columnIndex];
          if (!meta) return '';
          if (meta.holiday) return 'holiday-col';
          if (meta.isSunday) return 'sunday-col';
          if (meta.isFriday) return 'friday-col';
          if (meta.isToday) return 'today-col';
          return '';
        };

        const headerHtml = columns
          .map((column, index) => {
            const columnClass = columnClassName(index);
            return `<th class="${columnClass}">${escapeHtml(column.label)}</th>`;
          })
          .join('');

        const bodyRows = quickSummaryRowsToArrays(quickData.rows, quickData.dates, {
          emptyGroupLabel: t('attendancePage.print.allGroupsFallback'),
          emptyCellLabel: '-',
        });
        const bodyHtml = bodyRows
          .map(
            (line) =>
              `<tr>${line
                .map(
                  (value, index) =>
                    `<td class="${columnClassName(index)}">${escapeHtml(String(value ?? '-'))}</td>`
                )
                .join('')}</tr>`
          )
          .join('');

        const printTitle = t('attendancePage.tabs.quick_summaries');
        const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(
          t('attendancePage.print.title')
        )}</title><style>
          @page { size: A4 landscape; margin: 4mm; }
          body { font-family: Arial, sans-serif; margin: 0; color: #111827; padding: 2mm; }
          h1 { margin: 0 0 4px; font-size: 16px; }
          p.meta { margin: 1px 0; font-size: 10px; color: #4b5563; }
          table { border-collapse: collapse; width: 100%; font-size: 8.5px; table-layout: fixed; margin-top: 8px; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
          th, td { border: 1px solid #d1d5db; padding: 3px; text-align: left; vertical-align: top; word-break: break-word; line-height: 1.25; }
          th { background: #f1f5f9; }
          th:first-child, td:first-child { width: 140px; }
          th:nth-child(2), td:nth-child(2) { width: 70px; }
          th:nth-child(3), td:nth-child(3) { width: 72px; text-align: center; }
          .holiday-col { background: #ffe4e6; color: #9f1239; }
          .sunday-col { background: #fff1f2; color: #9f1239; }
          .friday-col { background: #ecfdf5; color: #065f46; }
          .today-col { background: #ecfeff; color: #155e75; }
        </style></head><body>
          <h1>${escapeHtml(printTitle)}</h1>
          <p class="meta">${escapeHtml(`${t('attendancePage.print.dateRangeLabel')}: ${compactDateWithDay(quickData.from, displayLocale)} - ${compactDateWithDay(quickData.to, displayLocale)}`)}</p>
          <p class="meta">${escapeHtml(`${t('attendancePage.print.groupLabel')}: ${quickSummaryScopeLabel}`)}</p>
          <table>
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </body></html>`;

        const popup = window.open('', '_blank', 'width=1280,height=900');
        if (!popup) return;
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        popup.print();
      } catch (error) {
        warning(
          error.message || t('reportPage.errors.fetchFailed'),
          t('reportPage.errors.requestFailed')
        );
      }
      return;
    }

    const records = filteredSummaryRows;
    const headers = records.length ? Object.keys(records[0]) : [];
    const rowsHtml = records
      .slice(0, 1000)
      .map(
        (row) =>
          `<tr>${headers.map((key) => `<td>${escapeHtml(String(row[key] ?? '-'))}</td>`).join('')}</tr>`
      )
      .join('');

    const printTitle = t('attendancePage.print.title');
    const printRangeLabel = t('attendancePage.print.dateRangeLabel');
    const printTabLabel = t('attendancePage.print.summaryTitle');
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${printTitle}</title><style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
      th { background: #f1f5f9; }
    </style></head><body>
      <h2>${printTabLabel} (${printRangeLabel}: ${from} - ${to})</h2>
      <p>${t('attendancePage.print.groupLabel')}: ${selectedGroupLabel}</p>
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

  return (
    <div className="ui-page-shell max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-[hsl(var(--primary))]">
            {t('attendancePage.header.label')}
          </p>
          <h1 className="text-3xl font-bold text-foreground">{t('attendancePage.header.title')}</h1>
          <p className="ui-readable-muted mt-1">{t('attendancePage.header.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAccessReviewQueue && (
            <Link
              href="/attendance/review"
              className="ui-btn-secondary border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            >
              {t('attendancePage.actions.reviewPunches')}
            </Link>
          )}
          <Button type="button" onClick={exportExcel} variant="soft" tone="success" size="sm">
            <FileSpreadsheet className="h-4 w-4" /> {t('attendancePage.actions.exportExcel')}
          </Button>
          <Button type="button" onClick={exportCsv} variant="soft" tone="primary" size="sm">
            <Download className="h-4 w-4" /> {t('attendancePage.actions.exportCsv')}
          </Button>
          <Button type="button" onClick={printCurrentTab} variant="outline" tone="neutral" size="sm">
            <Printer className="h-4 w-4" /> {t('attendancePage.actions.printPdf')}
          </Button>
          {activeTab === 'quick_summaries' && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2 py-1">
              <span className="text-[11px] text-muted-foreground">
                {t('attendancePage.actions.exportScopeTitle')}:
              </span>
              <div className="inline-flex rounded-md border border-border/70 bg-background/80 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setQuickSummaryExportScope('current')}
                  className={`rounded px-2 py-1 transition-colors ${
                    quickSummaryExportScope === 'current'
                      ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('attendancePage.actions.exportScopeCurrentGroup')}
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSummaryExportScope('all')}
                  className={`rounded px-2 py-1 transition-colors ${
                    quickSummaryExportScope === 'all'
                      ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('attendancePage.actions.exportScopeAllGroups')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AttendanceFilters
        from={from}
        to={to}
        count={filteredSummaryRows.length}
        anomalyCount={countAnomalies(filteredSummaryRows)}
        groupId={groupId}
        groups={groups}
        employeeId={employeeFilter}
        employees={employeeOptions}
        incompleteOnly={incompleteOnly}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        onFromChange={setFrom}
        onToChange={setTo}
        onGroupChange={setGroupId}
        onEmployeeChange={setEmployeeFilter}
        onIncompleteOnlyChange={setIncompleteOnly}
        onRowsPerPageChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage);
          resetPages();
        }}
        onSetRange={handleSetRange}
        onRefresh={() => {
          void refreshActiveTab();
        }}
        refreshDisabled={loading || quickSummariesLoading}
      />


      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="ui-card-shell p-4">
          <div className="mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-foreground">{t('attendancePage.interactive.pieTitle')}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-[180px,1fr] sm:items-center">
            <div className="relative mx-auto h-40 w-40" aria-label={t('attendancePage.interactive.pieTitle')} role="img">
              <SvgPieChart data={pieSeries} onSegmentClick={handlePieClick} size={160} />
              <div className="pointer-events-none absolute inset-0 m-auto flex h-24 w-24 items-center justify-center rounded-full border border-border bg-background text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t('attendancePage.interactive.pieRowsLabel')}</p>
                  <p className="font-mono text-xl font-bold text-foreground">{pieTotal}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {pieSeries.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('attendancePage.interactive.pieEmpty')}</p>
              ) : (
                pieSeries.map((item) => {
                  const isSelected = drilldownState.status === item.key;
                  const isFaded = drilldownState.status && drilldownState.status !== item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handlePieClick(item)}
                      className={`ui-card-muted flex w-full items-center justify-between px-3 py-2 text-xs text-left transition ${isSelected ? 'ring-1 ring-border' : ''} ${isFaded ? 'opacity-40' : 'opacity-100'}`}
                    >
                      <span className="flex items-center gap-2 text-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {String(item.label || item.key)}
                      </span>
                      <span className="font-mono text-sm text-foreground">{item.value}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="ui-card-shell p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-foreground">{t('attendancePage.interactive.barTitle')}</h2>
            </div>
            {(drilldownState.status || drilldownState.group) && (
              <button type="button" onClick={clearDrilldownFilters} className="ui-btn-secondary min-h-0 px-2 py-1 text-xs">
                {t('attendancePage.interactive.clearDrilldown')}
              </button>
            )}
          </div>
          <div className="space-y-4">
            <div className="h-[220px]">
              <SvgBarChart
                data={barRows}
                onBarClick={handleBarClick}
                targetLine={barHasUniformTarget ? barUniformTargetValue : null}
              />
            </div>
            {barRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('attendancePage.interactive.barEmpty')}</p>
            ) : (
              barRows.map((row) => {
                const isSelected = drilldownState.group === row.label;
                const isFaded = drilldownState.group && drilldownState.group !== row.label;
                const minimumHours = toSafeNumber(row?.prediction_context?.minimum_hours);
                const targetPct = row.value > 0 && minimumHours > 0 ? Math.min(100, (minimumHours / row.value) * 100) : 0;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleBarClick(row)}
                    className={`ui-card-muted flex w-full flex-col gap-2 px-3 py-3 text-left transition ${isSelected ? 'ring-1 ring-border' : ''} ${isFaded ? 'opacity-40' : 'opacity-100'}`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{row.label}</span>
                      <span className="font-mono text-foreground">{row.value}</span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-cyan-400/70" style={{ width: `${barMax > 0 ? Math.min(100, (row.value / barMax) * 100) : 0}%` }} />
                      {targetPct > 0 && (
                        <span
                          className="absolute inset-y-0 w-px bg-amber-300"
                          style={{ left: `${targetPct}%` }}
                          title={t('attendancePage.interactive.targetTooltip').replace('{{hours}}', String(minimumHours))}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{row?.prediction_context?.year_month || '-'}</span>
                      <span>·</span>
                      <span>{minimumHours > 0 ? `${minimumHours}h` : '-'}</span>
                      <span>·</span>
                      <span>{row?.prediction_context?.target_source || '-'}</span>
                      {row?.prediction_context?.has_mixed_targets ? <span>· {t('attendancePage.interactive.mixedTarget')}</span> : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      {isLeader && (
        <section className="ui-card-shell p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-wider text-sky-400">
                {t('attendancePage.schedulePlanning.eyebrow')}
              </p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">
                {t('attendancePage.schedulePlanning.title')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('attendancePage.schedulePlanning.description')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/schedule"
                className="ui-btn-secondary border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
              >
                {t('attendancePage.schedulePlanning.currentMonth')}
              </Link>
              <Link
                href="/schedule?month=next"
                className="ui-btn-secondary border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
              >
                {t('attendancePage.schedulePlanning.upcomingMonth')}
              </Link>
            </div>
          </div>
        </section>
      )}

      {(isLeader || isEmployee) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="ui-card-shell p-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--primary))]">
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
                {isAdmin && (
                  <>
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
                  </>
                )}
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
            <p className="text-[11px] font-mono uppercase tracking-wider text-[hsl(var(--primary))]">
              {t('attendancePage.prediction.eyebrow')}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">
              {t('attendancePage.prediction.title')}
            </h2>
            {isLeader && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link href="/schedule" className="ui-card-muted p-3 transition-colors hover:border-[hsl(var(--primary)/0.3)] hover:bg-[hsl(var(--primary)/0.05)]">
                  <p className="text-[11px] uppercase tracking-wide text-[hsl(var(--primary))]">
                    {t('attendancePage.header.label')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{t('attendancePage.schedulePlanning.currentMonthTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('attendancePage.schedulePlanning.currentMonthDesc')}
                  </p>
                </Link>
                <Link href="/schedule?month=next" className="ui-card-muted p-3 transition-colors hover:border-sky-400/30 hover:bg-sky-500/5">
                  <p className="text-[11px] uppercase tracking-wide text-sky-300">{t('attendancePage.schedulePlanning.upcomingMonthEyebrow')}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{t('attendancePage.schedulePlanning.nextMonthTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('attendancePage.schedulePlanning.nextMonthDesc')}
                  </p>
                </Link>
              </div>
            )}
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
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <section className="ui-card-shell p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{t('attendancePage.interactive.drilldownHeading')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('attendancePage.interactive.drilldownShowing')
                    .replace('{{count}}', String(drilldownRows.length))
                    .replace('{{total}}', String(toSafeNumber(interactiveReport?.drilldown?.total || drilldownRows.length)))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {drilldownState.status ? <span className="ui-card-muted px-2 py-1">{t('attendancePage.interactive.drilldownStatus').replace('{{value}}', drilldownState.status)}</span> : null}
                {drilldownState.group ? <span className="ui-card-muted px-2 py-1">{t('attendancePage.interactive.drilldownGroup').replace('{{value}}', drilldownState.group)}</span> : null}
              </div>
            </div>
            {drilldownRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('attendancePage.interactive.drilldownEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-foreground">
                  <thead>
                    <tr className="ui-table-head text-left">
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colDate')}</th>
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colEmployee')}</th>
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colGroup')}</th>
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colStatus')}</th>
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colSchedule')}</th>
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colActual')}</th>
                      <th className="table-head-cell whitespace-nowrap px-4 py-3">{t('attendancePage.interactive.colScans')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {drilldownRows.map((row, index) => (
                      <tr key={`${row.employee}-${row.date}-${index}`} className="ui-table-row">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{String(row.date || '-')}</td>
                        <td className="px-4 py-3 text-xs text-foreground">{String(row.employee || '-')}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{String(row.group || '-')}</td>
                        <td className="px-4 py-3 text-xs text-foreground">{String(row.status || '-')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{String(row.schedule || '-')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{String(row.actual || '-')}</td>
                        <td className="px-4 py-3 font-mono text-xs text-foreground">{toSafeNumber(row.scans)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <InlineStatusPanel
            message={loadError}
            variant="error"
            actionLabel={t('attendancePage.errors.retry')}
            onAction={load}
          />
          <div className="ui-table-shell">
            <AttendanceTable
              loading={loading}
              rows={pagedSummaryRows}
              holidayMap={holidayMap}
              onEdit={canEditNotes ? setEditing : null}
              showReviewDetails={isAdmin}
            />
            {renderPager(summaryPage, setSummaryPage, summaryMeta)}
          </div>
        </div>
      )}

      {activeTab === 'quick_summaries' && (
        <div className="ui-card-shell p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {t('attendancePage.tabs.quick_summaries')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('attendancePage.quickSummaries.description')}
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{quickSummaryRangeLabel}</span>
          </div>
          <QuickSummariesTable
            loading={quickSummariesLoading}
            error={quickSummariesError}
            employees={quickSummaryEmployees}
            dates={quickSummaryDates}
            rowMap={quickSummaryRowMap}
            holidayMap={holidayMap}
            onRetry={loadQuickSummaries}
          />
        </div>
      )}

      {editing && canEditNotes && (
        <NoteModal row={editing} onClose={() => setEditing(null)} onSave={saveNote} />
      )}
    </div>
  );
}
