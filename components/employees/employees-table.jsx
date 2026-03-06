'use client';

import { AlertCircle, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { TableEmptyRow, TableHeadRow, TableLoadingRow, TableShell } from '@/components/ui/table-shell';

const TABLE_HEADERS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Full Name (karyawan)' },
  { key: 'relation', label: 'PIN + Device User (user)' },
  { key: 'nip', label: 'NIP' },
  { key: 'contract', label: 'Kontrak' },
  { key: 'status', label: 'Link Status' },
  { key: 'duty', label: 'Active Duty' },
  { key: 'actions', label: '' },
];

export default function EmployeesTable({ loading, rows, onEdit, onDelete }) {
  const handleDelete = (employee) => {
    const label = employee.nama_karyawan || employee.pin || `ID ${employee.id}`;
    const confirmed = window.confirm(`Soft delete ${label}? This record will be marked deleted.`);
    if (confirmed) {
      onDelete(employee);
    }
  };

  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead>
          <TableHeadRow headers={TABLE_HEADERS} />
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {loading ? (
            <TableLoadingRow colSpan={8} />
          ) : rows.length === 0 ? (
            <TableEmptyRow colSpan={8} label="No results" />
          ) : (
            rows.map((employee) => {
              const hasName = Boolean(employee.nama_karyawan?.trim());
              const isActiveDuty = Boolean(Number(employee.isActiveDuty));
              const contract = employee.awal_kontrak
                ? `${employee.awal_kontrak}${employee.akhir_kontrak ? ` - ${employee.akhir_kontrak}` : ''}`
                : '';

              return (
                <tr key={employee.id} className="data-row">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{employee.id}</td>
                  <td className="px-4 py-3">
                    {hasName ? (
                      <span className="text-white">{employee.nama_karyawan}</span>
                    ) : (
                      <span className="text-xs italic text-amber-400/80">- no name set -</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-slate-300">
                        PIN {employee.pin || '-'}
                      </span>
                      <span className="text-slate-400">
                        {employee.nama_user || <span className="italic text-slate-600">- no user -</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{employee.nip || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {contract || <span className="text-slate-600">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    {hasName ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Linked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="h-3 w-3" /> Unlinked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isActiveDuty ? (
                      <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(employee)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-teal-500/40 hover:bg-teal-500/20 hover:text-teal-400"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(employee)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
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
