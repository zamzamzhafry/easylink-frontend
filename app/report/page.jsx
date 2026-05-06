'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, PieChart, RefreshCcw } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import { useToast } from '@/components/ui/toast-provider';
import { getUIText } from '@/lib/localization/ui-texts';
import { endOfRange, isoDate, PRESET_RANGE, startOfRange } from '@/lib/attendance-helpers';

const PIE_COLORS = {
  on_time: '#10b981',
  late: '#f59e0b',
  early_leave: '#fb7185',
  anomaly: '#a78bfa',
};



function parseJsonSafely(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatText(template, replacements = {}) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : match
  );
}

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKey(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, '_');
}

function colorForSeries(item, index) {
  const key = normalizeKey(item?.key || item?.name || '');
  if (PIE_COLORS[key]) return PIE_COLORS[key];
  const palette = ['#22d3ee', '#f97316', '#84cc16', '#e879f9', '#38bdf8'];
  return palette[index % palette.length];
}

function buildPieSeries(series = []) {
  if (!Array.isArray(series)) return [];
  return series.map((item, index) => ({
    key: String(item?.key || item?.name || `series-${index}`),
    name: String(item?.name || item?.key || `Series ${index + 1}`),
    value: toNumber(item?.value),
    color: colorForSeries(item, index),
  }));
}

function buildBarSeries(barPayload) {
  const categories = Array.isArray(barPayload?.categories) ? barPayload.categories : [];
  const series = Array.isArray(barPayload?.series) ? barPayload.series : [];

  return {
    categories: categories.map((value) => String(value || 'Unknown')),
    series: series.map((item, index) => ({
      name: String(item?.name || `Series ${index + 1}`),
      values: Array.isArray(item?.data) ? item.data.map((point) => toNumber(point)) : [],
      color: colorForSeries(item, index),
    })),
  };
}

