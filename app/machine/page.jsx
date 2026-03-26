'use client';

import { useState } from 'react';
import { Clock3, DatabaseZap, Info, RefreshCw, Users } from 'lucide-react';

export default function MachinePage() {
  const [source, setSource] = useState('auto');
  const [busy, setBusy] = useState('');
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [deviceTime, setDeviceTime] = useState(null);
  const [userSyncResult, setUserSyncResult] = useState(null);
  const [scanSyncResult, setScanSyncResult] = useState(null);
  const [error, setError] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy('');
    }
  };

  const formatInlineValue = (value) => {
    if (value == null || value === '') return '-';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  };

  const loadDeviceInfo = () =>
    run('info', async () => {
      const res = await fetch(`/api/machine?action=info&source=${source}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to load device info');
      setDeviceInfo(data.raw ?? data.info ?? null);
    });

  const loadDeviceTime = () =>
    run('time', async () => {
      const res = await fetch(`/api/machine?action=time&source=${source}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to load device time');
      setDeviceTime(data.time ?? data.raw?.DEVINFO?.Jam ?? data.raw ?? '-');
    });

  const syncDeviceTime = () =>
    run('sync-time', async () => {
      const res = await fetch('/api/machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_time', source }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to sync time');
      setDeviceTime(data.synced_at ?? data.time ?? data.raw ?? '-');
    });

  const pullUsers = () =>
    run('users', async () => {
      const res = await fetch('/api/machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull_users', source }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to pull users');
      setUserSyncResult(data);
    });

  const pullScanlogs = () =>
    run('scanlog', async () => {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      ).padStart(2, '0')}`;

      const res = await fetch('/api/scanlog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, mode: 'new', from, to }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to pull scanlogs');
      setScanSyncResult(data);
    });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h1 className="text-xl font-bold text-white">Machine Connect</h1>
        <p className="mt-1 text-xs text-slate-500">
          Connect to EasyLink machine, fetch users, sync time, and ingest scanlogs into safe table.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <label htmlFor="machine-source" className="mb-2 block text-xs text-slate-400">
          SDK Adapter
        </label>
        <select
          id="machine-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
        >
          <option value="auto">Auto (prefer Windows SDK)</option>
          <option value="windows-sdk">Windows SDK (REST API)</option>
          <option value="fingerspot-easylink-ts">fingerspot-easylink-ts</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={loadDeviceInfo}
          disabled={Boolean(busy)}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-teal-500 disabled:opacity-50"
        >
          <Info className="h-4 w-4" /> {busy === 'info' ? 'Loading...' : 'Get Device Info'}
        </button>
        <button
          type="button"
          onClick={loadDeviceTime}
          disabled={Boolean(busy)}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-cyan-500 disabled:opacity-50"
        >
          <Clock3 className="h-4 w-4" /> {busy === 'time' ? 'Loading...' : 'Get Device Time'}
        </button>
        <button
          type="button"
          onClick={syncDeviceTime}
          disabled={Boolean(busy)}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-amber-500 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> {busy === 'sync-time' ? 'Syncing...' : 'Sync Date/Time'}
        </button>
        <button
          type="button"
          onClick={pullUsers}
          disabled={Boolean(busy)}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-emerald-500 disabled:opacity-50"
        >
          <Users className="h-4 w-4" /> {busy === 'users' ? 'Syncing...' : 'Pull Users'}
        </button>
      </div>

      <button
        type="button"
        onClick={pullScanlogs}
        disabled={Boolean(busy)}
        className="flex items-center justify-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm font-semibold text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
      >
        <DatabaseZap className="h-4 w-4" />{' '}
        {busy === 'scanlog' ? 'Syncing scanlog...' : 'Pull Scanlog to Safe Table'}
      </button>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">Device Info</h2>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
            {deviceInfo ? JSON.stringify(deviceInfo, null, 2) : 'No device info loaded yet.'}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Device time: {formatInlineValue(deviceTime)}
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-white">User Pull Result</h2>
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
              {userSyncResult ? JSON.stringify(userSyncResult, null, 2) : 'No user sync yet.'}
            </pre>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-white">Scanlog Pull Result</h2>
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
              {scanSyncResult ? JSON.stringify(scanSyncResult, null, 2) : 'No scanlog sync yet.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
