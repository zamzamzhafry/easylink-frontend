'use client';

import Link from 'next/link';
import { TableEmptyRow, TableLoadingRow, TableShell } from '@/components/ui/table-shell';
import { compactDateDayLabel } from '@/lib/schedule-helpers';

function normalizeDateKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return text.includes('T') ? text.slice(0, 10) : text.slice(0, 10);
}

function displayTime(timeValue) {
  return String(timeValue || '').slice(0, 5) || '-';
}

function dayMeta(dateValue, holidayMap, todayIso) {
  const isoDate = normalizeDateKey(dateValue);
  const weekday = new Date(`${isoDate}T00:00:00`).getDay();
  return {
    isoDate,
    compactLabel: compactDateDayLabel(isoDate, 'id-ID'),
    isToday: isoDate === todayIso,
    isSunday: weekday === 0,
    isFriday: weekday === 5,
    holiday: holidayMap?.[isoDate] || null,
  };
}

export default function QuickSummariesTable({
  loading,
  error,
  employees,
  dates,
  rowMap,
  holidayMap = {},
  onRetry,
}) {
  const todayIso = normalizeDateKey(new Date());
  const employeeColWidth = 280;
  const dayColWidth = 112;
  const tableMinWidth = Math.max(1000, employeeColWidth + dayColWidth * dates.length);
  const colSpan = 1 + dates.length;

  return (
    <TableShell innerClassName="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
        <thead className="sticky top-0 z-20">
          <tr className="border-b border-border bg-background/85 text-left backdrop-blur">
            <th
              className="sticky left-0 z-30 border-r border-border/70 bg-background/90 px-4 py-3 text-xs font-medium text-muted-foreground backdrop-blur"
              style={{ width: `${employeeColWidth}px`, minWidth: `${employeeColWidth}px` }}
            >
              Employee
            </th>
            {dates.map((dateValue) => {
              const meta = dayMeta(dateValue, holidayMap, todayIso);
              return (
                <th
                  key={meta.isoDate || String(dateValue)}
                  className={`px-2 py-3 text-center text-xs font-medium ${
                    meta.holiday
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : meta.isSunday
                        ? 'bg-rose-500/10 text-rose-700/90 dark:text-rose-300'
                        : meta.isFriday
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : meta.isToday
                            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                            : 'text-muted-foreground'
                  }`}
                  style={{ width: `${dayColWidth}px`, minWidth: `${dayColWidth}px` }}
                  title={
                    meta.holiday?.name
                      ? `${meta.compactLabel} - ${meta.holiday.name}`
                      : meta.compactLabel
                  }
                >
                  <div className="font-mono text-[11px]">{meta.compactLabel || '-'}</div>
                  {meta.holiday && (
                    <div className="mt-1 line-clamp-2 text-[10px] font-normal text-rose-700/90 dark:text-rose-200">
                      {meta.holiday.name}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-border/60">
          {loading ? (
            <TableLoadingRow colSpan={colSpan} label="Loading quick summaries..." />
          ) : error ? (
            <tr className="ui-table-row">
              <td colSpan={colSpan} className="ui-table-cell px-4 py-8 text-center">
                <div className="text-sm text-rose-500 dark:text-rose-300">{error}</div>
                {typeof onRetry === 'function' && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="ui-btn-secondary mt-3 min-h-0 px-3 py-1.5 text-xs"
                  >
                    Retry
                  </button>
                )}
              </td>
            </tr>
          ) : employees.length === 0 ? (
            <TableEmptyRow colSpan={colSpan} label="No employees found" />
          ) : (
            employees.map((employee) => {
              const rowData = rowMap.get(Number(employee.id));
              return (
                <tr key={employee.id} className="data-row">
                  <td className="sticky left-0 z-10 border-r border-border/60 bg-background/90 px-4 py-2 backdrop-blur">
                    <Link
                      href={`/employees/${employee.id}`}
                      className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {employee.nama}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">PIN {employee.pin || '-'}</div>
                    {employee.nama_group && (
                      <div className="mt-0.5 text-xs text-primary/80">{employee.nama_group}</div>
                    )}
                  </td>
                  {dates.map((dateValue) => {
                    const meta = dayMeta(dateValue, holidayMap, todayIso);
                    const cell = rowData?.cells?.[meta.isoDate] || null;
                    const bgClass = meta.holiday
                      ? 'bg-rose-500/12'
                      : meta.isSunday
                        ? 'bg-rose-500/10'
                        : meta.isFriday
                          ? 'bg-emerald-500/10'
                          : meta.isToday
                            ? 'bg-cyan-500/10 dark:bg-cyan-500/15'
                            : '';
                    return (
                      <td
                        key={`${employee.id}-${meta.isoDate || String(dateValue)}`}
                        className={`px-2 py-2 align-top ${bgClass}`}
                      >
                        {!cell?.punch_times?.length ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {cell.punch_times.map((timeValue, index) => (
                                <span
                                  key={`${employee.id}-${meta.isoDate || String(dateValue)}-${timeValue}-${index}`}
                                  className="inline-flex rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[11px] text-teal-300"
                                >
                                  {displayTime(timeValue)}
                                </span>
                              ))}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {cell.count} punch{cell.count > 1 ? 'es' : ''}
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </TableShell>
  );
}
