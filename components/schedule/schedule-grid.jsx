'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Circle, Clock3 } from 'lucide-react';
import { getShiftIcon } from '@/components/schedule/shift-icon';
import { formatIsoDate } from '@/lib/schedule-helpers';
import { shiftBadgeInlineStyle, shiftClassName } from '@/lib/shift-helpers';
import { TableEmptyRow, TableLoadingRow, TableShell } from '@/components/ui/table-shell';

function dayLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString('id-ID', { weekday: 'short' });
}

function ShiftPicker({ schedule, shifts, fontScale, anomalyStatus, onSetShift, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selectedLabel = schedule?.nama_shift || 'Not Assigned';
  const selectedClass = schedule ? shiftClassName(schedule.nama_shift) : 'border-slate-700 text-slate-400';
  const selectedStyle = schedule ? shiftBadgeInlineStyle(schedule) : null;
  const SelectedIcon = schedule ? getShiftIcon(schedule) : Circle;
  const anomalyClass =
    anomalyStatus === 'terlambat'
      ? 'ring-1 ring-amber-500/70 bg-amber-500/10'
      : anomalyStatus === 'pulang_awal'
        ? 'ring-1 ring-rose-500/70 bg-rose-500/10'
        : anomalyStatus
          ? 'ring-1 ring-violet-500/70 bg-violet-500/10'
          : '';

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={readOnly ? undefined : () => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-1 rounded-lg border px-1.5 py-1.5 text-left transition-colors ${selectedClass} ${anomalyClass} ${readOnly ? 'cursor-default' : 'hover:brightness-110'}`}
        style={{
          fontSize: `${Math.max(9, 10 * fontScale)}px`,
          ...(selectedStyle || {}),
        }}
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          <SelectedIcon className="h-3 w-3 shrink-0 opacity-80" />
          <span className="truncate">{selectedLabel}</span>
        </span>
        {!readOnly && (
          <span className="inline-flex items-center gap-1 text-[10px] opacity-80">
            {anomalyStatus && <AlertTriangle className="h-3 w-3 text-amber-300" />}
            {open ? '^' : 'v'}
          </span>
        )}
        {readOnly && anomalyStatus && (
          <AlertTriangle className="h-3 w-3 text-amber-300 opacity-80" />
        )}
      </button>

      {!readOnly && open && (
        <div className="absolute left-0 z-40 mt-1 max-h-56 w-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onSetShift(null);
              setOpen(false);
            }}
            className="mb-1 flex w-full items-center gap-2 rounded-md border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
          >
            <Circle className="h-3.5 w-3.5" />
            Not Assigned
          </button>

          {shifts.map((shift) => {
            const Icon = getShiftIcon(shift);
            return (
              <button
                key={shift.id}
                type="button"
                onClick={() => {
                  onSetShift(shift.id);
                  setOpen(false);
                }}
                className={`mb-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:brightness-110 ${shiftClassName(
                  shift.nama_shift
                )}`}
                style={shiftBadgeInlineStyle(shift) || undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{shift.nama_shift}</span>
                {shift.jam_masuk && (
                  <span className="ml-auto inline-flex items-center gap-1 opacity-75">
                    <Clock3 className="h-3 w-3" />
                    {String(shift.jam_masuk).slice(0, 5)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ScheduleGrid({
  loading,
  employees,
  shifts,
  dates,
  getShift,
  metricsByEmployee,
  anomalyByKey,
  zoomPercent = 100,
  onSetShift,
  readOnly = false,
}) {
  const today = formatIsoDate(new Date());
  const colSpan = 1 + dates.length;
  const clampedZoom = Math.min(150, Math.max(75, Number(zoomPercent) || 100));
  const employeeColWidth = 300;
  const dayColWidth = Math.round(100 * (clampedZoom / 100));
  const fontScale = clampedZoom / 100;
  const tableMinWidth = Math.max(1100, employeeColWidth + dayColWidth * dates.length);

  return (
    <TableShell innerClassName="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
        <thead className="sticky top-0 z-30 bg-slate-900">
          <tr className="border-b border-slate-800">
            <th
              className="sticky left-0 z-40 bg-slate-900 px-4 py-3 text-left text-xs font-medium text-slate-500"
              style={{ width: `${employeeColWidth}px`, minWidth: `${employeeColWidth}px` }}
            >
              Employee
            </th>
            {dates.map((date) => {
              const iso = formatIsoDate(date);
              const isToday = iso === today;
              return (
                <th
                  key={iso}
                  className={`px-2 py-3 text-center text-xs font-medium ${
                    isToday ? 'text-teal-400' : 'text-slate-500'
                  }`}
                  style={{ width: `${dayColWidth}px`, minWidth: `${dayColWidth}px` }}
                >
                  <div>{dayLabel(date)}</div>
                  <div className={`mt-0.5 font-mono text-base ${isToday ? 'text-teal-400' : 'text-slate-300'}`}>
                    {date.getDate()}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-800/40">
          {loading ? (
            <TableLoadingRow colSpan={colSpan} />
          ) : employees.length === 0 ? (
            <TableEmptyRow colSpan={colSpan} label="No employees found" />
          ) : (
            employees.map((employee) => {
              const metrics = metricsByEmployee.get(Number(employee.id)) || {
                shifted_days: 0,
                planned_hours: 0,
                done_hours: 0,
                pending_hours: 0,
                future_hours: 0,
              };

              return (
                <tr key={employee.id} className="data-row">
                  <td className="sticky left-0 z-20 bg-slate-950 px-4 py-2">
                    <Link
                      href={`/employees/${employee.id}`}
                      className="text-sm font-medium text-white hover:text-teal-300 transition-colors"
                    >
                      {employee.nama}
                    </Link>
                    <div className="font-mono text-xs text-slate-600">PIN {employee.pin || '-'}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Shifted: {metrics.shifted_days}d | Done: {metrics.done_hours.toFixed(1)}h | Pending:{' '}
                      {metrics.pending_hours.toFixed(1)}h | Future: {metrics.future_hours.toFixed(1)}h
                    </div>
                    {employee.nama_group && (
                      <div className="mt-0.5 text-xs text-teal-500/70">{employee.nama_group}</div>
                    )}
                  </td>

                  {dates.map((date) => {
                    const dateString = formatIsoDate(date);
                    const schedule = getShift(employee.id, dateString);
                    const isToday = dateString === today;
                    const anomalyStatus = anomalyByKey?.get(`${employee.id}|${dateString}`) || null;

                    return (
                      <td
                        key={`${employee.id}-${dateString}`}
                        className={`px-1.5 py-2 text-center ${isToday ? 'bg-teal-950/30' : ''}`}
                      >
                        <ShiftPicker
                          schedule={schedule}
                          shifts={shifts}
                          fontScale={fontScale}
                          anomalyStatus={anomalyStatus}
                          readOnly={readOnly}
                          onSetShift={(shiftId) => onSetShift(employee.id, dateString, shiftId)}
                        />
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
