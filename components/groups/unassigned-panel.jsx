'use client';

export default function UnassignedPanel({ rows }) {
  return (
    <div className="h-fit overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-5 py-3">
        <div className="text-sm font-semibold text-white">Unassigned</div>
        <div className="text-xs text-slate-500">{rows.length} employees without a group</div>
      </div>

      <div className="max-h-96 divide-y divide-slate-800/50 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs italic text-slate-600">All employees assigned.</p>
        ) : (
          rows.map((employee) => (
            <div key={employee.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs text-slate-400">
                {employee.nama?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-white">{employee.nama}</div>
                <div className="font-mono text-xs text-slate-600">PIN {employee.pin}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
