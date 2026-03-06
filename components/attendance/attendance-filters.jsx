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
  onFromChange,
  onToChange,
  onGroupChange,
  onSetRange,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <CalendarDays className="h-4 w-4 shrink-0 text-teal-400" />
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">From</label>
        <input
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-white focus:border-teal-500 focus:outline-none"
        />
        <label className="text-xs text-slate-500">To</label>
        <input
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-white focus:border-teal-500 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500">Group</label>
        <select
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
