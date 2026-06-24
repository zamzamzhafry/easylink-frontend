'use client';

import { ChevronDown, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatJson(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ScanlogQueueSidebar({
  queueMeta,
  queueRows,
  queueError,
  expandedRows,
  onToggleRow,
  onRefresh,
  activeBatchId,
  className,
  title = 'Fetch Queue',
}) {
  return (
    <aside className={cn('space-y-4', className)}>
      <div className="rounded-2xl border border-border bg-background/70 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-[11px] text-muted-foreground">
              Active {queueMeta.active}/{queueMeta.concurrency} · Pending {queueMeta.pending}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-border bg-card/60 p-2 text-muted-foreground hover:text-foreground"
            aria-label="Refresh queue"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {queueError && <p className="mt-2 text-xs text-amber-400">{queueError}</p>}

        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {queueRows.length === 0 && <p className="text-xs text-muted-foreground">No recent jobs.</p>}

          {queueRows.map((row) => {
            const status = String(row.status || row.debug?.status || '').toLowerCase();
            const badgeClasses =
              {
                success: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
                running: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
                queued: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
                failed: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
              }[status] || 'text-muted-foreground bg-muted/40 border-border';

            const isExpanded = Boolean(expandedRows[row.id]);
            const requestInfo = row.debug?.request || {};
            const rangeLabel =
              requestInfo.from && requestInfo.to
                ? `${requestInfo.from} → ${requestInfo.to}`
                : 'Full range';
            const countsLabel = `Pulled ${row.pulled_count ?? row.debug?.result?.pulledCount ?? 0} · Inserted ${row.inserted_count ?? row.debug?.result?.insertedCount ?? 0}`;
            const rawPayload = row.debug?.result ?? row.debug?.error ?? row.debug ?? row;

            return (
              <div
                key={row.id}
                className={cn(
                  'rounded-xl border border-border bg-card/40',
                  Number(activeBatchId || 0) === Number(row.id) && 'border-teal-500/50'
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleRow(row.id)}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">Batch #{row.id}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {requestInfo.mode?.toUpperCase() || 'NEW'} · {rangeLabel}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{countsLabel}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-medium ${badgeClasses}`}
                    >
                      {status || 'unknown'}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
                    <p>Source: {row.source_sdk || row.debug?.request?.source || 'windows-sdk'}</p>
                    <p>Status: {status || row.status}</p>
                    {row.error_message && (
                      <p className="text-rose-300">Error: {row.error_message}</p>
                    )}
                    <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-background/80 p-3 text-[11px] text-foreground">
                      {formatJson(rawPayload)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
