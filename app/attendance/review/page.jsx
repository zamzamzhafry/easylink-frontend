'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, EyeOff, Filter, RefreshCcw, ShieldCheck, UserRoundSearch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppLocale } from '@/components/app-shell';
import {
  TableEmptyRow,
  TableHeadRow,
  TableLoadingRow,
  TableShell,
} from '@/components/ui/table-shell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';
import { endOfRange, isoDate, startOfRange } from '@/lib/attendance-helpers';
import { getUIText } from '@/lib/localization/ui-texts';
import { requestJson } from '@/lib/request-json';
import useAuthSession from '@/hooks/use-auth-session';

function getHeaders(t) {
  return [
    { key: 'date', label: t('attendanceReviewPage.table.date') },
    { key: 'name', label: t('attendanceReviewPage.table.employee') },
    { key: 'group', label: t('attendanceReviewPage.table.group') },
    { key: 'shift', label: t('attendanceReviewPage.table.shift') },
    { key: 'times', label: t('attendanceReviewPage.table.times') },
    { key: 'status', label: t('attendanceReviewPage.table.compareResult') },
    { key: 'meta', label: t('attendanceReviewPage.table.punchMeta') },
    { key: 'actions', label: '' },
  ];
}

const STATUS_BADGE = {
  normal: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  terlambat: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  pulang_awal: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  double_punch: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  tidak_hadir: 'border-border bg-muted text-muted-foreground',
};

function getVerifyMap(t) {
  return {
    1: t('attendanceReviewPage.verifyMode.fingerprint'),
    20: t('attendanceReviewPage.verifyMode.faceRecognition'),
    30: t('attendanceReviewPage.verifyMode.veinScan'),
    2: t('attendanceReviewPage.verifyMode.card'),
    4: t('attendanceReviewPage.verifyMode.face'),
    15: t('attendanceReviewPage.verifyMode.palm'),
  };
}
function getIoMap(t) {
  return {
    0: t('attendanceReviewPage.ioMode.checkIn'),
    1: t('attendanceReviewPage.ioMode.checkOut'),
    2: t('attendanceReviewPage.ioMode.breakOut'),
    3: t('attendanceReviewPage.ioMode.breakIn'),
  };
}
function getTaxonomyOptions(t) {
  return [
    { value: 'late', label: t('attendanceReviewPage.taxonomy.late') },
    { value: 'acceptable', label: t('attendanceReviewPage.taxonomy.acceptable') },
    { value: 'invalid', label: t('attendanceReviewPage.taxonomy.invalid') },
  ];
}
const DEFAULT_MUTATION = { status: 'acceptable', reason: '', note: '' };
const QUICK_PRESET = [
  { key: 'today', labelPath: 'attendanceReviewPage.filters.quickPreset.today' },
  { key: 'week', labelPath: 'attendanceReviewPage.filters.quickPreset.thisWeek' },
  { key: 'month', labelPath: 'attendanceReviewPage.filters.quickPreset.thisMonth' },
  { key: 'last_month', labelPath: 'attendanceReviewPage.filters.quickPreset.lastMonth' },
];
const ANOMALY_FILTER_DEFAULT = {
  late: true,
  earlyLeave: true,
  absent: true,
  anomaly: true,
};

const FOCUS_REFRESH_THROTTLE_MS = 15_000;

function resolvePresetRange(rangeKey) {
  return {
    from: startOfRange(rangeKey),
    to: endOfRange(rangeKey),
  };
}

function capabilityEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function canReviewPunch(row, punch, isAdmin) {
  if (isAdmin) return true;
  const capabilityCandidates = [
    punch?.can_review,
    punch?.canReview,
    row?.can_review,
    row?.canReview,
  ];
  const hasCapabilitySignal = capabilityCandidates.some((value) => value != null);
  if (hasCapabilitySignal) {
    return capabilityCandidates.some(capabilityEnabled);
  }
  return false;
}

