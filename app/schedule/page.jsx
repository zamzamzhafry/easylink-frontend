'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, Upload, Users } from 'lucide-react';
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
  parseScheduleTemplateImport,
  scheduleCsvTemplate,
  scheduleHoursSummary,
  schedulePrintHtml,
  weekDates,
  weekStart,
} from '@/lib/schedule-helpers';

const TABS = [
  { key: 'plan', label: 'Group Schedule Plan' },
  { key: 'import', label: 'Import / Check' },
  { key: 'summary', label: 'Employee Work Summary' },
];

export default function SchedulePage() {
  const { success, warning } = useToast();
  const [activeTab, setActiveTab] = useState('plan');
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()));
  const [data, setData] = useState({ shifts: [], schedules: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [bulkModal, setBulkModal] = useState(false);
  const [importResult, setImportResult] = useState({ entries: [], errors: [] });
  const [uploadFileName, setUploadFileName] = useState('');
  const [applyingImport, setApplyingImport] = useState(false);

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

  const printSchedule = () => {
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) {
      warning('Unable to open print window. Please allow popups.', 'Print blocked');
      return;
    }
    popup.document.write(schedulePrintHtml(data.employees, dates, getShift));
    popup.document.close();
    popup.focus();
    popup.print();
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

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);

    try {
      const text = await file.text();
      const result = parseScheduleTemplateImport(text, data.employees, data.shifts);
      setImportResult(result);
    } catch {
      warning('Failed to parse the uploaded CSV file.', 'Import parsing failed');
    }
  };

  const applyImport = async () => {
    if (!importResult.entries.length) {
      warning('No valid rows to import.', 'Import warning');
      return;
    }
    if (importResult.errors.length) {
      warning('Please fix validation errors before applying import.', 'Import warning');
      return;
    }

    setApplyingImport(true);
    try {
      const result = await requestJson('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_rows',
          rows: importResult.entries.map((entry) => ({
            karyawan_id: entry.karyawan_id,
            tanggal: entry.tanggal,
            shift_id: entry.shift_id,
          })),
        }),
      });

      success(
        `Imported ${result.affected || 0} schedule rows${result.skipped ? `, skipped ${result.skipped}` : ''}.`,
        'Import complete'
      );
      await load();
    } catch (error) {
      warning(error.message || 'Failed to apply import rows.', 'Import failed');
    } finally {
      setApplyingImport(false);
    }
  };

  const groups = useMemo(() => groupOptionsFromEmployees(data.employees), [data.employees]);

  const groupedEmployees = useMemo(() => {
    const map = new Map();
    data.employees.forEach((employee) => {
      const key = employee.group_id ? String(employee.group_id) : 'ungrouped';
      const label = employee.nama_group || 'Unassigned';
      const prev = map.get(key) || { id: key, name: label, members: [] };
      prev.members.push(employee);
      map.set(key, prev);
    });
    return [...map.values()].sort((a, b) => b.members.length - a.members.length);
  }, [data.employees]);

  const hoursSummary = useMemo(
    () => scheduleHoursSummary(data.employees, data.schedules, data.shifts),
    [data.employees, data.schedules, data.shifts]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Planning</p>
          <h1 className="text-3xl font-bold text-white">Shift Schedule</h1>
          <p className="mt-1 text-sm text-slate-400">
            Group planning, import checking, print/export, and estimated work hours.
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
          <button
            type="button"
            onClick={printSchedule}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-teal-500 text-slate-900'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'plan' && (
        <div className="space-y-6">
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

          <div className="rounded-xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Employee Table by Group</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Group</th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Members</th>
                    <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Employee List</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {groupedEmployees.map((group) => (
                    <tr key={group.id}>
                      <td className="px-4 py-3 text-white">{group.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{group.members.length}</td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {group.members.map((member) => `${member.nama} (PIN ${member.pin || '-'})`).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-white">Import Schedule Template (CSV)</h2>
          <p className="text-xs text-slate-400">
            Upload the exported template, edit shifts per date, then check and apply.
          </p>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white">
            <Upload className="h-3.5 w-3.5" /> Upload CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleUpload} />
          </label>
          {uploadFileName && <p className="text-xs text-slate-500">File: {uploadFileName}</p>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-xs text-emerald-300">Valid entries</p>
              <p className="font-mono text-xl font-bold text-white">{importResult.entries.length}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-300">Validation errors</p>
              <p className="font-mono text-xl font-bold text-white">{importResult.errors.length}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
              <p className="text-xs text-slate-400">Week range</p>
              <p className="font-mono text-sm text-white">
                {from} - {to}
              </p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-300">Import check errors</p>
              <ul className="space-y-1 text-xs text-amber-200">
                {importResult.errors.slice(0, 20).map((error, index) => (
                  <li key={index}>
                    Row {error.row}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={applyImport}
            disabled={applyingImport || !importResult.entries.length}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400 disabled:opacity-50"
          >
            {applyingImport ? 'Applying import...' : 'Apply Import'}
          </button>
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Estimated Work Hours per Employee</h2>
            <p className="mt-1 text-xs text-slate-500">
              Based on assigned shift count and `tb_shift_type.jam_kerja` in selected week.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Employee</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Group</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Scheduled Days</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Estimated Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {hoursSummary.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-white">{row.nama}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{row.nama_group || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">{row.scheduled_days}</td>
                    <td className="px-4 py-3 font-mono text-xs text-teal-300">{row.estimated_hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
