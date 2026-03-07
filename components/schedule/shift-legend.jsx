'use client';

import { Clock } from 'lucide-react';
import { getShiftIcon } from '@/components/schedule/shift-icon';
import { shiftBadgeInlineStyle, shiftClassName } from '@/lib/shift-helpers';

export default function ShiftLegend({ shifts }) {
  return (
    <div className="flex flex-wrap gap-2">
      {shifts.map((shift) => {
        const Icon = getShiftIcon(shift);
        return (
          <span
            key={shift.id}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${shiftClassName(
              shift.nama_shift
            )}`}
            style={shiftBadgeInlineStyle(shift) || undefined}
          >
            <Icon className="h-3 w-3 opacity-80" />
            {shift.nama_shift}
            {shift.jam_masuk && (
              <span className="inline-flex items-center gap-1 opacity-70">
                <Clock className="h-3 w-3" />
                {shift.jam_masuk.slice(0, 5)}-{shift.jam_keluar.slice(0, 5)}
                {shift.next_day ? '+1' : ''}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
