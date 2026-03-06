export const SHIFT_CLASS_MAP = {
  Pagi: 'badge-pagi',
  Siang: 'badge-siang',
  Malam: 'badge-malam',
  Middle: 'badge-middle',
  Libur: 'badge-libur',
  Cuti: 'badge-cuti',
  'Non-shift': 'badge-nonshift',
};

export function shiftClassName(shiftName) {
  return SHIFT_CLASS_MAP[shiftName] ?? SHIFT_CLASS_MAP['Non-shift'];
}
