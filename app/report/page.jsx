'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, PieChart, RefreshCcw } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import { useToast } from '@/components/ui/toast-provider';
import { getUIText } from '@/lib/localization/ui-texts';

const PIE_COLORS = {
  on_time: '#10b981',
  late: '#f59e0b',
  early_leave: '#fb7185',
  anomaly: '#a78bfa',
};

function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function monthStart(value = new Date()) {
  const date = new Date(value);
  date.setDate(1);
  return isoDate(date);
}

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
    from: monthStart(),
    to: isoDate(),
    group_id: '',
    employee_id: '',
  });
  const [report, setReport] = useState({
    filters: null,
    series: { pie: [], bar: { categories: [], series: [] } },
    drilldown: { rows: [], limit: 0, total: 0, truncated: false },
    metadata: { totalRecords: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);

  const drillRows = useMemo(
    () => (Array.isArray(report?.drilldown?.rows) ? report.drilldown.rows : []),
    [report]
  );

  const groupOptions = useMemo(() => {
    const map = new Map();
    drillRows.forEach((row) => {
      const key = row?.group_id == null ? '' : String(row.group_id);
      const label = row?.group_name || 'Ungrouped';
      if (!map.has(key)) map.set(key, label);
    });
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [drillRows]);

  const employeeOptions = useMemo(() => {
    const map = new Map();
    drillRows.forEach((row) => {
      if (row?.employee_id == null) return;
      const key = String(row.employee_id);
      const pinLabel = row?.pin ? ` (${row.pin})` : '';
      const label = `${row?.employee_name || 'Unknown'}${pinLabel}`;
      if (!map.has(key)) map.set(key, label);
    });
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [drillRows]);

  const loadReport = useCallback(async () => {
    const localizedRequestFailed = getUIText('reportPage.errors.requestFailed', resolvedLocale);
    const localizedFetchFailed = getUIText('reportPage.errors.fetchFailed', resolvedLocale);

    setLoading(true);
    setApiError(null);
    try {
      const query = new URLSearchParams({ from: filters.from, to: filters.to });
      if (filters.group_id) query.set('group_id', filters.group_id);
      if (filters.employee_id) query.set('employee_id', filters.employee_id);

      const response = await fetch(`/api/report?${query.toString()}`);
      const text = await response.text();
      const payload = parseJsonSafely(text);

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
          total: toNumber(payload?.drilldown?.total ?? payload?.metadata?.totalRecords),
          truncated: Boolean(payload?.drilldown?.truncated),
        },
        metadata: payload?.metadata || { totalRecords: 0 },
      });
    } catch (error) {
      const message = error?.message || localizedFetchFailed;
      setApiError({ type: 'error', message });
      warning(message, localizedRequestFailed);
    } finally {
      setLoading(false);
    }
  }, [filters.employee_id, filters.from, filters.group_id, filters.to, resolvedLocale, warning]);

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
      return `${item.color} ${start}deg ${cursor}deg`;
    });
    return `conic-gradient(${slices.join(', ')})`;
  }, [pieSeries, pieTotal]);

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
        <button type="button" onClick={exportReport} className="ui-btn-secondary">
          <Download className="h-4 w-4" />
          {t('reportPage.actions.exportCsv')}
        </button>
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
              className="mx-auto h-40 w-40 rounded-full border border-border"
              style={{ backgroundImage: pieGradient }}
              aria-label={t('reportPage.charts.pie.title')}
              role="img"
            >
              <div className="m-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full border border-border bg-background text-center">
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
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-foreground">
              {t('reportPage.charts.bar.title')}
            </h2>
          </div>
          <div className="space-y-3">
            {barRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('reportPage.charts.bar.emptyState')}
              </p>
            ) : (
              barRows.map((row) => (
                <div key={row.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{row.category}</span>
                    <span className="font-mono text-muted-foreground">{row.total}</span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded bg-muted">
                    {row.points.map((point) => (
                      <div
                        key={`${row.category}-${point.name}`}
                        className="h-full"
                        style={{
                          width: row.total ? `${(point.value / row.total) * 100}%` : '0%',
                          backgroundColor: point.color,
                        }}
                        title={`${point.name}: ${point.value}`}
                      />
                    ))}
                  </div>
                </div>
              ))
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
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            {t('reportPage.drilldown.heading')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {drilldownShowingLabel}
            {report?.drilldown?.total
              ? ` ${t('reportPage.drilldown.ofLabel')} ${report.drilldown.total}`
              : ''}
            {report?.drilldown?.truncated ? ` ${drilldownTruncatedSuffix}` : ''}.
          </p>
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
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.status')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.flags')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.schedule')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.actual')}
                </th>
                <th className="ui-table-head-cell px-4 py-2">
                  {t('reportPage.table.columns.scans')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="ui-table-cell-muted px-4 py-8 text-center text-xs">
                    {t('reportPage.drilldown.loading')}
                  </td>
                </tr>
              ) : drillRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="ui-table-cell-muted px-4 py-8 text-center text-xs">
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
                      {row.employee_name || 'Unknown'}{' '}
                      <span className="ui-table-cell-muted font-mono text-xs">
                        ({row.pin || '-'})
                      </span>
                    </td>
                    <td className="ui-table-cell-muted px-4 py-3 text-xs">
                      {row.group_name || 'Ungrouped'}
                    </td>
                    <td className="ui-table-cell px-4 py-3 text-xs">{row.status || '-'}</td>
                    <td className="ui-table-cell-muted px-4 py-3 text-xs">
                      {Array.isArray(row.flags) && row.flags.length ? row.flags.join(', ') : '-'}
                    </td>
                    <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">
                      {(row.scheduled_in || '--:--') + ' → ' + (row.scheduled_out || '--:--')}
                    </td>
                    <td className="ui-table-cell px-4 py-3 font-mono text-xs">
                      {(row.actual_in || '--:--') + ' → ' + (row.actual_out || '--:--')}
                    </td>
                    <td className="ui-table-cell px-4 py-3 font-mono text-xs text-cyan-300">
                      {toNumber(row.scan_count)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
