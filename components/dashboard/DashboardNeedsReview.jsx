'use client';
import Link from 'next/link';
import { AlertTriangle, Clock, Fingerprint } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';

export function DashboardNeedsReview({ items }) {
  const { locale } = useAppLocale();
  const t = (path) => getUIText(path, locale);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">{t('dashboardPage.needsReview')}</span>
        </div>
        <Link
          href="/attendance"
          className="text-xs font-medium text-teal-400 transition-colors hover:text-teal-300"
        >
          {t('dashboardPage.quickLinks.attendance')} →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('dashboardPage.tableHead.name')}</th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('dashboardPage.tableHead.date')}</th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('dashboardPage.tableHead.issue')}</th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground text-right">{t('dashboardPage.tableHead.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-xs text-muted-foreground">
                  {t('dashboardPage.emptyReview')}
                </td>
              </tr>
            ) : (
              items.map((row, i) => (
                <tr key={i} className="data-row hover:bg-muted/50">
                  <td className="px-5 py-2.5 text-foreground">
                    {row.karyawan_id ? (
                      <Link href={`/employees/${row.karyawan_id}`} className="hover:text-teal-300">
                        {row.nama}
                      </Link>
                    ) : (
                      row.nama
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {row.scan_date}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      row.anomaly_type === 'terlambat' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' :
                      row.anomaly_type === 'pulang_awal' ? 'border-orange-500/20 bg-orange-500/10 text-orange-400' :
                      'border-rose-500/20 bg-rose-500/10 text-rose-400'
                    }`}>
                      {row.anomaly_type === 'terlambat' && <Clock className="h-3 w-3" />}
                      {row.anomaly_type === 'tidak_hadir' && <AlertTriangle className="h-3 w-3" />}
                      {row.anomaly_label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/attendance?from=${row.scan_date}&to=${row.scan_date}`}
                      className="inline-flex rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
