'use client';

import {
  BedDouble,
  Briefcase,
  MoonStar,
  Plane,
  Shield,
  Star,
  Sun,
  Sunset,
} from 'lucide-react';
import { inferShiftIconKey } from '@/lib/shift-icon-options';

const ICON_MAP = {
  sun: Sun,
  sunset: Sunset,
  moon: MoonStar,
  briefcase: Briefcase,
  bed: BedDouble,
  plane: Plane,
  star: Star,
  shield: Shield,
};

export function getShiftIcon(shift) {
  const iconKey = String(shift?.icon_key || inferShiftIconKey(shift?.nama_shift || '')).toLowerCase();
  return ICON_MAP[iconKey] || Briefcase;
}