function getStatusLabel(t, value) {
  switch (value) {
    case 'double_punch':
      return t('attendanceReviewPage.status.doublePunch');
    case 'normal':
      return t('attendanceReviewPage.status.normal');
    case 'terlambat':
      return t('attendanceReviewPage.status.late');
    case 'pulang_awal':
      return t('attendanceReviewPage.status.earlyLeave');
    case 'tidak_hadir':
      return t('attendanceReviewPage.status.absent');
    default:
      return String(value || 'normal').replaceAll('_', ' ');
  }
}

export default function AttendanceReviewPage() {
  const { warning, success } = useToast();
  const router = useRouter();
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const HEADERS = useMemo(() => getHeaders(t), [t]);
  const VERIFY_MAP = useMemo(() => getVerifyMap(t), [t]);
  const IO_MAP = useMemo(() => getIoMap(t), [t]);
  const TAXONOMY_OPTIONS = useMemo(() => getTaxonomyOptions(t), [t]);
  const { user: currentUser, loading: authLoading } = useAuthSession();
  const warningRef = useRef(warning);
  const lastRefreshAtRef = useRef(0);
  const [groups, setGroups] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [expanded, setExpanded] = useState('');
  const [from, setFrom] = useState(startOfRange('week'));
  const [to, setTo] = useState(isoDate());
  const [groupId, setGroupId] = useState('');
  const [pinFilter, setPinFilter] = useState('');
  const [anomalyFilters, setAnomalyFilters] = useState(ANOMALY_FILTER_DEFAULT);
  const [hasHiddenTable, setHasHiddenTable] = useState(false);
  const [mutationDrafts, setMutationDrafts] = useState({});

  const isAdmin = Boolean(currentUser?.is_admin);

  useEffect(() => {
    warningRef.current = warning;
  }, [warning]);

  useEffect(() => {
    if (authLoading) return;
    if (currentUser && !currentUser.is_admin) {
      router.replace('/attendance');
    }
  }, [authLoading, currentUser, router]);

  const loadGroups = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await requestJson('/api/groups');
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    }
  }, [isAdmin]);

  const debounceRef = useRef(null);
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
      warningRef.current(error.message || 'Failed to load attendance review.', 'Review fetch failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, groupId, pinFilter]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadRows();
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [loadRows]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      lastRefreshAtRef.current = now;
      void loadRows();
    };

    const refreshOnVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < FOCUS_REFRESH_THROTTLE_MS) return;
      lastRefreshAtRef.current = now;
      void loadRows();
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
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

  const activeQuickPreset = useMemo(() => {
    const found = QUICK_PRESET.find((preset) => {
      const range = resolvePresetRange(preset.key);
      return from === range.from && to === range.to;
    });
    return found?.key || '';
  }, [from, to]);

  const filteredRows = useMemo(() => {
    const source = Array.isArray(rows) ? rows : [];
    return source.filter((row) => {
      const status = String(row?.computed_status || '').toLowerCase();
      if (status === 'terlambat') return anomalyFilters.late;
      if (status === 'pulang_awal') return anomalyFilters.earlyLeave;
      if (status === 'tidak_hadir') return anomalyFilters.absent;
      if (status === 'anomaly' || status === 'anomali' || status === 'double_punch') {
        return anomalyFilters.anomaly;
      }
      return true;
    });
  }, [rows, anomalyFilters]);

  const [selectedProfile, setSelectedProfile] = useState('');

  const updateMutationDraft = useCallback((draftKey, patch) => {
    setMutationDrafts((prev) => ({
      ...prev,
      [draftKey]: {
        status: prev[draftKey]?.status || DEFAULT_MUTATION.status,
        reason: prev[draftKey]?.reason || '',
        note: prev[draftKey]?.note || '',
        ...patch,
      },
    }));
  }, []);

  const submitMutation = async (row, punch, action) => {
    if (!canReviewPunch(row, punch, isAdmin)) return;
    if ((action === 'hide' || action === 'unhide') && !hasHiddenTable) return;
    const key = `${row.pin}-${punch.scan_at}-${punch.sn}-${punch.iomode}-${punch.workcode}`;
    const draft = mutationDrafts[key] || DEFAULT_MUTATION;
    const status = String(draft.status || DEFAULT_MUTATION.status)
      .trim()
      .toLowerCase();
    const reason = String(draft.reason || '').trim();
    const note = String(draft.note || '').trim();

    if (action === 'tag' && !TAXONOMY_OPTIONS.some((option) => option.value === status)) {
      warning('Select a valid taxonomy status before tagging.', 'Invalid status');
      return;
    }

    setSavingKey(`${action}:${key}`);
    try {
      await requestJson('/api/attendance/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          pin: row.pin,
          scan_at: punch.scan_at,
          sn: punch.sn,
          iomode: punch.iomode,
          workcode: punch.workcode,
          status,
          reason:
            reason || (action === 'hide' || action === 'unhide' ? 'admin normalization' : null),
          note: note || null,
        }),
      });
      const successMessage =
        action === 'tag'
          ? `Tag updated: ${status}.`
          : action === 'unhide'
            ? 'Punch restored.'
            : 'Punch hidden from comparison.';
      success(successMessage, 'Review updated');
      await loadRows();
    } catch (error) {
      warning(error.message || 'Failed to mutate review punch.', 'Action failed');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{t('attendanceReviewPage.header.title')}</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('attendanceReviewPage.header.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/attendance"
            className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            {t('attendanceReviewPage.nav.backToAttendance')}
          </Link>
          <Link
            href="/schedule"
            className="rounded-lg border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] px-3 py-2 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)]"
          >
            {t('attendanceReviewPage.nav.openSchedule')}
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="col-span-full flex flex-wrap items-center gap-2">
            {QUICK_PRESET.map((preset) => {
              const isActive = activeQuickPreset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    const nextRange = resolvePresetRange(preset.key);
                    setFrom(nextRange.from);
                    setTo(nextRange.to);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    isActive
                      ? 'border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))]'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  {t(preset.labelPath)}
                </button>
              );
            })}
          </div>

          <label className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('attendanceReviewPage.filters.from')}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-2 py-2 text-xs text-[hsl(var(--foreground))]"
            />
          </label>
          <label className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('attendanceReviewPage.filters.to')}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-2 py-2 text-xs text-[hsl(var(--foreground))]"
            />
          </label>
          <label className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('attendanceReviewPage.filters.group')}
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-2 py-2 text-xs text-[hsl(var(--foreground))]"
            >
              <option value="">{t('attendanceReviewPage.filters.allGroups')}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.nama_group}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[hsl(var(--muted-foreground))]">
            {t('attendanceReviewPage.filters.pin')}
            <input
              value={pinFilter}
              onChange={(e) => setPinFilter(e.target.value)}
              placeholder={t('attendanceReviewPage.filters.pinPlaceholder')}
              className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-2 py-2 text-xs text-[hsl(var(--foreground))]"
            />
          </label>

          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              tone="neutral"
              size="sm"
              onClick={() => {
                lastRefreshAtRef.current = Date.now();
                void loadRows();
              }}
              disabled={loading}
            >
              <RefreshCcw className="h-3.5 w-3.5" /> {t('attendanceReviewPage.actions.refresh')}
            </Button>
            <Button
              variant="soft"
              tone="primary"
              size="sm"
              onClick={() => {
                lastRefreshAtRef.current = Date.now();
                void loadRows();
              }}
            >
              <Filter className="h-3.5 w-3.5" /> {t('attendanceReviewPage.filters.apply')}
            </Button>
          </div>

          <div className="col-span-full flex flex-wrap items-center gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">{t('attendanceReviewPage.filters.anomalyType')}</div>
            <label className="inline-flex items-center gap-2 text-xs text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={anomalyFilters.late}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({ ...prev, late: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--primary))]"
              />
              {t('attendanceReviewPage.filters.anomalyOptions.late')}
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={anomalyFilters.earlyLeave}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({ ...prev, earlyLeave: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--primary))]"
              />
              {t('attendanceReviewPage.filters.anomalyOptions.earlyLeave')}
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={anomalyFilters.absent}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({ ...prev, absent: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--primary))]"
              />
              {t('attendanceReviewPage.filters.anomalyOptions.absent')}
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={anomalyFilters.anomaly}
                onChange={(e) =>
                  setAnomalyFilters((prev) => ({ ...prev, anomaly: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-[hsl(var(--border))] bg-[hsl(var(--input))] text-[hsl(var(--primary))]"
              />
              {t('attendanceReviewPage.filters.anomalyOptions.anomaly')}
            </label>
          </div>

          {isAdmin && (
            <label className="text-xs text-[hsl(var(--muted-foreground))]">
              {t('attendanceReviewPage.adminProfile.label')}
              <div className="mt-1 flex gap-2">
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-2 py-2 text-xs text-[hsl(var(--foreground))]"
                >
                  <option value="">{t('attendanceReviewPage.adminProfile.selectPlaceholder')}</option>
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
                      : 'pointer-events-none border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  <UserRoundSearch className="h-3.5 w-3.5" /> {t('attendanceReviewPage.adminProfile.open')}
                </Link>
              </div>
            </label>
          )}
        </div>
      </div>

      {!hasHiddenTable && isAdmin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {t('attendanceReviewPage.warnings.hiddenTableMigrationPrefix')}{' '}
          <code className="font-mono">migration_scanlog_hidden.sql</code>
          {t('attendanceReviewPage.warnings.hiddenTableMigrationSuffix')}
        </div>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <TableHeadRow headers={HEADERS} />
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {loading ? (
              <TableLoadingRow colSpan={8} label={t('attendanceReviewPage.table.loading')} />
            ) : filteredRows.length === 0 ? (
              <TableEmptyRow colSpan={8} label={t('attendanceReviewPage.table.empty')} />
            ) : (
              filteredRows.map((row, idx) => {
                const key = `${row.pin}-${row.scan_date}`;
                const open = expanded === key;
                const statusCls = STATUS_BADGE[row.computed_status] || STATUS_BADGE.normal;
                return (
                  <Fragment key={`${key}-${idx}`}>
                    <tr className="data-row">
                      <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                        {String(row.scan_date).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                        {row.karyawan_id ? (
                          <Link
                            href={`/employees/${row.karyawan_id}`}
                            className="block max-w-[200px] truncate hover:text-[hsl(var(--primary))]"
                            title={row.nama}
                          >
                            {row.nama}
                          </Link>
                        ) : (
                          <span className="block max-w-[200px] truncate" title={row.nama}>
                            {row.nama}
                          </span>
                        )}
                        <div className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">PIN {row.pin}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{row.nama_group || '-'}</td>
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
                          <span className="text-[hsl(var(--muted-foreground))]">-</span>
                        )}
                        {(row.jam_masuk || row.jam_keluar) && (
                          <div className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                            {(row.jam_masuk || '--:--:--').slice(0, 5)} -{' '}
                            {(row.jam_keluar || '--:--:--').slice(0, 5)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.visible_times.length === 0 ? (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">{t('attendanceReviewPage.table.noVisiblePunches')}</span>
                        ) : (
                          <div className="space-y-0.5 font-mono text-xs text-[hsl(var(--primary))]">
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
                          {getStatusLabel(t, row.computed_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                        <div>{t('attendanceReviewPage.table.total')}: {row.scan_count}</div>
                        <div>{t('attendanceReviewPage.table.hidden')}: {row.hidden_count}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          tone="neutral"
                          size="sm"
                          onClick={() => setExpanded(open ? '' : key)}
                        >
                          {open ? t('attendanceReviewPage.table.hideDetail') : t('attendanceReviewPage.table.reviewPunches')}
                        </Button>
                      </td>
                    </tr>

                    {open && (
                      <tr key={`${key}-detail`}>
                        <td colSpan={8} className="bg-[hsl(var(--card))] px-4 py-3">
                          <div className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">
                            {t('attendanceReviewPage.punchDetail.timelineHint')}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--muted-foreground))]">
                                  <th className="px-2 py-1.5">{t('attendanceReviewPage.punchDetail.time')}</th>
                                  <th className="px-2 py-1.5">{t('attendanceReviewPage.punchDetail.verify')}</th>
                                  <th className="px-2 py-1.5">{t('attendanceReviewPage.punchDetail.io')}</th>
                                  <th className="px-2 py-1.5">{t('attendanceReviewPage.punchDetail.sn')}</th>
                                  <th className="px-2 py-1.5">{t('attendanceReviewPage.punchDetail.workcode')}</th>
                                  <th className="px-2 py-1.5">{t('attendanceReviewPage.punchDetail.state')}</th>
                                  <th className="px-2 py-1.5 text-right">{t('attendanceReviewPage.punchDetail.action')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[hsl(var(--border))]">
                                {row.punches.map((punch) => {
                                  const actionKey = `${row.pin}-${punch.scan_at}-${punch.sn}-${punch.iomode}-${punch.workcode}`;
                                  const canReview = canReviewPunch(row, punch, isAdmin);
                                  const busy =
                                    savingKey === `hide:${actionKey}` ||
                                    savingKey === `unhide:${actionKey}` ||
                                    savingKey === `tag:${actionKey}`;
                                  const draft = mutationDrafts[actionKey] || DEFAULT_MUTATION;
                                  return (
                                    <tr key={actionKey}>
                                      <td className="px-2 py-1.5 font-mono text-[hsl(var(--primary))]">
                                        {punch.scan_time}
                                      </td>
                                      <td className="px-2 py-1.5 text-[hsl(var(--foreground))]">
                                        {VERIFY_MAP[punch.verifymode] || `${t('attendanceReviewPage.verifyMode.fallback')} ${punch.verifymode}`}
                                      </td>
                                      <td className="px-2 py-1.5 text-[hsl(var(--muted-foreground))]">
                                        {IO_MAP[punch.iomode] || `${t('attendanceReviewPage.ioMode.fallback')} ${punch.iomode}`}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-[hsl(var(--muted-foreground))]">
                                        {punch.sn || '-'}
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-[hsl(var(--muted-foreground))]">
                                        {punch.workcode}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {punch.is_hidden ? (
                                          <span className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
                                            {t('attendanceReviewPage.punchDetail.hidden')}
                                          </span>
                                        ) : (
                                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                            {t('attendanceReviewPage.punchDetail.visible')}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 text-right">
                                        {canReview ? (
                                          <div className="inline-flex flex-col items-end gap-1">
                                            <select
                                              value={draft.status}
                                              onChange={(e) =>
                                                updateMutationDraft(actionKey, {
                                                  status: e.target.value,
                                                })
                                              }
                                              className="w-24 rounded border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-1.5 py-1 text-[11px] text-[hsl(var(--foreground))]"
                                            >
                                              {TAXONOMY_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                            <input
                                              value={draft.reason}
                                              onChange={(e) =>
                                                updateMutationDraft(actionKey, {
                                                  reason: e.target.value,
                                                })
                                              }
                                              placeholder={t('attendanceReviewPage.punchDetail.reasonPlaceholder')}
                                              className="w-36 rounded border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-1.5 py-1 text-[11px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                                            />
                                            <input
                                              value={draft.note}
                                              onChange={(e) =>
                                                updateMutationDraft(actionKey, {
                                                  note: e.target.value,
                                                })
                                              }
                                              placeholder={t('attendanceReviewPage.punchDetail.notePlaceholder')}
                                              className="w-36 rounded border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-1.5 py-1 text-[11px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                                            />
                                            <div className="inline-flex items-center gap-1">
                                              <Button
                                                variant="soft"
                                                tone="primary"
                                                size="sm"
                                                disabled={busy}
                                                onClick={() => submitMutation(row, punch, 'tag')}
                                              >
                                                {t('attendanceReviewPage.punchDetail.tag')}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                tone="neutral"
                                                size="sm"
                                                disabled={busy || !hasHiddenTable}
                                                onClick={() =>
                                                  submitMutation(
                                                    row,
                                                    punch,
                                                    punch.is_hidden ? 'unhide' : 'hide'
                                                  )
                                                }
                                              >
                                                <EyeOff className="h-3 w-3" />{' '}
                                                {punch.is_hidden ? t('attendanceReviewPage.punchDetail.unhide') : t('attendanceReviewPage.punchDetail.hide')}
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                                            <ShieldCheck className="h-3 w-3" /> {t('attendanceReviewPage.punchDetail.adminOnly')}
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
