'use client';

import { CalendarDays, RefreshCcw } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import { PRESET_RANGE } from '@/lib/attendance-helpers';
import { getUIText } from '@/lib/localization/ui-texts';

export default function AttendanceFilters({
  from,
  to,
  count,
  anomalyCount,
  groupId,
  groups = [],
  employeeId = '',
  employees = [],
  incompleteOnly = false,
  rowsPerPage,
  rowsPerPageOptions = [],
  onFromChange,
  onToChange,
  onGroupChange,
  onEmployeeChange,
  onIncompleteOnlyChange,
  onRowsPerPageChange,
  onSetRange,
  onRefresh,
  refreshDisabled = false,
}) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = (path) => getUIText(path, resolvedLocale);
  const presetLabel = (key, fallbackLabel) => {
    const localized = getUIText(`attendancePage.filters.presets.${key}`, resolvedLocale);
    return localized === `attendancePage.filters.presets.${key}` ? fallbackLabel : localized;
  };
  const summaryText = t('attendancePage.filters.resultsSummary')
    .replace('{{count}}', String(count))
    .replace('{{anomalies}}', String(anomalyCount));

  return (
    <div className="panel-card space-y-3 p-4">
      <div className="ui-control-row items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <span>{summaryText}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRefresh?.()}
            disabled={refreshDisabled}
            className="pill-button inline-flex items-center gap-2 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            {t('refresh')}
          </button>
          {PRESET_RANGE.filter((preset) => preset.key !== 'last').map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onSetRange(preset.key)}
              className="pill-button px-3 py-1.5 text-xs"
            >
              {presetLabel(preset.key, preset.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="ui-control-row">
        <div className="ui-control-group max-w-[11rem]">
          <label htmlFor="attendance-from" className="ui-control-label">
            {t('attendancePage.filters.from')}
          </label>
          <input
            id="attendance-from"
            type="date"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
            className="control-input min-h-0 py-1.5 font-mono text-sm"
          />
        </div>

        <div className="ui-control-group max-w-[11rem]">
          <label htmlFor="attendance-to" className="ui-control-label">
            {t('attendancePage.filters.to')}
          </label>
          <input
            id="attendance-to"
            type="date"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
            className="control-input min-h-0 py-1.5 font-mono text-sm"
          />
        </div>

        <div className="ui-control-group max-w-[13rem]">
          <label htmlFor="attendance-group" className="ui-control-label">
            {t('attendancePage.filters.group')}
          </label>
          <select
            id="attendance-group"
            value={groupId ?? ''}
            onChange={(event) => onGroupChange?.(event.target.value)}
            className="control-select min-h-0 py-1.5 pl-3 pr-8 text-sm"
          >
            <option value="">{t('attendancePage.filters.allGroups')}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.nama_group}
              </option>
            ))}
          </select>
        </div>

        <div className="ui-control-group min-w-[14rem]">
          <label htmlFor="attendance-employee" className="ui-control-label">
            {t('attendancePage.filters.employee')}
          </label>
          <select
            id="attendance-employee"
            value={employeeId ?? ''}
            onChange={(event) => onEmployeeChange?.(event.target.value)}
            className="control-select min-h-0 py-1.5 pl-3 pr-8 text-sm"
          >
            <option value="">{t('attendancePage.filters.allEmployees')}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ui-control-group max-w-[10rem]">
          <label htmlFor="attendance-rows-per-page" className="ui-control-label">
            {t('attendancePage.filters.rowsPerPage')}
          </label>
          <select
            id="attendance-rows-per-page"
            value={rowsPerPage}
            onChange={(event) => onRowsPerPageChange?.(Number(event.target.value))}
            className="control-select min-h-0 py-1.5 pl-3 pr-8 text-sm"
          >
            {rowsPerPageOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-border/70 bg-muted/45 px-3 py-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={Boolean(incompleteOnly)}
            onChange={(event) => onIncompleteOnlyChange?.(event.target.checked)}
            className="ui-control-check"
          />
          {t('attendancePage.filters.incompleteOnly')}
        </label>
      </div>
    </div>
  );
}

