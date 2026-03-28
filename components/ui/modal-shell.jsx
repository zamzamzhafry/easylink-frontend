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
      <button
        type="button"
        className="modal-shell-overlay absolute inset-0"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        className={cn(
          'modal-shell-panel relative w-full rounded-2xl border p-6 shadow-2xl',
          maxWidth,
          contentClassName
        )}
      >
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            className="modal-shell-close absolute right-4 top-4 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {title && <h2 className="modal-shell-title text-lg font-bold">{title}</h2>}
        {subtitle && <p className="modal-shell-subtitle mb-5 mt-1 text-xs">{subtitle}</p>}

        {children}
      </div>
    </div>
  );
}
