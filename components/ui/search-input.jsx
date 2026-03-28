'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SearchInput({ value, onChange, placeholder = 'Search...', className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
      />
    </div>
  );
}
