'use client';

import { AlertTriangle, CheckCircle2, Clock, Pencil } from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useMemo } from 'react';
import { useAppLocale } from '@/components/app-shell';
import { TableEmptyRow, TableHeadRow, TableLoadingRow } from '@/components/ui/table-shell';
import { STATUS_MAP } from '@/lib/attendance-helpers';
import { getUIText } from '@/lib/localization/ui-texts';
import { compactDateDayLabel } from '@/lib/schedule-helpers';
import { shiftClassName } from '@/lib/shift-helpers';

function AttendanceTable({
  loading,
  rows,
  onEdit,
  holidayMap = {},
  showReviewDetails = true,
}) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const localeKey = resolvedLocale;
  const t = useCallback((path) => getUIText(path, localeKey), [localeKey]);
  const tableHeaders = useMemo(
    () => [
      { key: 'date', label: t('attendancePage.table.date') },
      { key: 'name', label: t('attendancePage.table.name') },
      { key: 'group', label: t('attendancePage.table.group') },
      { key: 'shift', label: t('attendancePage.table.shift') },
      { key: 'in', label: t('attendancePage.table.in') },
      { key: 'out', label: t('attendancePage.table.out') },
      { key: 'duration', label: t('attendancePage.table.duration') },
      { key: 'status', label: t('attendancePage.table.status') },
      ...(showReviewDetails
        ? [
            { key: 'review', label: t('attendancePage.table.review') },
            { key: 'note', label: t('attendancePage.table.note') },
            { key: 'action', label: '' },
          ]
        : []),
    ],
    [showReviewDetails, t]
  );
  const colSpan = tableHeaders.length;

  const normalizeDateKey = (value) => {
    if (!value) return '';
    const text = String(value);
    return text.includes('T') ? text.slice(0, 10) : text.slice(0, 10);
  };
  const todayIso = normalizeDateKey(new Date());

  const compactDateInfo = (value) => {
    const isoDate = normalizeDateKey(value);
    if (!isoDate) return null;
    const parsedDate = new Date(`${isoDate}T00:00:00`);
    return {
      isoDate,
      compactLabel: compactDateDayLabel(isoDate, 'id-ID'),
      isSunday: parsedDate.getDay() === 0,
      isFriday: parsedDate.getDay() === 5,
      isToday: isoDate === todayIso,
    };
  };

  return (
    <div className="table-shell">
      <table className="w-full text-sm text-foreground">
        <thead>
          <TableHeadRow headers={tableHeaders} className="table-head-cell" />
        </thead>
        <tbody className="divide-y divide-border/70">
          {loading ? (
            <TableLoadingRow colSpan={colSpan} label={t('attendancePage.table.loading')} />
          ) : rows.length === 0 ? (
            <TableEmptyRow colSpan={colSpan} label={t('attendancePage.table.noRecords')} />
          ) : (
            rows.map((row) => {
              const status = STATUS_MAP[row.computed_status] ?? STATUS_MAP.lainnya;
              const isAnomaly = row.computed_status !== 'normal';
              const dateInfo = compactDateInfo(row.scan_date);
              const holiday = dateInfo?.isoDate ? holidayMap[dateInfo.isoDate] : null;
              const dateToneClass = holiday
                ? 'bg-rose-500/10'
                : dateInfo?.isSunday
                  ? 'bg-rose-500/10'
                  : dateInfo?.isFriday
                    ? 'bg-emerald-500/10'
                    : dateInfo?.isToday
                      ? 'bg-cyan-500/10 dark:bg-cyan-500/15'
                      : '';
              const labelToneClass = holiday
                ? 'text-rose-700 dark:text-rose-300'
                : dateInfo?.isSunday
                  ? 'text-rose-700 dark:text-rose-300'
                  : dateInfo?.isFriday
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : dateInfo?.isToday
                      ? 'text-cyan-700 dark:text-cyan-300'
                      : 'text-muted-foreground';

              return (
                <tr
                  key={`${row.pin}-${row.scan_date}`}
                  className={`data-row ui-table-row ${isAnomaly ? 'bg-amber-500/10' : ''}`}
                >
                  <td className={`table-cell-muted px-4 py-3 ${dateToneClass}`}>
                    {dateInfo ? (
                      <div
                        className="leading-tight"
                        title={holiday?.name ? `${dateInfo.isoDate} - ${holiday.name}` : dateInfo.isoDate}
                      >
                        <div className="font-mono text-xs text-foreground">{dateInfo.compactLabel}</div>
                        {holiday && (
                          <div className="line-clamp-1 text-[10px] text-rose-700/90 dark:text-rose-200">
                            {holiday.name}
                          </div>
                        )}
                        {!holiday && <div className={`text-[10px] ${labelToneClass}`}>{dateInfo.isoDate}</div>}
                      </div>
                    ) : (
                      <span className="font-mono text-xs">-</span>
                    )}
                  </td>
                  <td className="table-cell px-4 py-3 font-medium">
                    {row.karyawan_id ? (
                      <Link
                        href={`/employees/${row.karyawan_id}`}
                        className="block max-w-[200px] truncate text-foreground transition-colors hover:text-primary"
                        title={row.nama}
                      >
                        {row.nama}
                      </Link>
                    ) : (
                      <span className="block max-w-[200px] truncate text-foreground" title={row.nama}>
                        {row.nama}
                      </span>
                    )}
                  </td>
                  <td className="table-cell-muted px-4 py-3 text-xs">{row.nama_group || '-'}</td>
                  <td className="table-cell px-4 py-3">
                    {row.nama_shift ? (
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${shiftClassName(
                          row.nama_shift
                        )}`}
                      >
                        {row.nama_shift}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="table-cell px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-teal-500" />
                      <span className="font-mono text-xs text-teal-600 dark:text-teal-300">
                        {row.masuk ?? '-'}
                      </span>
                      {row.flags?.includes('terlambat') && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber-400"
                          title={t('attendancePage.table.late')}
                        />
                      )}
                    </div>
                    {row.jam_masuk && (
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {t('attendancePage.table.schedule')}: {row.jam_masuk.slice(0, 5)}
                      </div>
                    )}
                  </td>
                  <td className="table-cell px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-foreground">{row.keluar ?? '-'}</span>
                      {row.flags?.includes('pulang_awal') && (
                        <AlertTriangle
                          className="h-3 w-3 text-rose-400"
                          title={t('attendancePage.table.earlyLeave')}
                        />
                      )}
                    </div>
                    {row.jam_keluar && (
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {t('attendancePage.table.schedule')}: {row.jam_keluar.slice(0, 5)}
                      </div>
                    )}
                  </td>
                  <td className="table-cell-muted px-4 py-3 font-mono text-xs">
                    {row.durasi_label}
                  </td>
                  <td className="table-cell px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${status.cls}`}
                    >
                      {isAnomaly ? (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      ) : (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      )}
                      {status.label}
                    </span>
                  </td>
                  {showReviewDetails && (
                    <>
                      <td className="table-cell px-4 py-3">
                        {row.reviewed_status === 'reviewed' ? (
                          <span className="inline-flex rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                            {t('attendancePage.table.reviewed')}
                          </span>
                        ) : row.reviewed_status === 'pending' ? (
                          <span className="inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                            {t('attendancePage.table.pending')}
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                            {t('attendancePage.table.notRequired')}
                          </span>
                        )}
                      </td>
                      <td className="table-cell max-w-[200px] px-4 py-3">
                        {row.note_catatan ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.note_catatan}
                          </span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="table-cell px-4 py-3">
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            className="btn-outline min-h-0 px-2.5 py-1.5 text-xs"
                          >
                            <Pencil className="h-3 w-3" /> {t('attendancePage.table.noteAction')}
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default memo(AttendanceTable);
