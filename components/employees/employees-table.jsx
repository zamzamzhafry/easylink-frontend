'use client';

import { AlertCircle, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import {
  TableEmptyRow,
  TableHeadRow,
  TableLoadingRow,
  TableShell,
} from '@/components/ui/table-shell';
import { getUIText } from '@/lib/localization/ui-texts';

export default function EmployeesTable({ loading, rows, onEdit, onDelete }) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = (path) => getUIText(path, resolvedLocale);
  const TABLE_HEADERS = [
    { key: 'id', label: t('employeesTable.headers.id') },
    { key: 'name', label: t('employeesTable.headers.name') },
    { key: 'relation', label: t('employeesTable.headers.relation') },
    { key: 'nip', label: t('employeesTable.headers.nip') },
    { key: 'contract', label: t('employeesTable.headers.contract') },
    { key: 'status', label: t('employeesTable.headers.status') },
    { key: 'duty', label: t('employeesTable.headers.duty') },
    { key: 'actions', label: '' },
  ];

  const handleDelete = (employee) => {
    const label = employee.nama_karyawan || employee.pin || `ID ${employee.id}`;
    const confirmed = window.confirm(
      getUIText('employeesTable.confirmDelete', resolvedLocale).replace('{{label}}', String(label))
    );
    if (confirmed) {
      onDelete(employee);
    }
  };

  return (
    <TableShell>
      <table className="w-full text-sm text-foreground">
        <thead>
          <TableHeadRow headers={TABLE_HEADERS} />
        </thead>
        <tbody className="divide-y divide-border/70">
          {loading ? (
            <TableLoadingRow colSpan={8} />
          ) : rows.length === 0 ? (
            <TableEmptyRow colSpan={8} label={t('employeesTable.empty')} />
          ) : (
            rows.map((employee) => {
              const hasName = Boolean(employee.nama_karyawan?.trim());
              const isActiveDuty = Boolean(Number(employee.isActiveDuty));
              const contract = employee.awal_kontrak
                ? `${employee.awal_kontrak}${employee.akhir_kontrak ? ` - ${employee.akhir_kontrak}` : ''}`
                : '';

              return (
                <tr key={employee.id} className="data-row ui-table-row">
                  <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">{employee.id}</td>
                  <td className="ui-table-cell px-4 py-3">
                    {hasName ? (
                      <span className="text-foreground">{employee.nama_karyawan}</span>
                    ) : (
                      <span className="text-xs italic text-amber-600 dark:text-amber-300">
                        {t('employeesTable.noName')}
                      </span>
                    )}
                  </td>
                  <td className="ui-table-cell px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-foreground">
                        PIN {employee.pin || '-'}
                      </span>
                      <span className="text-muted-foreground">
                        {employee.nama_user || (
                          <span className="italic text-muted-foreground">
                            {t('employeesTable.noUser')}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="ui-table-cell-muted px-4 py-3 font-mono text-xs">
                    {employee.nip || '-'}
                  </td>
                  <td className="ui-table-cell-muted whitespace-nowrap px-4 py-3 text-xs">
                    {contract || <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="ui-table-cell px-4 py-3">
                    {hasName ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> {t('employeesTable.linked')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
                        <AlertCircle className="h-3 w-3" /> {t('employeesTable.unlinked')}
                      </span>
                    )}
                  </td>
                  <td className="ui-table-cell px-4 py-3">
                    {isActiveDuty ? (
                      <span className="ui-status-badge ui-status-badge-success rounded-full px-2 py-1 text-xs">
                        {t('employeesTable.active')}
                      </span>
                    ) : (
                      <span className="ui-status-badge ui-status-badge-muted rounded-full px-2 py-1 text-xs">
                        {t('employeesTable.inactive')}
                      </span>
                    )}
                  </td>
                  <td className="ui-table-cell px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(employee)}
                        className="ui-btn-secondary min-h-0 px-3 py-1.5 text-xs"
                      >
                        <Pencil className="h-3 w-3" /> {t('employeesTable.actions.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(employee)}
                        className="ui-status-badge ui-status-badge-danger inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3 w-3" /> {t('employeesTable.actions.delete')}
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
