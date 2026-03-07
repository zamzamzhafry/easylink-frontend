export const SHIFT_ICON_OPTIONS = [
  { key: 'sun', label: 'Sun / Morning' },
  { key: 'sunset', label: 'Sunset / Afternoon' },
  { key: 'moon', label: 'Moon / Night' },
  { key: 'briefcase', label: 'Briefcase / General' },
  { key: 'bed', label: 'Bed / Off' },
  { key: 'plane', label: 'Plane / Leave' },
  { key: 'star', label: 'Star / Premium' },
  { key: 'shield', label: 'Shield / Security' },
];

export function inferShiftIconKey(shiftName) {
  const key = String(shiftName || '').toLowerCase();
  if (key.includes('pagi')) return 'sun';
  if (key.includes('siang')) return 'sunset';
  if (key.includes('malam')) return 'moon';
  if (key.includes('libur')) return 'bed';
  if (key.includes('cuti')) return 'plane';
  return 'briefcase';
}

