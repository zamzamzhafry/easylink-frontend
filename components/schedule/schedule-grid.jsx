'use client';

import { DAYS_ID, formatIsoDate } from '@/lib/schedule-helpers';
import { shiftClassName } from '@/lib/shift-helpers';
import { TableEmptyRow, TableLoadingRow, TableShell } from '@/components/ui/table-shell';

export default function ScheduleGrid({ loading, employees, shifts, weekDates, getShift, onSetShift }) {
  const today = formatIsoDate(new Date());

  return (
    <TableShell innerClassName="overflow-x-auto">
      <table className="min-w-[900px] w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="w-48 px-4 py-3 text-left text-xs font-medium text-slate-500">Employee</th>
            {weekDates.map((date, index) => {
              const isToday = formatIsoDate(date) === today;
              return (
                <th
                  key={index}
                  className={`w-28 px-2 py-3 text-center text-xs font-medium ${
                    isToday ? 'text-teal-400' : 'text-slate-500'
                  }`}
                >
                  <div>{DAYS_ID[index]}</div>
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
            <TableLoadingRow colSpan={8} />
          ) : employees.length === 0 ? (
            <TableEmptyRow colSpan={8} label="No employees found" />
          ) : (
            employees.map((employee) => (
              <tr key={employee.id} className="data-row">
                <td className="px-4 py-2">
                  <div className="text-sm font-medium text-white">{employee.nama}</div>
                  <div className="font-mono text-xs text-slate-600">PIN {employee.pin}</div>
                  {employee.nama_group && (
                    <div className="mt-0.5 text-xs text-teal-500/70">{employee.nama_group}</div>
                  )}
                </td>

                {weekDates.map((date, dayIndex) => {
                  const dateString = formatIsoDate(date);
                  const schedule = getShift(employee.id, dateString);
                  const isToday = dateString === today;
                  return (
                    <td key={dayIndex} className={`px-2 py-2 text-center ${isToday ? 'bg-teal-950/30' : ''}`}>
                      <select
                        value={schedule?.shift_id ?? ''}
                        onChange={(event) => {
                          if (event.target.value) {
                            onSetShift(employee.id, dateString, Number(event.target.value));
                          }
                        }}
                        className={`w-full cursor-pointer rounded-lg border px-1 py-1.5 text-xs transition-colors focus:border-teal-500 focus:outline-none ${
                          schedule
                            ? `${shiftClassName(schedule.nama_shift)} bg-transparent`
                            : 'border-slate-700 bg-slate-800 text-slate-500'
                        }`}
                      >
                        <option value="">-</option>
                        {shifts.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.nama_shift}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}
