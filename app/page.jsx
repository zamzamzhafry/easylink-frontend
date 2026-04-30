import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Clock, Fingerprint, Monitor, UserCheck, Users, UserX } from 'lucide-react';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import { getAuthContextFromCookies } from '@/lib/auth-session';
import DashboardOpsPanel from '@/components/dashboard-ops-panel';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { DashboardNeedsReview } from '@/components/dashboard/DashboardNeedsReview';

function toMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

async function getStats({ auth }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
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

  const [[{ devices }]] = await pool.query('SELECT COUNT(*) AS devices FROM tb_device').catch(() => [[{ devices: 0 }]]);

  const trendFrom = sevenDaysAgo.toISOString().slice(0, 10);
  
  const trendHadirScope = buildScopeClause('eg', 'sl.pin');
  const [trendRows] = await pool.query(`
    SELECT DATE(sl.scan_date) as date, COUNT(DISTINCT sl.pin) as hadir
    FROM tb_scanlog sl
    LEFT JOIN tb_karyawan k ON k.pin = sl.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    WHERE DATE(sl.scan_date) >= ? AND DATE(sl.scan_date) <= ?
      ${trendHadirScope.clause}
    GROUP BY DATE(sl.scan_date)
    ORDER BY DATE(sl.scan_date) ASC
  `, [trendFrom, today, ...trendHadirScope.params]).catch(() => [[]]);

  const reviewFrom = threeDaysAgo.toISOString().slice(0, 10);
  
  const reviewScope = buildScopeClause('eg', 'k.pin');
  const [reviewQueryRows] = await pool.query(`
    SELECT 
      sc.tanggal as scan_date,
      k.id as karyawan_id,
      k.pin,
      COALESCE(k.nama, u.nama, k.pin) as nama,
      st.jam_masuk,
      st.jam_keluar,
      st.needs_scan,
      an.status as note_status,
      an.catatan as note_catatan,
      MIN(TIME(sl.scan_date)) AS masuk,
      MAX(TIME(sl.scan_date)) AS keluar
    FROM tb_schedule sc
    JOIN tb_karyawan k ON k.id = sc.karyawan_id ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    JOIN tb_shift_type st ON st.id = sc.shift_id
    LEFT JOIN tb_user u ON u.pin = k.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_attendance_note an ON an.pin = k.pin AND an.tanggal = sc.tanggal
    LEFT JOIN tb_scanlog sl ON sl.pin = k.pin AND DATE(sl.scan_date) = sc.tanggal
    WHERE sc.tanggal >= ? AND sc.tanggal <= ?
      AND st.needs_scan = 1
      AND an.status IS NULL
      ${reviewScope.clause}
    GROUP BY sc.id, sc.tanggal, k.id, k.pin, u.nama, st.jam_masuk, st.jam_keluar, st.needs_scan, an.status, an.catatan
    ORDER BY sc.tanggal DESC, k.nama ASC
  `, [reviewFrom, today, ...reviewScope.params]).catch(() => [[]]);

  const needsReview = [];
  const lateMinutesThreshold = 15;
  
  for (const row of reviewQueryRows) {
    if (needsReview.length >= 10) break;
    
    if (row.note_status || row.note_catatan) continue;
    
    const scheduledInMinutes = toMinutes(row.jam_masuk);
    const actualInMinutes = toMinutes(row.masuk);
    const scheduledOutMinutes = toMinutes(row.jam_keluar);
    const actualOutMinutes = toMinutes(row.keluar);
    
    let anomaly_type = null;
    let anomaly_label = null;

    if (row.needs_scan && actualInMinutes === null) {
      if (row.scan_date < today || (row.scan_date === today && scheduledInMinutes !== null && toMinutes(new Date().toLocaleTimeString('en-US', {hour12: false})) > scheduledInMinutes + lateMinutesThreshold)) {
         anomaly_type = 'tidak_hadir';
         anomaly_label = 'Tidak Hadir';
      }
    } else if (scheduledInMinutes !== null && actualInMinutes !== null && (actualInMinutes - scheduledInMinutes > lateMinutesThreshold)) {
      anomaly_type = 'terlambat';
      anomaly_label = 'Terlambat';
    } else if (scheduledOutMinutes !== null && actualOutMinutes !== null && (scheduledOutMinutes - actualOutMinutes > lateMinutesThreshold)) {
      anomaly_type = 'pulang_awal';
      anomaly_label = 'Pulang Awal';
    }
    
    if (anomaly_type) {
      needsReview.push({
        karyawan_id: row.karyawan_id,
        nama: row.nama,
        scan_date: new Date(row.scan_date).toISOString().slice(0, 10),
        anomaly_type,
        anomaly_label
      });
    }
  }

  const dHadir = Number(hadir);
  const dJadwal = Number(jadwal_hari);
  const dLate = Number(late_count);
  const dAbsent = Math.max(0, dJadwal - dHadir);
  const dOnTime = Math.max(0, dHadir - dLate);
  
  const pieData = [
    { label: 'Tepat Waktu', value: dOnTime, color: '#10b981' },
    { label: 'Terlambat', value: dLate, color: '#f59e0b' },
    { label: 'Tidak Hadir', value: dAbsent, color: '#f43f5e' },
  ].filter(d => d.value > 0);

  const dateMap = new Map();
  let currentDate = new Date(sevenDaysAgo);
  const end = new Date(today);
  while (currentDate <= end) {
    dateMap.set(currentDate.toISOString().slice(0, 10), {
      date: currentDate.toISOString().slice(0, 10),
      value: 0,
      color: '#10b981'
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  for (const row of trendRows) {
    const d = new Date(row.date).toISOString().slice(0, 10);
    if (dateMap.has(d)) {
      dateMap.get(d).value = Number(row.hadir);
    }
  }
  const barData = Array.from(dateMap.values());

  return {
    total: Number(total),
    hadir: dHadir,
    jadwal_hari: dJadwal,
    late: dLate,
    devices: Number(devices),
    pieData,
    barData,
    needsReview
  };
}



export default async function Dashboard() {
  const auth = await getAuthContextFromCookies();
  if (auth && !auth.is_admin) {
    redirect('/attendance');
  }
  const stats = await getStats({ auth });

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
      value: stats.pieData.find((d) => d.label === 'Tidak Hadir')?.value ?? 0,
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
    <div className="max-w-6xl space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard Absensi</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canAttendance && (
            <Link
              href="/attendance"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-teal-500/50 hover:text-teal-300"
            >
              Attendance
            </Link>
          )}
          {canSchedule && (
            <Link
              href="/schedule"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-teal-500/50 hover:text-teal-300"
            >
              Schedule
            </Link>
          )}
          {canDashboard && (
            <Link
              href="/report"
              className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-300 transition-colors hover:border-teal-400 hover:text-white"
            >
              Reports →
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 transition-colors hover:border-slate-700"
          >
            <div className={`shrink-0 rounded-lg p-1.5 ${bg}`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-lg font-bold leading-none text-white">{value}</div>
              <div className="mt-0.5 truncate text-[11px] text-slate-400">{label}</div>
            </div>
          </Link>
        ))}
      </div>

      <DashboardCharts pieData={stats.pieData} barData={stats.barData} />

      {(() => {
        const quickLinks = [
          isAdmin && { href: '/employees', label: 'Employees', desc: 'Edit names & link users' },
          isAdmin && { href: '/groups', label: 'Groups', desc: 'Organize by team/shift group' },
          canDashboard && { href: '/performance', label: 'Performance', desc: 'Late/on-time stats' },
          isAdmin && { href: '/shifts', label: 'Shift Maker', desc: 'Punch in/out templates' },
          isAdmin && { href: '/users', label: 'Users', desc: 'Device user accounts' },
          isAdmin && { href: '/scanlog', label: 'Scan Log', desc: 'Raw biometric scanlog' },
        ].filter(Boolean);
        if (!quickLinks.length) return null;
        return (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {quickLinks.map(({ href, label, desc }) => (
              <Link
                key={href}
                href={href}
                title={desc}
                className="group rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-center transition-all hover:border-slate-700 hover:bg-slate-900"
              >
                <div className="text-xs font-semibold text-slate-300 transition-colors group-hover:text-white">
                  {label}
                </div>
              </Link>
            ))}
          </div>
        );
      })()}

      <DashboardNeedsReview items={stats.needsReview} />

      {isAdmin && <DashboardOpsPanel />}
    </div>
  );
}
