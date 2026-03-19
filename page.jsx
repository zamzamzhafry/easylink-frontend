// app/page.jsx — Dashboard
import pool from '@/lib/db';
import { Users, UserCheck, UserX, Clock, Fingerprint, Monitor } from 'lucide-react';
import Link from 'next/link';

async function getStats() {
  const today = new Date().toISOString().slice(0, 10);

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM tb_karyawan');

  // employees who scanned today
  const [[{ hadir }]] = await pool
    .query(
      `SELECT COUNT(DISTINCT pin) AS hadir
     FROM tb_scanlog
     WHERE scan_date = ?`,
      [today]
    )
    .catch(() => [[{ hadir: 0 }]]);

  // employees with a schedule today but no scan → absent
  const [[{ jadwal_hari }]] = await pool
    .query(
      `SELECT COUNT(*) AS jadwal_hari
     FROM tb_schedule s
     JOIN tb_shift_type st ON s.shift_id = st.id
     WHERE s.tanggal = ? AND st.needs_scan = 1`,
      [today]
    )
    .catch(() => [[{ jadwal_hari: 0 }]]);

  // late today — scheduled pagi 07:00, compare first scan
  const [late] = await pool
    .query(
      `SELECT COUNT(DISTINCT sl.pin) AS cnt
     FROM tb_scanlog sl
     JOIN tb_schedule sc ON sc.karyawan_id = (
       SELECT id FROM tb_karyawan WHERE pin = sl.pin LIMIT 1
     ) AND sc.tanggal = ?
     JOIN tb_shift_type st ON sc.shift_id = st.id
     WHERE sl.scan_date = ?
       AND st.jam_masuk IS NOT NULL
       AND TIMEDIFF(MIN(sl.scan_time), ADDTIME(st.jam_masuk,'00:15:00')) > 0
     GROUP BY sl.pin`,
      [today, today]
    )
    .catch(() => [[{ cnt: 0 }]]);

  // recent 10 scans
  const [recent] = await pool
    .query(
      `SELECT sl.pin, sl.scan_date, sl.scan_time, sl.verify_mode,
            COALESCE(k.nama, u.nama, sl.pin) AS nama
     FROM tb_scanlog sl
     LEFT JOIN tb_karyawan k ON k.pin = sl.pin
     LEFT JOIN tb_user     u ON u.pin = sl.pin
     ORDER BY sl.scan_date DESC, sl.scan_time DESC
     LIMIT 10`
    )
    .catch(() => [[]]);

  // device count
  const [[{ devices }]] = await pool.query('SELECT COUNT(*) AS devices FROM tb_device');

  return {
    total: Number(total),
    hadir: Number(hadir),
    jadwal_hari: Number(jadwal_hari),
    late: Array.isArray(late) ? late.length : 0,
    recent: Array.isArray(recent) ? recent : [],
    devices: Number(devices),
  };
}

const verifyLabel = (v) => {
  const map = {
    1: 'Fingerprint',
    20: 'Face Recognition',
    30: 'Vein Scan',
    4: 'Face',
    15: 'Palm',
    2: 'Card',
  };
  return map[v] ?? `Mode ${v}`;
};

export default async function Dashboard() {
  const stats = await getStats();
  const absent = Math.max(0, stats.jadwal_hari - stats.hadir);

  const cards = [
    {
      label: 'Total Karyawan',
      value: stats.total,
      icon: Users,
      color: 'text-teal-400',
      bg: 'bg-teal-400/10',
      href: '/employees',
    },
    {
      label: 'Hadir Hari Ini',
      value: stats.hadir,
      icon: UserCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      href: '/attendance',
    },
    {
      label: 'Tidak Hadir',
      value: absent,
      icon: UserX,
      color: 'text-rose-400',
      bg: 'bg-rose-400/10',
      href: '/attendance',
    },
    {
      label: 'Terlambat',
      value: stats.late,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      href: '/attendance',
    },
    {
      label: 'Perangkat Aktif',
      value: stats.devices,
      icon: Monitor,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
      href: '#',
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-teal-400 uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <h1 className="text-3xl font-bold text-white">Dashboard Absensi</h1>
        <p className="text-slate-400 mt-1 text-sm">EasyLink biometric attendance system overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors group"
          >
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-white font-mono">{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </Link>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: '/employees', label: 'Manage Employees', desc: 'Edit names & link users' },
          { href: '/attendance', label: 'Attendance Log', desc: 'View scan history' },
          { href: '/groups', label: 'Employee Groups', desc: 'Organize by team/shift group' },
          { href: '/schedule', label: 'Shift Schedule', desc: 'Assign shifts & view calendar' },
        ].map(({ href, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="bg-slate-900 border border-slate-800 hover:border-teal-500/40 rounded-xl p-4 transition-all group"
          >
            <div className="font-semibold text-white text-sm group-hover:text-teal-400 transition-colors">
              {label}
            </div>
            <div className="text-slate-500 text-xs mt-1">{desc}</div>
            <div className="mt-3 text-teal-500 text-xs font-mono">→ Open</div>
          </Link>
        ))}
      </div>

      {/* Recent Scans */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-semibold text-white">Recent Scans</span>
          <span className="ml-auto text-xs text-slate-500 font-mono">last 10 entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-5 py-2.5 text-slate-500 font-medium text-xs uppercase tracking-wide">
                  Nama
                </th>
                <th className="px-4 py-2.5 text-slate-500 font-medium text-xs uppercase tracking-wide">
                  PIN
                </th>
                <th className="px-4 py-2.5 text-slate-500 font-medium text-xs uppercase tracking-wide">
                  Tanggal
                </th>
                <th className="px-4 py-2.5 text-slate-500 font-medium text-xs uppercase tracking-wide">
                  Waktu
                </th>
                <th className="px-4 py-2.5 text-slate-500 font-medium text-xs uppercase tracking-wide">
                  Metode
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {stats.recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500 text-xs">
                    No scan data found
                  </td>
                </tr>
              ) : (
                stats.recent.map((r) => (
                  <tr
                    key={`${r.pin}-${r.scan_date}-${r.scan_time}-${r.verify_mode}`}
                    className="data-row"
                  >
                    <td className="px-5 py-2.5 text-white">{r.nama}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{r.pin}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{r.scan_date}</td>
                    <td className="px-4 py-2.5 text-teal-400 font-mono text-xs">{r.scan_time}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700">
                        {verifyLabel(r.verify_mode)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
