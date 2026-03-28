import { AlertCircle, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANT_STYLES = {
  error: {
    wrapper:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    button:
      'border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-400/40 dark:text-rose-100 dark:hover:bg-rose-500/20',
    icon: AlertCircle,
  },
  warning: {
    wrapper:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    button:
      'border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-100 dark:hover:bg-amber-500/20',
    icon: AlertTriangle,
  },
  success: {
    wrapper:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    button:
      'border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/40 dark:text-emerald-100 dark:hover:bg-emerald-500/20',
    icon: CheckCircle2,
  },
};

export default function InlineStatusPanel({
  message,
  variant = 'error',
  actionLabel = 'Retry',
  onAction,
  className,
}) {
  if (!message) return null;

  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.error;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm',
        style.wrapper,
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="break-words whitespace-pre-wrap" title={message}>
          {message}
        </span>
      </div>

      {typeof onAction === 'function' && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-xs font-semibold transition-colors',
            style.button
          )}
        >
          <RefreshCw className="h-3 w-3" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
