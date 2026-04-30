'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ChevronDown, RefreshCcw, Wrench } from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';
import { requestJson } from '@/lib/request-json';
import { useToast } from '@/components/ui/toast-provider';
import { cn } from '@/lib/utils';

function renderValue(value) {
  if (value == null || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function toReadableDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('id-ID');
}

export default function DashboardOpsPanel() {
  const { warning } = useToast();
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const T = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson('/api/ops/recovery');
      setPayload(result);
    } catch (error) {
      const message = String(error?.message || '');
      const isRecoveryNotConfigured =
        message.includes('status 500') || message.toLowerCase().includes('cannot find the file');

      if (isRecoveryNotConfigured) {
        setPayload({
          task: {
            name: T('dashboardOps.notConfigured'),
            state: T('dashboardOps.notConfigured'),
            last_task_result_label: T('dashboardOps.notConfigured'),
          },
          health_summary: null,
        });
      } else {
        warning(error.message || T('dashboardOps.errors.loadFailed'), T('dashboardOps.errors.loadFailedTitle'));
      }
    } finally {
      setLoading(false);
    }
  }, [T, warning]);

  const task = payload?.task || null;
  const healthSummary = payload?.health_summary || null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer flex-wrap items-center gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div className="inline-flex rounded-lg bg-teal-500/10 p-2">
          <Wrench className="h-4 w-4 text-teal-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-white">Operations Control</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {open ? T('dashboardOps.hints.expanded') : T('dashboardOps.hints.collapsed')}
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {open ? T('dashboardOps.actions.collapse') : T('dashboardOps.actions.expand')}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <div className="flex items-center gap-2 border-t border-slate-800 px-5 py-3">
            <button
              type="button"
              onClick={loadStatus}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-60"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              {T('dashboardOps.actions.checkRecoveryStatus')}
            </button>
            <Link
              href="/machine"
              className="inline-flex items-center rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-300 transition-colors hover:border-teal-400 hover:text-white"
            >
              {T('dashboardOps.actions.openMachinePage')}
            </Link>
          </div>

          <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {T('dashboardOps.labels.taskStatus')}
              </div>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-800" />
                  <div className="h-4 w-56 animate-pulse rounded bg-slate-800/80" />
                  <div className="h-4 w-48 animate-pulse rounded bg-slate-800/70" />
                </div>
              ) : (
                <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Task</dt>
                    <dd className="mt-1 font-mono text-xs text-white">{task?.name || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">State</dt>
                    <dd className="mt-1">{task?.state || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Last Run</dt>
                    <dd className="mt-1">{toReadableDate(task?.last_run_time)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Next Run</dt>
                    <dd className="mt-1">{toReadableDate(task?.next_run_time)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Last Result</dt>
                    <dd className="mt-1">
                      {task?.last_task_result_label || '-'}
                      {task?.last_task_result != null ? ` (${task.last_task_result})` : ''}
                    </dd>
                  </div>
                </dl>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {T('dashboardOps.labels.healthSummary')}
              </div>
              {!healthSummary ? (
                <p className="text-sm text-slate-500">{T('dashboardOps.healthSummary.empty')}</p>
              ) : (
                <dl className="grid gap-2 text-sm text-slate-300">
                  {Object.entries(healthSummary).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">{key}</dt>
                      <dd className="mt-1 break-words font-mono text-xs text-white">
                        {renderValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
