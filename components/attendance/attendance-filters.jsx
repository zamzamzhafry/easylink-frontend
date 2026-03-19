'use client';

import { CalendarDays } from 'lucide-react';
import { PRESET_RANGE } from '@/lib/attendance-helpers';

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
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <CalendarDays className="h-4 w-4 shrink-0 text-teal-400" />
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-from" className="text-xs text-slate-500">
          From
        </label>
        <input
          id="attendance-from"
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-white focus:border-teal-500 focus:outline-none"
        />
        <label htmlFor="attendance-to" className="text-xs text-slate-500">
          To
        </label>
        <input
          id="attendance-to"
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-white focus:border-teal-500 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-group" className="text-xs text-slate-500">
          Group
        </label>
        <select
          id="attendance-group"
          value={groupId ?? ''}
          onChange={(event) => onGroupChange?.(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
        >
          <option value="">All groups</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.nama_group}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attendance-employee" className="text-xs text-slate-500">
          Employee
        </label>
        <select
          id="attendance-employee"
          value={employeeId ?? ''}
          onChange={(event) => onEmployeeChange?.(event.target.value)}
          className="max-w-[220px] rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>
      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={Boolean(incompleteOnly)}
          onChange={(event) => onIncompleteOnlyChange?.(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-teal-500"
        />
        Not complete only
      </label>
      <div className="flex flex-wrap gap-2">
        {PRESET_RANGE.map((range) => (
          <button
            key={range.key}
            type="button"
            onClick={() => onSetRange(range.key)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-teal-500/60 hover:text-teal-400"
          >
            {range.label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-4 text-xs">
        <span className="text-slate-500">
          <span className="font-mono font-bold text-white">{count}</span> records
        </span>
        {anomalyCount > 0 && (
          <span className="text-amber-400">
            <span className="font-mono font-bold">{anomalyCount}</span> anomalies
          </span>
        )}
      </div>
    </div>
  );
}
