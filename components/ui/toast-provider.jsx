'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);
let toastId = 0;

const STYLE_MAP = {
  info: {
    icon: Info,
    iconClass: 'text-sky-300',
    borderClass: 'border-sky-500/40',
    bgClass: 'bg-sky-500/10',
    title: 'Info',
  },
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-500/10',
    title: 'Success',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-300',
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-500/10',
    title: 'Warning',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-rose-300',
    borderClass: 'border-rose-500/40',
    bgClass: 'bg-rose-500/10',
    title: 'Error',
  },
};

function ToastViewport({ toasts, dismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const style = STYLE_MAP[toast.type] ?? STYLE_MAP.info;
        const Icon = style.icon;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border p-3 shadow-2xl ${style.borderClass} ${style.bgClass}`}
          >
            <div className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{toast.title || style.title}</p>
                <p className="mt-0.5 text-xs text-slate-200/90">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ type = 'info', title, message, duration = 4000 }) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, type, title, message }]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      show,
      dismiss,
      info: (message, title) => show({ type: 'info', title, message }),
      success: (message, title) => show({ type: 'success', title, message }),
      warning: (message, title) => show({ type: 'warning', title, message }),
      error: (message, title) => show({ type: 'error', title, message }),
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
