'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel,
  className,
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder || 'Search'}
        className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:outline-none"
      />
    </div>
  );
}
