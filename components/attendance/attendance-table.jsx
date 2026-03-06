'use client';

import { AlertTriangle, CheckCircle2, Clock, Pencil } from 'lucide-react';
import { TableEmptyRow, TableHeadRow, TableLoadingRow, TableShell } from '@/components/ui/table-shell';
import { STATUS_MAP } from '@/lib/attendance-helpers';
import { shiftClassName } from '@/lib/shift-helpers';

const TABLE_HEADERS = [
  { key: 'date', label: 'Tanggal' },
  { key: 'name', label: 'Nama' },
  { key: 'group', label: 'Group' },
  { key: 'shift', label: 'Shift' },
  { key: 'in', label: 'Masuk' },
  { key: 'out', label: 'Keluar' },
  { key: 'duration', label: 'Durasi' },
  { key: 'status', label: 'Status' },
  { key: 'review', label: 'Review' },
  { key: 'note', label: 'Catatan' },
  { key: 'action', label: '' },
];

export default function AttendanceTable({ loading, rows, onEdit }) {
  const displayDate = (value) => {
    if (!value) return '-';
    const text = String(value);
    return text.includes('T') ? text.slice(0, 10) : text;
  };

  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead>
          <TableHeadRow headers={TABLE_HEADERS} />
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {loading ? (
            <TableLoadingRow colSpan={11} label="Loading..." />
          ) : rows.length === 0 ? (
            <TableEmptyRow colSpan={11} label="No records in range" />
          ) : (
            rows.map((row, index) => {
              const status = STATUS_MAP[row.computed_status] ?? STATUS_MAP.lainnya;
              const isAnomaly = row.computed_status !== 'normal';

              return (
                <tr key={`${row.pin}-${row.scan_date}-${index}`} className={`data-row ${isAnomaly ? 'bg-amber-500/3' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{displayDate(row.scan_date)}</td>
                  <td className="px-4 py-3 font-medium text-white">{row.nama}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{row.nama_group || '-'}</td>
                  <td className="px-4 py-3">
                    {row.nama_shift ? (
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${shiftClassName(
                          row.nama_shift
                        )}`}
                      >
                        {row.nama_shift}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-teal-500" />
                      <span className="font-mono text-xs text-teal-300">{row.masuk ?? '-'}</span>
                      {row.flags?.includes('terlambat') && (
                        <AlertTriangle className="h-3 w-3 text-amber-400" title="Terlambat" />
                      )}
                    </div>
                    {row.jam_masuk && (
                      <div className="mt-0.5 font-mono text-xs text-slate-600">Jadwal: {row.jam_masuk.slice(0, 5)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-300">{row.keluar ?? '-'}</span>
                      {row.flags?.includes('pulang_awal') && (
                        <AlertTriangle className="h-3 w-3 text-rose-400" title="Pulang Awal" />
                      )}
                    </div>
                    {row.jam_keluar && (
                      <div className="mt-0.5 font-mono text-xs text-slate-600">Jadwal: {row.jam_keluar.slice(0, 5)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.durasi_label}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${status.cls}`}
                    >
                      {isAnomaly ? <AlertTriangle className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.reviewed_status === 'reviewed' ? (
                      <span className="inline-flex rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                        Reviewed
                      </span>
                    ) : row.reviewed_status === 'pending' ? (
                      <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                        Pending
                      </span>
                    ) : (
                      <span className="inline-flex rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-500">
                        Not Required
                      </span>
                    )}
                  </td>
                  <td className="max-w-[200px] px-4 py-3">
                    {row.note_catatan ? (
                      <span className="block truncate text-xs text-slate-400">{row.note_catatan}</span>
                    ) : (
                      <span className="text-xs italic text-slate-700">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 transition-all hover:border-teal-500/40 hover:bg-teal-500/20 hover:text-teal-400"
                    >
                      <Pencil className="h-3 w-3" /> Note
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </TableShell>
  );
}
