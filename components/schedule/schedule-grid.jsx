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
  const selectedClass = schedule
    ? shiftClassName(schedule.nama_shift)
    : 'border-slate-700 text-slate-400';
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
  holidayMap,
  selectedGroupLabel,
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
  const tableRef = useRef(null);

  useEffect(() => {
    const holder = tableRef.current;
    if (!holder || !dates.length) return;
    const todayIndex = dates.findIndex((date) => formatIsoDate(date) === today);
    if (todayIndex < 0) return;

    const scrollTarget = employeeColWidth + todayIndex * dayColWidth - holder.clientWidth * 0.35;
    holder.scrollLeft = Math.max(0, scrollTarget);
  }, [dates, dayColWidth, today]);

  return (
    <TableShell innerClassName="overflow-x-auto" bodyRef={tableRef}>
      <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-300">
        <span className="font-semibold text-white">Selected Group:</span>{' '}
        <span className="text-teal-300">{selectedGroupLabel || 'All Groups'}</span>
      </div>
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
              const day = new Date(iso).getDay();
              const isSunday = day === 0;
              const isFriday = day === 5;
              const holiday = holidayMap?.[iso] || null;
              return (
                <th
                  key={iso}
                  className={`px-2 py-3 text-center text-xs font-medium ${
                    holiday
                      ? 'bg-rose-500/10 text-rose-300'
                      : isSunday
                        ? 'bg-rose-500/5 text-rose-300'
                        : isFriday
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : isToday
                            ? 'bg-cyan-500/10 text-cyan-300'
                            : 'text-slate-500'
                  }`}
                  style={{ width: `${dayColWidth}px`, minWidth: `${dayColWidth}px` }}
                >
                  <div>{dayLabel(date)}</div>
                  <div
                    className={`mt-0.5 font-mono text-base ${isToday ? 'text-cyan-300' : 'text-slate-300'}`}
                  >
                    {date.getDate()}
                  </div>
                  {holiday && (
                    <div className="mt-1 line-clamp-2 text-[10px] font-normal text-rose-200">
                      {holiday.name}
                    </div>
                  )}
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
                    <div className="font-mono text-xs text-slate-600">
                      PIN {employee.pin || '-'}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>Shifted: {metrics.shifted_days}d</span>
                      <span>Done: {metrics.done_hours.toFixed(1)}h</span>
                      <span>Pending: {metrics.pending_hours.toFixed(1)}h</span>
                      <span>Future: {metrics.future_hours.toFixed(1)}h</span>
                    </div>
                    {employee.nama_group && (
                      <div className="mt-0.5 text-xs text-teal-500/70">{employee.nama_group}</div>
                    )}
                  </td>

                  {dates.map((date) => {
                    const dateString = formatIsoDate(date);
                    const schedule = getShift(employee.id, dateString);
                    const isToday = dateString === today;
                    const weekday = new Date(dateString).getDay();
                    const isSunday = weekday === 0;
                    const isFriday = weekday === 5;
                    const holiday = holidayMap?.[dateString] || null;
                    const isPaidLeave =
                      String(schedule?.nama_shift || '')
                        .toLowerCase()
                        .includes('cuti') ||
                      String(schedule?.nama_shift || '')
                        .toLowerCase()
                        .includes('libur');
                    const anomalyStatus = anomalyByKey?.get(`${employee.id}|${dateString}`) || null;

                    const bgClass = holiday
                      ? 'bg-rose-500/10'
                      : isSunday
                        ? 'bg-rose-500/5'
                        : isFriday
                          ? 'bg-emerald-500/5'
                          : isPaidLeave
                            ? 'bg-sky-500/5'
                            : isToday
                              ? 'bg-cyan-950/30'
                              : '';

                    return (
                      <td
                        key={`${employee.id}-${dateString}`}
                        className={`px-1.5 py-2 text-center ${bgClass}`}
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
