'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Users } from 'lucide-react';
import BulkAssignModal from '@/components/schedule/bulk-assign-modal';
import ScheduleGrid from '@/components/schedule/schedule-grid';
import ShiftLegend from '@/components/schedule/shift-legend';
import WeekNavigation from '@/components/schedule/week-navigation';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';
import {
  addDays,
  formatIsoDate,
  groupOptionsFromEmployees,
  scheduleCsvTemplate,
  weekDates,
  weekStart,
} from '@/lib/schedule-helpers';

export default function SchedulePage() {
  const { warning } = useToast();
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()));
  const [data, setData] = useState({ shifts: [], schedules: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [bulkModal, setBulkModal] = useState(false);

  const dates = useMemo(() => weekDates(weekOf), [weekOf]);
  const from = formatIsoDate(dates[0]);
  const to = formatIsoDate(dates[6]);

  const getShift = useCallback(
    (employeeId, dateString) =>
      data.schedules.find((item) => item.karyawan_id === employeeId && item.tanggal === dateString),
    [data.schedules]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson(`/api/schedule?from=${from}&to=${to}`);
      setData(result ?? { shifts: [], schedules: [], employees: [] });
    } catch (error) {
      warning(error.message || 'Failed to fetch schedule data.', 'Schedule request failed');
    } finally {
      setLoading(false);
    }
  }, [from, to, warning]);

  useEffect(() => {
    load();
  }, [load]);

  const setShift = async (employeeId, dateString, shiftId) => {
    try {
      await requestJson('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set',
          karyawan_id: employeeId,
          tanggal: dateString,
          shift_id: shiftId,
        }),
      });
      await load();
    } catch (error) {
      warning(error.message || 'Failed to set shift schedule.', 'Unable to set shift');
    }
  };

  const exportTemplate = () => {
    const csv = scheduleCsvTemplate(data.employees, dates, getShift);
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `jadwal_${from}_${to}.csv`;
    link.click();
  };

  const applyBulkGroup = async ({ group_id, shift_id, from: dateFrom, to: dateTo }) => {
    try {
      const result = await requestJson('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_group',
          group_id,
          shift_id,
          from: dateFrom,
          to: dateTo,
        }),
      });
      return result?.affected ?? 0;
    } catch (error) {
      warning(error.message || 'Bulk assignment failed.', 'Unable to apply bulk assignment');
      return null;
    }
  };

  const groups = useMemo(() => groupOptionsFromEmployees(data.employees), [data.employees]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Planning</p>
          <h1 className="text-3xl font-bold text-white">Shift Schedule</h1>
          <p className="mt-1 text-sm text-slate-400">
            Assign shifts per employee per day. Absensi will detect anomalies automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/20 px-4 py-2.5 text-sm text-violet-300 transition-colors hover:bg-violet-500/30"
          >
            <Users className="h-4 w-4" /> Bulk Assign Group
          </button>
          <button
            type="button"
            onClick={exportTemplate}
            className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-400 transition-colors hover:bg-teal-500/20"
          >
            <Download className="h-4 w-4" /> Export Template
          </button>
        </div>
      </div>

      <WeekNavigation
        weekDates={dates}
        onPrevious={() => setWeekOf((current) => addDays(current, -7))}
        onNext={() => setWeekOf((current) => addDays(current, 7))}
      />

      <ShiftLegend shifts={data.shifts} />

      <ScheduleGrid
        loading={loading}
        employees={data.employees}
        shifts={data.shifts}
        weekDates={dates}
        getShift={getShift}
        onSetShift={setShift}
      />

      {bulkModal && (
        <BulkAssignModal
          shifts={data.shifts}
          groups={groups}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setBulkModal(false)}
          onApply={applyBulkGroup}
          onDone={async () => {
            setBulkModal(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
