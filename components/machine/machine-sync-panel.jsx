'use client';

import { useEffect } from 'react';
import { DatabaseZap, RefreshCw, Users, Clock3 } from 'lucide-react';
import { useMachineSync } from '@/lib/hooks/use-machine-sync';

export default function MachineSyncPanel({ machineId }) {
  const {
    busy,
    lastResult,
    dbStats,
    refreshDbStats,
    syncUsers,
    syncScanlogs,
    getDevInfo,
    syncTime,
  } = useMachineSync();

  useEffect(() => {
    refreshDbStats(machineId);
  }, [machineId, refreshDbStats]);

  const isbusy = Boolean(busy);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <DatabaseZap className="h-4 w-4 text-emerald-400" />
        PHP Bridge Sync
      </h3>

      <div className="mb-3 flex flex-wrap gap-4 text-center">
        <div>
          <div className="text-lg font-bold text-sky-400">{dbStats?.users ?? '-'}</div>
          <div className="text-[10px] uppercase text-slate-500">DB Users</div>
        </div>
        <div>
          <div className="text-lg font-bold text-sky-400">{dbStats?.scanlogs ?? '-'}</div>
          <div className="text-[10px] uppercase text-slate-500">DB Scanlogs</div>
        </div>
        <div>
          <div className="text-xs text-slate-400 mt-1">{dbStats?.latest_scan || '-'}</div>
          <div className="text-[10px] uppercase text-slate-500">Latest Scan</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => getDevInfo(machineId)}
          disabled={isbusy}
          className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 disabled:opacity-50"
        >
          {busy === 'dev_info' ? <Spinner /> : <RefreshCw className="mr-1 inline h-3 w-3" />}
          Device Info
        </button>
        <button
          type="button"
          onClick={() => syncTime(machineId)}
          disabled={isbusy}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-50"
        >
          {busy === 'dev_settime' ? <Spinner /> : <Clock3 className="mr-1 inline h-3 w-3" />}
          Sync Time
        </button>
        <button
          type="button"
          onClick={() => syncUsers(machineId)}
          disabled={isbusy}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-50"
        >
          {busy === 'sync_users' ? <Spinner /> : <Users className="mr-1 inline h-3 w-3" />}
          Sync Users
        </button>
        <button
          type="button"
          onClick={() => syncScanlogs(machineId, false)}
          disabled={isbusy}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 disabled:opacity-50"
        >
          {busy === 'sync_scanlogs' ? <Spinner /> : <DatabaseZap className="mr-1 inline h-3 w-3" />}
          Sync New Scanlogs
        </button>
        <button
          type="button"
          onClick={() => syncScanlogs(machineId, true)}
          disabled={isbusy}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 disabled:opacity-50"
        >
          {busy === 'sync_scanlogs' ? <Spinner /> : <DatabaseZap className="mr-1 inline h-3 w-3" />}
          Sync ALL Scanlogs
        </button>
        <button
          type="button"
          onClick={() => refreshDbStats(machineId)}
          disabled={isbusy}
          className="rounded-lg border border-slate-500/40 bg-slate-500/10 px-3 py-1.5 text-xs font-semibold text-slate-300 disabled:opacity-50"
        >
          Refresh Stats
        </button>
      </div>

      {lastResult && (
        <div className={`mt-3 rounded-lg border p-3 text-xs ${lastResult.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-rose-500/30 bg-rose-500/5 text-rose-200'}`}>
          <div className="font-semibold mb-1">
            {lastResult.ok ? 'Success' : 'Error'} - {lastResult.action}
          </div>
          {lastResult.synced != null && <div>Rows synced: <strong>{lastResult.synced}</strong></div>}
          {lastResult.data?.DEVINFO && (
            <div className="mt-1">
              <span>Users: {lastResult.data.DEVINFO.User}</span>
              <span className="ml-3">New Scans: {lastResult.data.DEVINFO['New Presensi']}</span>
              <span className="ml-3">Time: {lastResult.data.DEVINFO.Jam}</span>
            </div>
          )}
          {lastResult.error && <div className="mt-1 text-rose-300">{lastResult.error}</div>}
          {lastResult.errors?.length > 0 && <div className="mt-1 text-rose-300">{lastResult.errors.join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