export default function ReportPage() {
  const { warning } = useToast();
  const localeContext = useAppLocale();
  const resolvedLocale = localeContext?.locale === 'id' ? 'id' : 'en';
  const [filters, setFilters] = useState({
    from: startOfRange('week'),
    to: isoDate(),
    group_id: '',
    employee_id: '',
  });
  const [report, setReport] = useState({
    filters: null,
    series: { pie: [], bar: { categories: [], series: [] } },
    drilldown: { rows: [], limit: 0, page: 1, total: 0, totalPages: 0, truncated: false },
    metadata: { totalRecords: 0, drilldownTotal: 0 },
    availableGroups: [],
    availableEmployees: [],
  });
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [drilldownState, setDrilldownState] = useState({
    status: null,
    group: null,
    page: 1,
    limit: 10,
  });
  const [config, setConfig] = useState(null);

  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);

  const drillRows = useMemo(
    () => (Array.isArray(report?.drilldown?.rows) ? report.drilldown.rows : []),
    [report]
  );

  const groupOptions = useMemo(
    () => (Array.isArray(report?.availableGroups) ? report.availableGroups : []),
    [report]
  );

  const employeeOptions = useMemo(() => {
    return Array.isArray(report?.availableEmployees) ? report.availableEmployees : [];
  }, [report]);

  const loadReport = useCallback(async () => {
    const localizedRequestFailed = getUIText('reportPage.errors.requestFailed', resolvedLocale);
    const localizedFetchFailed = getUIText('reportPage.errors.fetchFailed', resolvedLocale);

    setLoading(true);
    setApiError(null);
    try {
      const query = new URLSearchParams({ 
        from: filters.from, 
        to: filters.to,
        page: drilldownState.page,
        limit: drilldownState.limit
      });
      if (filters.group_id) query.set('group_id', filters.group_id);
      if (filters.employee_id) query.set('employee_id', filters.employee_id);
      if (drilldownState.status) query.set('drilldown_status', drilldownState.status);
      if (drilldownState.group) query.set('drilldown_group', drilldownState.group);

      const [response, configResponse] = await Promise.all([
        fetch(`/api/report?${query.toString()}`),
        fetch('/api/config')
      ]);

      const text = await response.text();
      const payload = parseJsonSafely(text);

      const configText = await configResponse.text();
      const configPayload = parseJsonSafely(configText);

      if (configPayload?.ok) {
        setConfig(configPayload.config);
      }

      if (!response.ok) {
        const message =
          payload?.error ||
          payload?.message ||
          `${localizedRequestFailed} (status ${response.status})`;
        if (response.status === 403) {
          setApiError({ type: 'forbidden', message });
          setReport({
            filters: null,
            series: { pie: [], bar: { categories: [], series: [] } },
            drilldown: { rows: [], limit: 0, total: 0, truncated: false },
            metadata: { totalRecords: 0 },
            availableGroups: [],
            availableEmployees: [],
          });
          return;
        }
        throw new Error(message);
      }

      if (payload && typeof payload === 'object' && payload.ok === false) {
        throw new Error(payload.error || localizedRequestFailed);
      }

      setReport({
        filters: payload?.filters || null,
        series: {
          pie: Array.isArray(payload?.series?.pie) ? payload.series.pie : [],
          bar: payload?.series?.bar || { categories: [], series: [] },
        },
        drilldown: {
          rows: Array.isArray(payload?.drilldown?.rows) ? payload.drilldown.rows : [],
          limit: toNumber(payload?.drilldown?.limit),
          page: toNumber(payload?.drilldown?.page),
          total: toNumber(payload?.drilldown?.total),
          totalPages: toNumber(payload?.drilldown?.totalPages),
          truncated: Boolean(payload?.drilldown?.truncated),
        },
        metadata: payload?.metadata || { totalRecords: 0, drilldownTotal: 0 },
        availableGroups: Array.isArray(payload?.availableGroups) ? payload.availableGroups : [],
        availableEmployees: Array.isArray(payload?.availableEmployees) ? payload.availableEmployees : [],
      });
    } catch (error) {
      const message = error?.message || localizedFetchFailed;
      setApiError({ type: 'error', message });
      warning(message, localizedRequestFailed);
    } finally {
      setLoading(false);
    }
  }, [filters.employee_id, filters.from, filters.group_id, filters.to, resolvedLocale, warning, drilldownState.status, drilldownState.group, drilldownState.page, drilldownState.limit]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const pieSeries = useMemo(() => buildPieSeries(report?.series?.pie), [report]);
  const pieTotal = useMemo(
    () => pieSeries.reduce((acc, item) => acc + toNumber(item.value), 0),
    [pieSeries]
  );

  const pieGradient = useMemo(() => {
    if (!pieTotal) return 'conic-gradient(#1f2937 0deg 360deg)';
    let cursor = 0;
    const slices = pieSeries.map((item) => {
      const degrees = (toNumber(item.value) / pieTotal) * 360;
      const start = cursor;
      cursor += degrees;
      return {
        ...item,
        start,
        degrees,
        colorStr: `${item.color} ${start}deg ${cursor}deg`
      };
    });

    const isHoveredOrSelected = (key) => drilldownState.status === key;
    
    // Create an SVG-based pie chart for click events instead of conic-gradient
    return slices;
  }, [pieSeries, pieTotal, drilldownState.status]);

  const renderSvgPie = () => {
    if (!pieTotal) {
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 transform">
          <circle cx="50" cy="50" r="48" fill="transparent" stroke="#1f2937" strokeWidth="4" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90 transform drop-shadow-md">
        {pieGradient.map((slice) => {
          if (slice.value === 0) return null;
          
          const isSelected = drilldownState.status === slice.key;
          const isFaded = drilldownState.status && drilldownState.status !== slice.key;
          
          // Math for SVG arcs
          const radius = isSelected ? 50 : 48; // Pop out selected
          const strokeWidth = isSelected ? 50 : 48;
          const circumference = 2 * Math.PI * (radius / 2);
          const dasharray = `${(slice.degrees / 360) * circumference} ${circumference}`;
          const offset = -((slice.start / 360) * circumference);

          return (
            <circle
              key={slice.key}
              cx="50"
              cy="50"
              r={radius / 2}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dasharray}
              strokeDashoffset={offset}
              className={`cursor-pointer transition-all duration-300 hover:opacity-90 ${
                isFaded ? 'opacity-30 grayscale' : 'opacity-100'
              }`}
              onClick={() => handlePieClick(slice.key)}
            />
          );
        })}
      </svg>
    );
  };

  const barPayload = useMemo(() => buildBarSeries(report?.series?.bar), [report]);

  const barRows = useMemo(
    () =>
      barPayload.categories.map((category, index) => {
        const points = barPayload.series.map((item) => ({
          name: item.name,
          value: toNumber(item.values[index]),
          color: item.color,
        }));
        const total = points.reduce((acc, point) => acc + point.value, 0);
        return { category, points, total };
      }),
    [barPayload]
  );

  const exportReport = () => {
    const query = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      download: '1',
    });
    if (filters.group_id) query.set('group_id', filters.group_id);
    if (filters.employee_id) query.set('employee_id', filters.employee_id);
    window.location.href = `/api/report?${query.toString()}`;
  };

  const exportExcel = async () => {
    try {
      const { exportReportExcel } = await import('@/lib/export-excel');
      await exportReportExcel(report, filters);
    } catch (err) {
      warning(err.message || 'Excel export failed.', 'Export Error');
    }
  };

  const exportPDF = async () => {
    try {
      const { exportReportPDF } = await import('@/lib/export-pdf');
      await exportReportPDF(report, filters);
    } catch (err) {
      warning(err.message || 'PDF export failed.', 'Export Error');
    }
  };

  const handlePieClick = useCallback((statusKey) => {
    setDrilldownState((prev) => {
      const newStatus = prev.status === statusKey ? null : statusKey;
      return { ...prev, status: newStatus, group: null, page: 1 };
    });
  }, []);

  const handleBarClick = useCallback((groupName) => {
    setDrilldownState((prev) => {
      const newGroup = prev.group === groupName ? null : groupName;
      return { ...prev, group: newGroup, status: null, page: 1 };
    });
  }, []);

  const clearDrilldown = useCallback(() => {
    setDrilldownState((prev) => ({ ...prev, status: null, group: null, page: 1 }));
  }, []);

  const handlePageChange = useCallback((newPage) => {
    setDrilldownState((prev) => ({ ...prev, page: newPage }));
  }, []);

  const handleSetRange = useCallback((rangeKey) => {
    setFilters((prev) => ({
      ...prev,
      from: startOfRange(rangeKey),
      to: endOfRange(rangeKey),
    }));
  }, []);

  const statusToneClass =
    apiError?.type === 'forbidden'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-100';

  const drilldownShowingLabel = formatText(t('reportPage.drilldown.showingRows'), {
    count: drillRows.length,
  });
  const drilldownTruncatedSuffix = formatText(t('reportPage.drilldown.truncatedSuffix'), {
    limit: report?.drilldown?.limit || drillRows.length,
  });

  return (
    <div className="ui-page-shell max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-cyan-300">
            {t('reportPage.header.label')}
          </p>
          <h1 className="text-3xl font-bold text-foreground">{t('reportPage.header.title')}</h1>
          <p className="ui-readable-muted mt-1">{t('reportPage.header.description')}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportReport} className="ui-btn-secondary">
            <Download className="h-4 w-4" />
            {t('reportPage.actions.exportCsv')}
          </button>
          <button type="button" onClick={exportPDF} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/20 inline-flex items-center gap-2">
            <Download className="h-4 w-4" />
            PDF
          </button>
          <button type="button" onClick={exportExcel} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20 inline-flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
        </div>
      </div>

      {apiError && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${statusToneClass}`}>
          <p className="font-semibold">
            {apiError.type === 'forbidden'
              ? t('reportPage.errors.forbidden')
              : t('reportPage.errors.requestFailed')}
          </p>
          <p className="mt-1 text-xs opacity-90">{apiError.message}</p>
        </div>
      )}

      <div className="ui-card-shell grid grid-cols-1 gap-3 p-3 md:grid-cols-5">
        <div className="ui-control-group">
          <label htmlFor="report-from" className="ui-control-label">
            {t('reportPage.filters.fromLabel')}
          </label>
          <input
            id="report-from"
            type="date"
            value={filters.from}
            onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            className="ui-control-input text-sm"
          />
        </div>
        <div className="ui-control-group">
          <label htmlFor="report-to" className="ui-control-label">
            {t('reportPage.filters.toLabel')}
          </label>
          <input
            id="report-to"
            type="date"
            value={filters.to}
            onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            className="ui-control-input text-sm"
          />
        </div>
        <div className="ui-control-group">
          <label htmlFor="report-group" className="ui-control-label">
            {t('reportPage.filters.groupLabel')}
          </label>
          <select
            id="report-group"
            value={filters.group_id}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, group_id: event.target.value, employee_id: '' }))
            }
            className="ui-control-select text-sm"
          >
            <option value="">{t('reportPage.filters.groupPlaceholder')}</option>
            {groupOptions.map((group) => (
              <option key={group.id || group.label} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-control-group">
          <label htmlFor="report-employee" className="ui-control-label">
            {t('reportPage.filters.employeeLabel')}
          </label>
          <select
            id="report-employee"
            value={filters.employee_id}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, employee_id: event.target.value }))
            }
            className="ui-control-select text-sm"
          >
            <option value="">{t('reportPage.filters.employeePlaceholder')}</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-full flex flex-wrap gap-2">
          {PRESET_RANGE.map((range) => (
            <button
              key={range.key}
              type="button"
              onClick={() => handleSetRange(range.key)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              {range.label}
            </button>
          ))}
        </div>
        <div className="flex items-end">
          <button type="button" onClick={loadReport} className="ui-btn-primary w-full">
            <RefreshCcw className="h-4 w-4" />
            {t('reportPage.actions.refresh')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="ui-card-shell p-4">
          <div className="mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-foreground">
              {t('reportPage.charts.pie.title')}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px,1fr] sm:items-center">
            <div
              className="relative mx-auto h-40 w-40"
              aria-label={t('reportPage.charts.pie.title')}
              role="img"
            >
              {renderSvgPie()}
              <div className="pointer-events-none absolute inset-0 m-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full border border-border bg-background text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t('reportPage.charts.pie.rowsLabel')}
                  </p>
                  <p className="font-mono text-xl font-bold text-foreground">{pieTotal}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {pieSeries.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('reportPage.charts.pie.emptyState')}
                </p>
              ) : (
                pieSeries.map((item) => (
                  <div
                    key={item.key}
                    className="ui-card-muted flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 text-foreground">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.name}
                    </div>
                    <span className="font-mono text-sm text-foreground">{item.value}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="ui-card-shell p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-foreground">
                {t('reportPage.charts.bar.title')}
              </h2>
            </div>
            {config?.scheduling?.monthly_target_hours > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground border border-border px-2 py-0.5 rounded">
                <span className="h-2 w-2 rounded-full bg-cyan-500/50" />
                Target: {config.scheduling.monthly_target_hours}h
                <span className="opacity-60">(global config)</span>
              </div>
            )}
          </div>
          <div className="space-y-3">
              {barRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('reportPage.charts.bar.emptyState')}
                </p>
              ) : (
                barRows.map((row) => {
                  const isSelected = drilldownState.group === row.category;
                  const isFaded = drilldownState.group && drilldownState.group !== row.category;
                  
                  return (
                    <div 
                      key={row.category} 
                      className={`space-y-1.5 cursor-pointer rounded p-1.5 transition-colors hover:bg-muted/50 ${isSelected ? 'bg-muted/50 ring-1 ring-border' : ''} ${isFaded ? 'opacity-40 grayscale' : 'opacity-100'}`}
                      onClick={() => handleBarClick(row.category)}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={`text-foreground ${isSelected ? 'font-semibold' : ''}`}>{row.category}</span>
                        <span className="font-mono text-muted-foreground">{row.total}</span>
                      </div>
                    <div className="flex h-2.5 overflow-hidden rounded bg-muted relative">
                      {config?.scheduling?.monthly_target_hours > 0 && row.total > 0 && (
                        <div 
                           className="absolute top-0 bottom-0 z-10 border-l border-cyan-500/50"
                           style={{ left: `${Math.min(100, (config.scheduling.monthly_target_hours / row.total) * 100)}%` }}
                           title={`Target: ${config.scheduling.monthly_target_hours}h`}
                        />
                      )}
                      {row.points.map((point) => (
                          <div
                            key={`${row.category}-${point.name}`}
                            className="h-full transition-all duration-300 hover:brightness-110"
                            style={{
                              width: row.total ? `${(point.value / row.total) * 100}%` : '0%',
                              backgroundColor: point.color,
                            }}
                            title={`${point.name}: ${point.value}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
          </div>
          {barPayload.series.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
              {barPayload.series.map((item) => (
                <div
                  key={item.name}
                  className="ui-card-muted flex items-center gap-1.5 px-2 py-1 text-foreground"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ui-table-shell">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {t('reportPage.drilldown.heading')}
              {drilldownState.status && ` - Status: ${getStatusLabel(drilldownState.status, t)}`}
              {drilldownState.group && ` - Group: ${drilldownState.group}`}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {drilldownShowingLabel}
              {report?.drilldown?.total
                ? ` ${t('reportPage.drilldown.ofLabel')} ${report.drilldown.total}`
                : ''}
              {report?.drilldown?.truncated ? ` ${drilldownTruncatedSuffix}` : ''}.
            </p>
          </div>
          {(drilldownState.status || drilldownState.group) && (
            <button 
              onClick={clearDrilldown}
              className="text-xs font-medium text-amber-500 hover:text-amber-400"
            >
              Clear Filter
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="ui-table-head">
              <tr className="text-left">
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.date')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.employee')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.group')}
                </th>
                {drillRows.some(r => r.flags !== undefined) ? (
                  <>
                    <th className="ui-table-head-cell px-4 py-2">
                      {t('reportPage.table.columns.status')}
                    </th>
                    <th className="ui-table-head-cell px-4 py-2">
                      {t('reportPage.table.columns.flags')}
                    </th>
                  </>
                ) : (
                  <th className="ui-table-head-cell px-4 py-2">
                    {t('reportPage.table.columns.status')}
                  </th>
                )}
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.schedule')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.actual')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.scans')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.workedHours')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={drillRows.some(r => r.flags !== undefined) ? 9 : 8} className="ui-table-cell-muted px-4 py-8 text-center text-xs">
                    {t('reportPage.drilldown.loading')}
                  </td>
                </tr>
              ) : drillRows.length === 0 ? (
                <tr>
                  <td colSpan={drillRows.some(r => r.flags !== undefined) ? 9 : 8} className="ui-table-cell-muted px-4 py-8 text-center text-xs">
                    {t('reportPage.drilldown.emptyState')}
                  </td>
                </tr>
              ) : (
                drillRows.map((row) => (
                  <tr
                    key={`${row.employee_id || 'emp'}-${row.scan_date || 'date'}-${row.pin || 'pin'}-${row.actual_in || 'in'}-${row.actual_out || 'out'}`}
                    className="ui-table-row"
                  >
                    <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">
                      {row.scan_date || '-'}
                    </td>
                    <td className="ui-table-cell px-4 py-3">
                      <span
                        className="inline-block max-w-[200px] truncate align-bottom"
                        title={row.employee_name || 'Unknown'}
                      >
                        {row.employee_name || 'Unknown'}
                      </span>{' '}
                      <span className="ui-table-cell-muted font-mono text-xs">
                        ({row.pin || '-'})
                      </span>
                    </td>
                    <td className="ui-table-cell-muted px-4 py-3 text-xs">
                      {row.group_name || 'Ungrouped'}
                    </td>
                    <td className="ui-table-cell px-4 py-3 text-xs">{row.status || '-'}</td>
                    {row.flags !== undefined && (
                      <td className="ui-table-cell-muted px-4 py-3 text-xs">
                        {Array.isArray(row.flags) && row.flags.length ? row.flags.join(', ') : '-'}
                      </td>
                    )}
                    <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">
                      {(row.scheduled_in || '--:--') + ' → ' + (row.scheduled_out || '--:--')}
                    </td>
                    <td className="ui-table-cell px-4 py-3 font-mono text-xs">
                      {(row.actual_in || '--:--') + ' → ' + (row.actual_out || '--:--')}
                    </td>
                    <td className="ui-table-cell px-4 py-3 font-mono text-xs text-cyan-300">
                      {toNumber(row.scan_count)}
                    </td>
                    <td className="ui-table-cell px-4 py-3 font-mono text-xs">
                      {row.worked_minutes != null
                        ? `${Math.floor(row.worked_minutes / 60)}h ${row.worked_minutes % 60}m`
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {report?.drilldown?.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              Page {report.drilldown.page} of {report.drilldown.totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(Math.max(1, report.drilldown.page - 1))}
                disabled={report.drilldown.page === 1}
                className="ui-btn-secondary px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(Math.min(report.drilldown.totalPages, report.drilldown.page + 1))}
                disabled={report.drilldown.page === report.drilldown.totalPages}
                className="ui-btn-secondary px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusLabel(status, t) {
  const map = {
    on_time: t('reportPage.charts.pie.onTime') || 'On Time',
    late: t('reportPage.charts.pie.late') || 'Late',
    early_leave: t('reportPage.charts.pie.earlyLeave') || 'Early Leave',
    anomaly: t('reportPage.charts.pie.anomaly') || 'Anomaly',
  };
  return map[status] || status;
}
