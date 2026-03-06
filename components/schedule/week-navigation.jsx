'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function WeekNavigation({ weekDates, onPrevious, onNext }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 px-5 py-3">
      <button
        type="button"
        onClick={onPrevious}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex-1 text-center">
        <span className="font-semibold text-white">
          {weekDates[0].toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })} -{' '}
          {weekDates[6].toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
