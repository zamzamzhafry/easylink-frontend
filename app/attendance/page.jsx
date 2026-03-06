'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import AttendanceFilters from '@/components/attendance/attendance-filters';
import AttendanceTable from '@/components/attendance/attendance-table';
import NoteModal from '@/components/attendance/note-modal';
import { useToast } from '@/components/ui/toast-provider';
import {
  attendanceCsv,
  countAnomalies,
  endOfRange,
  isoDate,
  startOfRange,
} from '@/lib/attendance-helpers';
import { requestJson } from '@/lib/request-json';

export default function AttendancePage() {
  const { warning } = useToast();
  const [from, setFrom] = useState(startOfRange('week'));
  const [to, setTo] = useState(isoDate());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson(`/api/attendance?from=${from}&to=${to}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      warning(error.message || 'Failed to fetch attendance data.', 'Attendance request failed');
    } finally {
      setLoading(false);
    }
  }, [from, to, warning]);

  useEffect(() => {
    load();
  }, [load]);

  const setRange = (unit) => {
    if (unit === 'today') {
      const today = isoDate();
      setFrom(today);
      setTo(today);
      return;
    }

    setFrom(startOfRange(unit));
    setTo(endOfRange(unit));
  };

  const exportCsv = () => {
    const blob = new Blob([attendanceCsv(rows)], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `absensi_${from}_${to}.csv`;
    link.click();
  };

  const saveNote = async ({ status, catatan }) => {
    if (!editing) return false;

    try {
      await requestJson('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: editing.pin,
          tanggal: editing.scan_date,
          status,
          catatan,
        }),
      });
      await load();
      return true;
    } catch (error) {
      warning(error.message || 'Failed to save attendance note.', 'Unable to save note');
      return false;
    }
  };

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Records</p>
          <h1 className="text-3xl font-bold text-white">Absensi Karyawan</h1>
          <p className="mt-1 text-sm text-slate-400">Scan log with shift comparison and anomaly detection</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-sm text-teal-400 transition-colors hover:bg-teal-500/20"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <AttendanceFilters
        from={from}
        to={to}
        count={rows.length}
        anomalyCount={countAnomalies(rows)}
        onFromChange={setFrom}
        onToChange={setTo}
        onSetRange={setRange}
      />

      <AttendanceTable loading={loading} rows={rows} onEdit={setEditing} />

      {editing && <NoteModal row={editing} onClose={() => setEditing(null)} onSave={saveNote} />}
    </div>
  );
}
