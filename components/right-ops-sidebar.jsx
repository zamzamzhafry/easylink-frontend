'use client';

import Link from 'next/link';
import { Bell, ChevronLeft, ChevronRight, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';
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

function QueueList({ rows, emptyLabel = 'No jobs', showMoreLabel = 'Show more' }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const [visibleCount, setVisibleCount] = useState(6);
  const visibleRows = safeRows.slice(0, visibleCount);
  const hasMore = safeRows.length > visibleRows.length;

  if (safeRows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
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
      {hasMore ? (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + 6)}
          className="ui-btn-secondary min-h-0 w-full px-2 py-1 text-[11px]"
        >
          {showMoreLabel}
        </button>
      ) : null}
    </div>
  );
}

function LazyAccordionSection({ id, title, summary, open, onToggle, children }) {
  return (
    <section className="ui-card-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <div className="flex items-center gap-2">
          {summary ? <p className="text-[10px] text-muted-foreground">{summary}</p> : null}
          <button
            type="button"
            onClick={onToggle}
            className="ui-btn-secondary min-h-0 px-2 py-1 text-[10px]"
            aria-expanded={open}
            aria-controls={id}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {open ? (
        <div id={id} className="mt-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function RightOpsSidebar({ currentUser, collapsed = false, onToggle }) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = (path) => getUIText(path, resolvedLocale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanlogQueue, setScanlogQueue] = useState({ concurrency: 1, active: 0, pending: 0 });
  const [machineQueue, setMachineQueue] = useState({ concurrency: 1, active: 0, pending: 0 });
  const [migrationFlags, setMigrationFlags] = useState(null);
  const [scanlogRows, setScanlogRows] = useState([]);
  const [machineRows, setMachineRows] = useState([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [expandedSections, setExpandedSections] = useState({
    scanlog: false,
    migration: false,
    machine: false,
    preview: false,
  });

  const isAdmin = Boolean(currentUser?.is_admin);
  const needsScanlogDetails =
    !collapsed && (expandedSections.scanlog || expandedSections.migration);
  const needsMachineDetails = !collapsed && expandedSections.machine;

  const refreshData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const today = todayIso();
      const requests = [requestJson(`/api/attendance/review?from=${today}&to=${today}`)];
      const reviewIndex = 0;
      const scanlogIndex = needsScanlogDetails
        ? requests.push(requestJson('/api/scanlog/sync?limit=6')) - 1
        : -1;
      const machineIndex = needsMachineDetails
        ? requests.push(requestJson('/api/machine?limit=6')) - 1
        : -1;
      const responses = await Promise.all(requests);
      const reviewData = responses[reviewIndex];
      const scanlogData = scanlogIndex >= 0 ? responses[scanlogIndex] : null;
      const machineData = machineIndex >= 0 ? responses[machineIndex] : null;

      const reviewRows = Array.isArray(reviewData?.rows) ? reviewData.rows : [];
      const pendingReviews = reviewRows.filter(
        (row) => String(row?.computed_status || 'normal').toLowerCase() !== 'normal'
      ).length;

      if (scanlogData) {
        setScanlogQueue(scanlogData?.queue || { concurrency: 1, active: 0, pending: 0 });
        setMigrationFlags(scanlogData?.migration || null);
        setScanlogRows(Array.isArray(scanlogData?.rows) ? scanlogData.rows : []);
      } else {
        setScanlogRows([]);
      }

      if (machineData) {
        setMachineQueue(machineData?.queue || { concurrency: 1, active: 0, pending: 0 });
        setMachineRows(Array.isArray(machineData?.rows) ? machineData.rows : []);
      } else {
        setMachineRows([]);
      }

      setPendingReviewCount(pendingReviews);
      setError('');
    } catch (fetchError) {
      setError(
        fetchError?.message || getUIText('rightOpsSidebar.errors.fetchFailed', resolvedLocale)
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, needsMachineDetails, needsScanlogDetails, resolvedLocale]);

  const toggleSection = useCallback((key) => {
    setExpandedSections((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

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
    <aside
      className={cn(
        'app-right-sidebar fixed inset-y-0 right-0 z-30 hidden flex-col border-l border-border bg-card/95 backdrop-blur transition-all duration-300 xl:flex',
        collapsed ? 'w-16 p-2' : 'w-80 p-4'
      )}
      aria-label="Admin operations sidebar"
    >
      <div
        className={cn(
          'mb-4 flex items-center gap-2 border-b border-border pb-3',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        <div className={cn('min-w-0', collapsed && 'sr-only')}>
          <p className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            <ShieldCheck className="h-4 w-4 text-teal-400" /> {t('rightOpsSidebar.title')}
          </p>
          <p className="text-[11px] text-muted-foreground">{t('rightOpsSidebar.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshData()}
            className="ui-btn-secondary min-h-0 p-2"
            aria-label="Refresh right sidebar"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => onToggle?.()}
            className="ui-btn-secondary min-h-0 p-2"
            aria-label={collapsed ? 'Expand right sidebar' : 'Collapse right sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Link
        href="/attendance/review"
        className={cn(
          'mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-100 transition-colors hover:bg-amber-500/15',
          collapsed ? 'p-2' : 'p-3'
        )}
        aria-label={getUIText('rightOpsSidebar.reviewAria', resolvedLocale).replace(
          '{{pending}}',
          String(pendingReviewCount)
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2',
            collapsed ? 'justify-center' : 'justify-between'
          )}
        >
          <div className="flex items-center gap-2">
            <Bell className={cn('h-4 w-4', pendingReviewCount > 0 && 'bell-ring-subtle')} />
            {!collapsed ? (
              <p className="text-xs font-semibold">{t('rightOpsSidebar.reviewTitle')}</p>
            ) : null}
          </div>
          <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] font-semibold">
            {pendingReviewCount}
          </span>
        </div>
        {!collapsed ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-200/90">
            <Clock3 className="h-3 w-3" />
            {t('rightOpsSidebar.reviewHint')}
          </p>
        ) : null}
      </Link>

      {error && (
        <div
          className={cn(
            'mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200',
            collapsed && 'px-2 py-1 text-[10px]'
          )}
        >
          {collapsed ? '!' : error}
        </div>
      )}

      {!collapsed ? (
        <div className="space-y-4 overflow-y-auto pb-4">
          <LazyAccordionSection
            id="scanlog-queue-panel"
            title={t('rightOpsSidebar.sections.scanlog')}
            summary={getUIText('rightOpsSidebar.queueSummary', resolvedLocale)
              .replace('{{active}}', String(scanlogQueue.active))
              .replace('{{concurrency}}', String(scanlogQueue.concurrency))
              .replace('{{pending}}', String(scanlogQueue.pending))}
            open={expandedSections.scanlog}
            onToggle={() => toggleSection('scanlog')}
          >
            <QueueList
              rows={scanlogRows}
              emptyLabel={t('rightOpsSidebar.empty.scanlog')}
              showMoreLabel={t('rightOpsSidebar.actions.showMore')}
            />
          </LazyAccordionSection>

          <LazyAccordionSection
            id="migration-gates-panel"
            title={t('rightOpsSidebar.sections.migration')}
            summary={
              migrationFlags?.compatibilityFirst?.runtimeDefaulted
                ? t('rightOpsSidebar.migration.compatibilityFirst')
                : t('rightOpsSidebar.migration.flagOverride')
            }
            open={expandedSections.migration}
            onToggle={() => toggleSection('migration')}
          >
            <div className="grid grid-cols-1 gap-2 text-[11px] text-muted-foreground">
              <div className="rounded-lg border border-border bg-background/60 px-2 py-1">
                {t('rightOpsSidebar.migration.policy')}:{' '}
                {migrationFlags?.flags?.policySource?.mode || 'legacy'}
              </div>
              <div className="rounded-lg border border-border bg-background/60 px-2 py-1">
                {t('rightOpsSidebar.migration.dataSource')}:{' '}
                {migrationFlags?.flags?.dataSourceCutover?.mode || 'legacy_only'}
              </div>
              <div className="rounded-lg border border-border bg-background/60 px-2 py-1">
                {t('rightOpsSidebar.migration.machineParity')}:{' '}
                {migrationFlags?.flags?.machineParityExposure?.mode || 'off'}
              </div>
              <div className="rounded-lg border border-border bg-background/60 px-2 py-1">
                {t('rightOpsSidebar.migration.reporting')}:{' '}
                {migrationFlags?.flags?.reportingInteraction?.mode || 'legacy'}
              </div>
            </div>
          </LazyAccordionSection>

          <LazyAccordionSection
            id="machine-queue-panel"
            title={t('rightOpsSidebar.sections.machine')}
            summary={getUIText('rightOpsSidebar.queueSummary', resolvedLocale)
              .replace('{{active}}', String(machineQueue.active))
              .replace('{{concurrency}}', String(machineQueue.concurrency))
              .replace('{{pending}}', String(machineQueue.pending))}
            open={expandedSections.machine}
            onToggle={() => toggleSection('machine')}
          >
            <QueueList
              rows={machineRows}
              emptyLabel={t('rightOpsSidebar.empty.machine')}
              showMoreLabel={t('rightOpsSidebar.actions.showMore')}
            />
          </LazyAccordionSection>

          <LazyAccordionSection
            id="admin-preview-panel"
            title={t('rightOpsSidebar.sections.preview')}
            open={expandedSections.preview}
            onToggle={() => toggleSection('preview')}
          >
            <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-background p-2 text-[11px] text-foreground">
              {JSON.stringify(debugPreview, null, 2)}
            </pre>
          </LazyAccordionSection>
        </div>
      ) : null}
    </aside>
  );
}
