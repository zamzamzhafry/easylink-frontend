export const STATUS_MAP = {
  normal: { label: 'Normal', cls: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400' },
  terlambat: { label: 'Terlambat', cls: 'border-amber-400/20 bg-amber-400/10 text-amber-400' },
  pulang_awal: { label: 'Pulang Awal', cls: 'border-rose-400/20 bg-rose-400/10 text-rose-400' },
  tidak_hadir: { label: 'Tidak Hadir', cls: 'border-slate-400/20 bg-slate-400/10 text-slate-400' },
  lembur: { label: 'Lembur', cls: 'border-violet-400/20 bg-violet-400/10 text-violet-400' },
  lainnya: { label: 'Lainnya', cls: 'border-sky-400/20 bg-sky-400/10 text-sky-400' },
};

export const PRESET_RANGE = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last', label: 'Last Month' },
];

const SHIFT_ICON_MAP = {
  sun: '☀️',
  sunset: '🌇',
  moon: '🌙',
  briefcase: '💼',
  bed: '🛌',
  plane: '✈️',
  star: '⭐',
  shield: '🛡️',
};

function inferShiftIconKey(name) {
  const normalized = String(name ?? '').toLowerCase();
  if (normalized.includes('pagi')) return 'sun';
  if (normalized.includes('siang')) return 'sunset';
  if (normalized.includes('malam')) return 'moon';
  if (normalized.includes('middle')) return 'briefcase';
  if (normalized.includes('libur')) return 'bed';
  if (normalized.includes('cuti')) return 'plane';
  if (normalized.includes('non')) return 'shield';
  return 'star';
}

function shiftIconLabel(row) {
  const key = row.icon_key || inferShiftIconKey(row.nama_shift);
  return SHIFT_ICON_MAP[key] ?? '⭐';
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const VERIFY_METHOD_MAP = {
  1: 'Fingerprint',
  20: 'Face Recognition',
  30: 'Vein Scan',
  4: 'Face',
  8: 'Palm',
  15: 'Palm',
  2: 'Card',
  200: 'Card',
};

function verifyMethodLabel(value) {
  const key = Number(value ?? 0);
  return VERIFY_METHOD_MAP[key] || `Mode ${key}`;
}

export function isoDate(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function startOfWeek(baseDate) {
  const day = baseDate.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const result = new Date(baseDate);
  result.setDate(baseDate.getDate() + offset);
  return result;
}

export function startOfRange(unit, base = new Date()) {
  const date = new Date(base);
  if (unit === 'week') return isoDate(startOfWeek(date));
  if (unit === 'month') {
    date.setDate(1);
    return isoDate(date);
  }
  if (unit === 'last') {
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);
    return isoDate(date);
  }
  return isoDate(date);
}

export function endOfRange(unit, base = new Date()) {
  const date = new Date(base);
  if (unit === 'week') {
    const start = startOfWeek(date);
    start.setDate(start.getDate() + 6);
    return isoDate(start);
  }
  if (unit === 'month') {
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    return isoDate(date);
  }
  if (unit === 'last') {
    date.setDate(0);
    return isoDate(date);
  }
  return isoDate(date);
}

export function countAnomalies(rows) {
  return rows.filter((row) => row.computed_status !== 'normal').length;
}

export function attendanceCsv(rows) {
  const headers = [
    'Tanggal',
    'Nama',
    'PIN',
    'Group',
    'Shift',
    'Shift Icon',
    'Shift Color',
    'Masuk',
    'Keluar',
    'Durasi',
    'Status',
    'Review',
    'Catatan',
  ];
  const values = rows.map((row) => [
    row.scan_date,
    row.nama,
    row.pin,
    row.nama_group ?? '-',
    row.nama_shift ?? 'Non-shift',
    shiftIconLabel(row),
    row.color_hex ?? '',
    row.masuk ?? '-',
    row.keluar ?? '-',
    row.durasi_label,
    STATUS_MAP[row.computed_status]?.label ?? row.computed_status,
    row.reviewed_status ?? 'pending',
    row.note_catatan ?? '',
  ]);

  return [headers, ...values].map((line) => line.map(csvEscape).join(',')).join('\n');
}

export function rawScanlogCsv(rows) {
  const headers = [
    'Tanggal',
    'Jam',
    'PIN',
    'Nama',
    'Group',
    'Review',
    'VerifyMode',
    'Verify Method',
    'IoMode',
    'WorkCode',
  ];
  const values = rows.map((row) => [
    row.scan_date,
    row.scan_time,
    row.pin,
    row.nama,
    row.nama_group ?? '-',
    row.reviewed_status ?? 'pending',
    row.verifymode ?? '',
    verifyMethodLabel(row.verifymode),
    row.iomode ?? '',
    row.workcode ?? '',
  ]);

  return [headers, ...values].map((line) => line.map(csvEscape).join(',')).join('\n');
}

export function lateChartData(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.pin}|${row.nama}`;
    if (!map.has(key)) {
      map.set(key, {
        pin: row.pin,
        nama: row.nama,
        karyawan_id: row.karyawan_id ?? null,
        group: row.nama_group ?? '-',
        lateCount: 0,
        earlyCount: 0,
        anomalyCount: 0,
        totalRows: 0,
      });
    }
    const bucket = map.get(key);
    bucket.totalRows += 1;
    if (row.flags?.includes('terlambat') || row.computed_status === 'terlambat')
      bucket.lateCount += 1;
    if (row.flags?.includes('pulang_awal') || row.computed_status === 'pulang_awal')
      bucket.earlyCount += 1;
    if (row.computed_status !== 'normal') bucket.anomalyCount += 1;
  });

  return [...map.values()].sort(
    (a, b) => b.lateCount - a.lateCount || b.anomalyCount - a.anomalyCount
  );
}
