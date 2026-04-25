'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, ShieldCheck, Wrench } from 'lucide-react';
import { requestJson } from '@/lib/request-json';
import { useToast } from '@/components/ui/toast-provider';

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
  const { warning, success } = useToast();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson('/api/ops/recovery');
      setPayload(result);
    } catch (error) {
      warning(error.message || 'Failed to load operations status.', 'Ops status failed');
    } finally {
      setLoading(false);
    }
  }, [warning]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const triggerRecovery = async () => {
    setTriggering(true);
    try {
      const result = await requestJson('/api/ops/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setPayload(result);
      if (result.started) {
        success(result.message || 'Recovery task triggered.', 'Recovery task');
      } else {
        warning(result.message || 'Recovery task is already running.', 'Recovery task');
      }
    } catch (error) {
      warning(error.message || 'Unable to trigger recovery task.', 'Recovery task failed');
    } finally {
      setTriggering(false);
    }
  };

  const task = payload?.task || null;
  const healthSummary = payload?.health_summary || null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-5 py-4">
        <div className="inline-flex rounded-lg bg-teal-500/10 p-2">
          <Wrench className="h-4 w-4 text-teal-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Operations Control</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Admin-only trigger for the fixed Windows recovery task.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading || triggering}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-60"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={triggerRecovery}
            disabled={loading || triggering}
            className="inline-flex items-center gap-2 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-300 transition-colors hover:border-teal-400 hover:text-white disabled:opacity-60"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {triggering ? 'Running...' : 'Run Recovery Task'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Task Status
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
            Health Summary
          </div>
          {!healthSummary ? (
            <p className="text-sm text-slate-500">
              No external health summary file is configured or readable yet.
            </p>
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
    </section>
  );
}
