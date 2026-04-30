import Link from 'next/link';
import { AlertTriangle, Clock, Fingerprint } from 'lucide-react';

export function DashboardNeedsReview({ items }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Needs Review</span>
        </div>
        <Link
          href="/attendance"
          className="text-xs font-medium text-teal-400 transition-colors hover:text-teal-300"
        >
          View all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left">
              <th className="px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">Nama</th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">Tanggal</th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">Masalah</th>
              <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-xs text-slate-500">
                  Tidak ada data yang perlu ditinjau.
                </td>
              </tr>
            ) : (
              items.map((row, i) => (
                <tr key={i} className="data-row hover:bg-slate-800/50">
                  <td className="px-5 py-2.5 text-white">
                    {row.karyawan_id ? (
                      <Link href={`/employees/${row.karyawan_id}`} className="hover:text-teal-300">
                        {row.nama}
                      </Link>
                    ) : (
                      row.nama
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
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
                      className="inline-flex rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
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
