'use client';

export default function UnassignedPanel({ rows }) {
  return (
    <div className="h-fit overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <div className="text-sm font-semibold text-white">Unassigned</div>
        <div className="text-xs text-muted-foreground">{rows.length} employees without a group</div>
      </div>

      <div className="max-h-96 divide-y divide-border/50 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs italic text-muted-foreground">
            All employees assigned.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((employee) => (
              <li key={employee.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs text-slate-400">
                  {employee.nama?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-white">{employee.nama}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    PIN {employee.pin} · privilege {employee.privilege ?? 0}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
