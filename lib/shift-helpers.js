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

function hexToRgb(hexValue) {
  const hex = String(hexValue || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function shiftBadgeInlineStyle(shift) {
  const rgb = hexToRgb(shift?.color_hex);
  if (!rgb) return null;
  return {
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
    color: `rgb(${Math.min(255, rgb.r + 28)}, ${Math.min(255, rgb.g + 28)}, ${Math.min(255, rgb.b + 28)})`,
  };
}
