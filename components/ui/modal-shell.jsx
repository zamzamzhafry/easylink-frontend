'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 'max-w-md',
  contentClassName,
  hideClose = false,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl',
          maxWidth,
          contentClassName
        )}
      >
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-slate-500 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {title && <h2 className="text-lg font-bold text-white">{title}</h2>}
        {subtitle && <p className="mb-5 mt-1 text-xs text-slate-500">{subtitle}</p>}

        {children}
      </div>
    </div>
  );
}
