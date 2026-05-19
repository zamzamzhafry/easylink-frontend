'use client';

import { useCallback, useState } from 'react';

const PHP_SYNC_API = '/api/machine/sync';

export function useMachineSync() {
  const [syncState, setSyncState] = useState({
    busy: '',
    lastResult: null,
    dbStats: null,
  });

  const callSync = useCallback(async (action, { machine, body, query } = {}) => {
    setSyncState((prev) => ({ ...prev, busy: action, lastResult: null }));
    try {
      const params = new URLSearchParams();
      params.set('action', action);
      if (machine) params.set('machine', String(machine));
      if (query) {
        const extra = new URLSearchParams(query);
        for (const [k, v] of extra) params.set(k, v);
      }

      const postActions = ['sync_users', 'sync_scanlogs', 'dev_settime', 'dev_init', 'dev_deladmin', 'user_delall', 'scanlog_del', 'log_del', 'machine_save', 'machine_delete'];
      const isPost = Boolean(body) || postActions.includes(action);

      const opts = { method: isPost ? 'POST' : 'GET' };
      if (isPost) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify({ action, machine, ...body });
      }

      const res = await fetch(`${PHP_SYNC_API}?${params.toString()}`, opts);
      const data = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }));

      setSyncState((prev) => ({ ...prev, busy: '', lastResult: { action, ...data } }));
      return data;
    } catch (err) {
      const errResult = { ok: false, error: err.message };
      setSyncState((prev) => ({ ...prev, busy: '', lastResult: { action, ...errResult } }));
      return errResult;
    }
  }, []);

  const refreshDbStats = useCallback(async (machine) => {
    const data = await callSync('db_stats', { machine });
    if (data.ok) setSyncState((prev) => ({ ...prev, dbStats: data }));
    return data;
  }, [callSync]);

  const syncUsers = useCallback((machine) => callSync('sync_users', { machine, body: {} }), [callSync]);
  const syncScanlogs = useCallback((machine, full) => callSync('sync_scanlogs', { machine, body: { full } }), [callSync]);
  const getDevInfo = useCallback((machine) => callSync('dev_info', { machine }), [callSync]);
  const syncTime = useCallback((machine) => callSync('dev_settime', { machine, body: {} }), [callSync]);
  const getMachines = useCallback(() => callSync('machines_list'), [callSync]);

  return {
    ...syncState,
    callSync,
    refreshDbStats,
    syncUsers,
    syncScanlogs,
    getDevInfo,
    syncTime,
    getMachines,
  };
}
