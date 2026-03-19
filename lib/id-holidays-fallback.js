const FIXED_HOLIDAYS = [
  { monthDay: '01-01', name: 'Tahun Baru Masehi', is_cuti_bersama: false },
  { monthDay: '05-01', name: 'Hari Buruh Internasional', is_cuti_bersama: false },
  { monthDay: '06-01', name: 'Hari Lahir Pancasila', is_cuti_bersama: false },
  { monthDay: '08-17', name: 'Hari Kemerdekaan Republik Indonesia', is_cuti_bersama: false },
  { monthDay: '12-25', name: 'Hari Raya Natal', is_cuti_bersama: false },
];

const SPECIAL_2026 = [
  { date: '2026-03-19', name: 'Hari Raya Nyepi', is_cuti_bersama: false },
  { date: '2026-03-20', name: 'Cuti Bersama Nyepi', is_cuti_bersama: true },
  { date: '2026-04-03', name: 'Wafat Isa Al Masih', is_cuti_bersama: false },
  { date: '2026-04-12', name: 'Idulfitri 1447 H (Perkiraan)', is_cuti_bersama: false },
  { date: '2026-04-13', name: 'Idulfitri 1447 H (Perkiraan)', is_cuti_bersama: false },
  { date: '2026-04-14', name: 'Cuti Bersama Idulfitri (Perkiraan)', is_cuti_bersama: true },
  { date: '2026-05-14', name: 'Kenaikan Isa Al Masih', is_cuti_bersama: false },
  { date: '2026-05-27', name: 'Hari Raya Waisak', is_cuti_bersama: false },
  { date: '2026-05-28', name: 'Kenaikan Isa Al Masih (Cuti Bersama)', is_cuti_bersama: true },
  { date: '2026-05-29', name: 'Cuti Bersama Waisak', is_cuti_bersama: true },
  { date: '2026-09-24', name: 'Maulid Nabi Muhammad SAW', is_cuti_bersama: false },
];

export function fallbackIndonesianHolidays(year) {
  const fixedRows = FIXED_HOLIDAYS.map((item) => ({
    date: `${year}-${item.monthDay}`,
    name: item.name,
    is_national_holiday: true,
    is_cuti_bersama: item.is_cuti_bersama,
    source: 'fallback',
  }));

  const specialRows =
    Number(year) === 2026
      ? SPECIAL_2026.map((item) => ({
          date: item.date,
          name: item.name,
          is_national_holiday: true,
          is_cuti_bersama: item.is_cuti_bersama,
          source: 'fallback',
        }))
      : [];

  const map = new Map();
  [...fixedRows, ...specialRows].forEach((item) => {
    map.set(item.date, item);
  });

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
