'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);
  return isMobile;
}

function resolveMode(view, isMobile) {
  if (view === 'table' || view === 'cards') return view;
  return isMobile ? 'cards' : 'table';
}

function cellAlign(align) {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function renderCell(column, row, index) {
  if (typeof column.render === 'function') return column.render(row, index);
  return row?.[column.key];
}

export default function DataTable({
  columns = [],
  rows = [],
  loading = false,
  error = null,
  emptyLabel = 'No data',
  loadingLabel = 'Loading...',
  rowKey,
  view = 'auto',
  className,
}) {
  const isMobile = useIsMobile();
  const mode = resolveMode(view, isMobile);

  const keyFor = (row, index) => {
    if (typeof rowKey === 'function') return rowKey(row, index);
    if (typeof rowKey === 'string' && row?.[rowKey] != null) return row[rowKey];
    return index;
  };

  if (mode === 'cards') {
    const cardColumns = columns.filter((c) => c.priority !== 'hide');
    return (
      <div className={cn('space-y-3', className)}>
        {error ? (
          <div className="rounded-xl border border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.08)] px-4 py-6 text-center text-xs text-[hsl(var(--destructive))]">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-4 py-6 text-center text-xs text-[hsl(var(--muted-foreground,215_20%_65%))]">
            {loadingLabel}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.4)] px-4 py-6 text-center text-xs text-[hsl(var(--muted-foreground,215_20%_65%))]">
            {emptyLabel}
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={keyFor(row, index)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card,var(--background)))] p-4 shadow-sm"
            >
              <dl className="space-y-2">
                {cardColumns.map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground,215_20%_65%))]">
                      {column.mobileLabel ?? column.header}
                    </dt>
                    <dd className={cn('min-w-0 break-words text-sm text-[hsl(var(--foreground))]', cellAlign(column.align))}>
                      {renderCell(column, row, index)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className={cn('table-shell', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="ui-table-head text-left">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'table-head-cell whitespace-nowrap px-4 py-3',
                    cellAlign(column.align),
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr className="ui-table-row">
                <td colSpan={columns.length} className="px-4 py-10 text-center text-xs text-[hsl(var(--destructive))]">
                  {error}
                </td>
              </tr>
            ) : loading ? (
              <tr className="ui-table-row">
                <td colSpan={columns.length} className="table-cell-muted px-4 py-10 text-center text-xs">
                  {loadingLabel}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="ui-table-row">
                <td colSpan={columns.length} className="table-cell-muted px-4 py-10 text-center text-xs">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={keyFor(row, index)} className="ui-table-row">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn('px-4 py-3 align-middle', cellAlign(column.align), column.className)}
                    >
                      {renderCell(column, row, index)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
