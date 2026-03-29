'use client';

import { CalendarDays } from 'lucide-react';
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
  onFromChange,
  onToChange,
  onGroupChange,
  onEmployeeChange,
  onIncompleteOnlyChange,
  onSetRange,
}) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = (path) => getUIText(path, resolvedLocale);
  const presetLabel = (key, fallbackLabel) => {
    const localized = getUIText(`attendancePage.filters.presets.${key}`, resolvedLocale);
    return localized === `attendancePage.filters.presets.${key}` ? fallbackLabel : localized;
  };

  return (
    <div className="ui-card-shell ui-control-row items-center p-4">
      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-from" className="ui-control-label">
          {t('attendancePage.filters.from')}
        </label>
        <input
          id="attendance-from"
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
          className="ui-control-input min-h-0 w-auto py-1.5 font-mono text-sm"
        />
        <label htmlFor="attendance-to" className="ui-control-label">
          {t('attendancePage.filters.to')}
        </label>
        <input
          id="attendance-to"
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          className="ui-control-input min-h-0 w-auto py-1.5 font-mono text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-group" className="ui-control-label">
          {t('attendancePage.filters.group')}
        </label>
        <select
          id="attendance-group"
          value={groupId ?? ''}
          onChange={(event) => onGroupChange?.(event.target.value)}
          className="ui-control-select min-h-0 w-auto py-1.5 pl-3 pr-8 text-sm"
        >
          <option value="">{t('attendancePage.filters.allGroups')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.nama_group}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-employee" className="ui-control-label">
          {t('attendancePage.filters.employee')}
        </label>
        <select
          id="attendance-employee"
          value={employeeId ?? ''}
          onChange={(event) => onEmployeeChange?.(event.target.value)}
          className="ui-control-select min-h-0 max-w-[220px] py-1.5 pl-3 pr-8 text-sm"
        >
          <option value="">{t('attendancePage.filters.allEmployees')}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>
      <label className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-muted/45 px-3 py-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={Boolean(incompleteOnly)}
          onChange={(event) => onIncompleteOnlyChange?.(event.target.checked)}
          className="ui-control-check"
        />
        {t('attendancePage.filters.incompleteOnly')}
      </label>
      <div className="flex flex-wrap gap-2">
        {PRESET_RANGE.map((range) => (
          <button
            key={range.key}
            type="button"
            onClick={() => onSetRange(range.key)}
            className="ui-btn-secondary min-h-0 px-3 py-1.5 text-xs"
          >
            {presetLabel(range.key, range.label)}
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-4 text-xs">
        <span className="text-muted-foreground">
          <span className="font-mono font-bold text-foreground">{count}</span>{' '}
          {t('attendanceShared.records')}
        </span>
        {anomalyCount > 0 && (
          <span className="text-amber-500 dark:text-amber-400">
            <span className="font-mono font-bold">{anomalyCount}</span>{' '}
            {t('attendanceShared.anomalies')}
          </span>
        )}
      </div>
    </div>
  );
}
