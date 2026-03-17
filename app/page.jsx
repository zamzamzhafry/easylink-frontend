import Link from 'next/link';
import { Clock, Fingerprint, Monitor, UserCheck, Users, UserX } from 'lucide-react';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import { getAuthContextFromCookies } from '@/lib/auth-session';

async function getStats({ limit, page, auth }) {
  const today = new Date().toISOString().slice(0, 10);
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

  const isAdmin = Boolean(auth?.is_admin);
  const userPin = auth?.pin ? String(auth.pin) : null;
  const allowedGroups = isAdmin
    ? null
    : Array.isArray(auth?.groups)
      ? auth.groups
          .filter((group) => group.can_schedule || group.can_dashboard)
          .map((group) => Number(group.group_id))
      : [];

  const buildScopeClause = (groupAlias = 'eg', pinColumn = 'sl.pin') => {
    if (isAdmin) return { clause: '', params: [] };

    const predicates = [];
    const params = [];

    if (userPin) {
      predicates.push(`${pinColumn} = ?`);
      params.push(userPin);
    }

    if (allowedGroups.length > 0) {
      predicates.push(`${groupAlias}.group_id IN (${allowedGroups.map(() => '?').join(',')})`);
      params.push(...allowedGroups);
    }

    if (predicates.length === 0) return { clause: ' AND 1 = 0', params: [] };

    return { clause: ` AND (${predicates.join(' OR ')})`, params };
  };

  const totalScope = buildScopeClause('eg', 'k.pin');
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT k.id) AS total
     FROM tb_karyawan k
     LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
     WHERE 1=1
       ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
       ${totalScope.clause}`,
    totalScope.params
  );

  const hadirScope = buildScopeClause('eg', 'sl.pin');
  const [[{ hadir }]] = await pool
    .query(
      `SELECT COUNT(DISTINCT sl.pin) AS hadir
       FROM tb_scanlog sl
       LEFT JOIN tb_karyawan k ON k.pin = sl.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
       LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
       WHERE DATE(sl.scan_date) = ?
         ${hadirScope.clause}`,
      [today, ...hadirScope.params]
    )
    .catch(() => [[{ hadir: 0 }]]);

  const jadwalScope = buildScopeClause('eg', 'k.pin');
  const [[{ jadwal_hari }]] = await pool
    .query(
      `SELECT COUNT(*) AS jadwal_hari
       FROM tb_schedule s
       JOIN tb_shift_type st ON s.shift_id = st.id
       JOIN tb_karyawan k ON k.id = s.karyawan_id
       LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
       WHERE s.tanggal = ?
         AND st.needs_scan = 1
         ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
         ${jadwalScope.clause}`,
      [today, ...jadwalScope.params]
    )
    .catch(() => [[{ jadwal_hari: 0 }]]);

  const lateScope = buildScopeClause('eg', 'logs.pin');
  const [[{ late_count }]] = await pool
    .query(
      `SELECT COUNT(*) AS late_count
       FROM (
         SELECT sl.pin, MIN(TIME(sl.scan_date)) AS first_scan
         FROM tb_scanlog sl
         WHERE DATE(sl.scan_date) = ?
         GROUP BY sl.pin
       ) logs
       JOIN tb_karyawan k ON k.pin = logs.pin
       LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
       JOIN tb_schedule sc ON sc.karyawan_id = k.id AND sc.tanggal = ?
       JOIN tb_shift_type st ON sc.shift_id = st.id
       WHERE st.jam_masuk IS NOT NULL
         AND TIME_TO_SEC(logs.first_scan) - TIME_TO_SEC(st.jam_masuk) > 900
         ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
         ${lateScope.clause}`,
      [today, today, ...lateScope.params]
    )
    .catch(() => [[{ late_count: 0 }]]);

  const recentScope = buildScopeClause('eg', 'sl.pin');
  const [[{ total_recent }]] = await pool
    .query(
      `SELECT COUNT(*) AS total_recent
       FROM tb_scanlog sl
       LEFT JOIN tb_karyawan k ON k.pin = sl.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
       LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
       WHERE 1=1 ${recentScope.clause}`,
      recentScope.params
    )
    .catch(() => [[{ total_recent: 0 }]]);
  const totalPages = Math.max(1, Math.ceil(Number(total_recent) / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;

  const [recent] = await pool
    .query(
      `SELECT sl.pin,
              DATE(sl.scan_date) AS scan_date,
              TIME(sl.scan_date) AS scan_time,
              sl.verifymode,
              COALESCE(k.nama, u.nama, sl.pin) AS nama
       FROM tb_scanlog sl
       LEFT JOIN tb_karyawan k ON k.pin = sl.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
       LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
       LEFT JOIN tb_user u ON u.pin = sl.pin
       WHERE 1=1 ${recentScope.clause}
       ORDER BY sl.scan_date DESC
       LIMIT ? OFFSET ?`,
      [...recentScope.params, limit, offset]
    )
    .catch(() => [[]]);

  const [[{ devices }]] = await pool.query('SELECT COUNT(*) AS devices FROM tb_device');

  return {
    total: Number(total),
    hadir: Number(hadir),
    jadwal_hari: Number(jadwal_hari),
    late: Number(late_count),
    recent: Array.isArray(recent) ? recent : [],
    recentTotal: Number(total_recent),
    recentPage: currentPage,
    recentTotalPages: totalPages,
    devices: Number(devices),
  };
}

const verifyLabel = (value) => {
  const map = { 1: 'Finger', 4: 'Face', 15: 'Palm', 2: 'Card' };
  return map[value] ?? `Mode ${value}`;
};

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if ([50, 100, 200].includes(parsed)) return parsed;
  return 50;
}

function normalizePage(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return 1;
}

function pageLink(page, limit) {
  return `/?page=${page}&limit=${limit}`;
}

export default async function Dashboard({ searchParams }) {
  const auth = await getAuthContextFromCookies();
  const limit = normalizeLimit(searchParams?.limit);
  const page = normalizePage(searchParams?.page);
  const stats = await getStats({ limit, page, auth });
  const absent = Math.max(0, stats.jadwal_hari - stats.hadir);
  const totalPages = stats.recentTotalPages;
  const safePage = stats.recentPage;

  // Auth — used to filter dashboard buttons
  const isAdmin = Boolean(auth?.is_admin);
  const canSchedule = isAdmin || Boolean(auth?.can_schedule);
  const canDashboard = isAdmin || Boolean(auth?.can_dashboard);
  const canAttendance = canSchedule || canDashboard;

  // Cards: only show cards whose destination the user can reach
  const cards = [
    isAdmin && {
      label: 'Total Karyawan',
      value: stats.total,
      icon: Users,
      color: 'text-teal-400',
      bg: 'bg-teal-400/10',
      href: '/employees',
    },
    canAttendance && {
      label: 'Hadir Hari Ini',
      value: stats.hadir,
      icon: UserCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
      href: '/attendance',
    },
    canAttendance && {
      label: 'Tidak Hadir',
      value: absent,
      icon: UserX,
      color: 'text-rose-400',
      bg: 'bg-rose-400/10',
      href: '/attendance',
    },
    canAttendance && {
      label: 'Terlambat',
      value: stats.late,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10',
      href: '/attendance',
    },
    isAdmin && {
      label: 'Perangkat Aktif',
      value: stats.devices,
      icon: Monitor,
      color: 'text-violet-400',
      bg: 'bg-violet-400/10',
      href: '#',
    },
  ].filter(Boolean);

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">
          {new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <h1 className="text-3xl font-bold text-white">Dashboard Absensi</h1>
        <p className="mt-1 text-sm text-slate-400">EasyLink biometric attendance system overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-xl border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700"
          >
            <div className={`mb-3 inline-flex rounded-lg p-2 ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="font-mono text-2xl font-bold text-white">{value}</div>
            <div className="mt-0.5 text-xs text-slate-400">{label}</div>
          </Link>
        ))}
      </div>

      {/* Quick links — only show what the user can actually access */}
      {(() => {
        const quickLinks = [
          isAdmin && {
            href: '/employees',
            label: 'Manage Employees',
            desc: 'Edit names & link users',
          },
          canAttendance && {
            href: '/attendance',
            label: 'Attendance Log',
            desc: 'View scan history',
          },
          isAdmin && {
            href: '/groups',
            label: 'Employee Groups',
            desc: 'Organize by team/shift group',
          },
          canSchedule && {
            href: '/schedule',
            label: 'Shift Schedule',
            desc: 'Assign shifts & view calendar',
          },
          canDashboard && {
            href: '/performance',
            label: 'Performance',
            desc: 'Per profile late/on-time stats',
          },
          isAdmin && {
            href: '/shifts',
            label: 'Shift Maker',
            desc: 'Customize punch in/out templates',
          },
          isAdmin && { href: '/users', label: 'Users', desc: 'Manage device user accounts' },
          isAdmin && { href: '/scanlog', label: 'Scan Log', desc: 'Raw biometric scanlog viewer' },
        ].filter(Boolean);
        if (!quickLinks.length) return null;
        return (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {quickLinks.map(({ href, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-xl border border-slate-800 bg-slate-900 p-4 transition-all hover:border-teal-500/40"
              >
                <div className="text-sm font-semibold text-white transition-colors group-hover:text-teal-400">
                  {label}
                </div>
                <div className="mt-1 text-xs text-slate-500">{desc}</div>
                <div className="mt-3 font-mono text-xs text-teal-500">-&gt; Open</div>
              </Link>
            ))}
          </div>
        );
      })()}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-3">
          <Fingerprint className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-white">Recent Scans</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500">
              page {safePage}/{totalPages} | showing {limit}
            </span>
            {[50, 100, 200].map((option) => (
              <Link
                key={option}
                href={pageLink(1, option)}
                className={`rounded-md border px-2 py-1 text-[11px] ${
                  option === limit
                    ? 'border-teal-500/50 bg-teal-500/15 text-teal-300'
                    : 'border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {option}
              </Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nama
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  PIN
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Tanggal
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Waktu
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Metode
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {stats.recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-xs text-slate-500">
                    No scan data found
                  </td>
                </tr>
              ) : (
                stats.recent.map((row) => (
                  <tr key={`${row.pin}-${row.scan_date}-${row.scan_time}`} className="data-row">
                    <td className="px-5 py-2.5 text-white">{row.nama}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{row.pin}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                      {String(row.scan_date).slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-teal-400">
                      {String(row.scan_time).slice(0, 8)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                        {verifyLabel(row.verifymode)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-2 text-xs">
          <span className="text-slate-500">total scans: {stats.recentTotal}</span>
          <div className="flex items-center gap-2">
            {safePage > 1 ? (
              <Link
                href={pageLink(safePage - 1, limit)}
                className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:text-white"
              >
                Prev
              </Link>
            ) : (
              <span className="rounded border border-slate-800 px-2 py-1 text-slate-600">Prev</span>
            )}
            {safePage < totalPages ? (
              <Link
                href={pageLink(safePage + 1, limit)}
                className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:text-white"
              >
                Next
              </Link>
            ) : (
              <span className="rounded border border-slate-800 px-2 py-1 text-slate-600">Next</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
