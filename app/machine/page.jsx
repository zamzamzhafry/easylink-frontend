'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  DatabaseZap,
  Info,
  RefreshCw,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import ModalShell from '@/components/ui/modal-shell';
import ScanlogQueueSidebar from '@/components/queue/scanlog-queue-sidebar';

async function parseApiResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function isTerminalStatus(status) {
  return ['success', 'failed', 'cancelled', 'rejected', 'not_supported'].includes(
    String(status || '').toLowerCase()
  );
}

function formatJson(value) {
  if (value == null || value === '') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function currentMonthRange() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const from = `${now.getFullYear()}-${month}-01`;
  const to = `${now.getFullYear()}-${month}-${String(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  ).padStart(2, '0')}`;
  return { from, to };
}

function actionLabel(action) {
  const map = {
    info: 'Get Device Info',
    time: 'Get Device Time',
    sync_time: 'Sync Device Time',
    pull_users: 'Pull Users',
    initialize_machine: 'Initialize Machine',
    cancel_job: 'Cancel Job',
  };
  return map[String(action || '').toLowerCase()] || String(action || 'Unknown');
}

export default function MachinePage() {
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');

  const [deviceInfo, setDeviceInfo] = useState(null);
  const [deviceTime, setDeviceTime] = useState(null);
  const [userSyncResult, setUserSyncResult] = useState(null);
  const [scanSyncResult, setScanSyncResult] = useState(null);
  const [initResult, setInitResult] = useState(null);

  const [machineRows, setMachineRows] = useState([]);
  const [machineQueueMeta, setMachineQueueMeta] = useState({
    concurrency: 1,
    active: 0,
    pending: 0,
  });
  const [machineQueueError, setMachineQueueError] = useState('');
  const [expandedMachineRows, setExpandedMachineRows] = useState({});
  const [activeMachineJobId, setActiveMachineJobId] = useState(null);
  const [initConfirmationPhrase, setInitConfirmationPhrase] = useState('INITIALIZE MACHINE');

  const [scanlogMode, setScanlogMode] = useState('new');
  const [scanlogMaxPages, setScanlogMaxPages] = useState(200);
  const [activeBatchId, setActiveBatchId] = useState(null);
  const [scanlogRows, setScanlogRows] = useState([]);
  const [scanlogQueueMeta, setScanlogQueueMeta] = useState({
    concurrency: 1,
    active: 0,
    pending: 0,
  });
  const [scanlogQueueError, setScanlogQueueError] = useState('');
  const [expandedScanlogRows, setExpandedScanlogRows] = useState({});

  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');

  const updateMachineRow = useCallback((row) => {
    if (!row) return;
    setMachineRows((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      map.set(row.id, row);
      return [...map.values()].sort((a, b) => Number(b.id) - Number(a.id));
    });
  }, []);

  const applyMachineResult = useCallback((row) => {
    if (!row || !isTerminalStatus(row.status) || row.status !== 'success') return;

    const result = row.result || {};
    const action = String(row.action || '').toLowerCase();

    if (action === 'info') {
      setDeviceInfo(result.info ?? result.raw ?? result);
      return;
    }

    if (action === 'time' || action === 'sync_time') {
      setDeviceTime(result.time ?? result.synced_at ?? result.raw ?? result);
      return;
    }

    if (action === 'pull_users') {
      setUserSyncResult(result);
      return;
    }

    if (action === 'initialize_machine') {
      setInitResult(result);
    }
  }, []);

  const refreshMachineQueue = useCallback(
    async (jobId) => {
      try {
        setMachineQueueError('');
        const url = jobId ? `/api/machine?job_id=${jobId}` : '/api/machine';
        const res = await fetch(url);
        const data = await parseApiResponse(res);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || data?.raw || `Machine queue failed (${res.status})`);
        }

        if (data?.queue) {
          setMachineQueueMeta({
            concurrency: Number(data.queue.concurrency || 1),
            active: Number(data.queue.active || 0),
            pending: Number(data.queue.pending || 0),
          });
        }

        if (data?.init_confirmation_phrase) {
          setInitConfirmationPhrase(String(data.init_confirmation_phrase));
        }

        if (jobId) {
          const row = data?.row;
          if (!row) return null;
          updateMachineRow(row);
          applyMachineResult(row);
          return row;
        }

        const rows = Array.isArray(data?.rows) ? data.rows : [];
        setMachineRows(rows);
        return null;
      } catch (err) {
        setMachineQueueError(err?.message || 'Failed to refresh machine queue');
        return null;
      }
    },
    [applyMachineResult, updateMachineRow]
  );

  const refreshScanlogQueue = useCallback(async (batchId) => {
    try {
      setScanlogQueueError('');
      const url = batchId ? `/api/scanlog/sync?batch_id=${batchId}` : '/api/scanlog/sync';
      const res = await fetch(url);
      const data = await parseApiResponse(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.raw || `Scanlog queue failed (${res.status})`);
      }

      if (data?.queue) {
        setScanlogQueueMeta({
          concurrency: Number(data.queue.concurrency || 1),
          active: Number(data.queue.active || 0),
          pending: Number(data.queue.pending || 0),
        });
      }

      if (batchId) {
        const row = data?.row;
        if (!row) return null;
        setScanlogRows((prev) => {
          const map = new Map(prev.map((item) => [item.id, item]));
          map.set(row.id, row);
          return [...map.values()].sort((a, b) => Number(b.id) - Number(a.id));
        });
        return row;
      }

      setScanlogRows(Array.isArray(data?.rows) ? data.rows : []);
      return null;
    } catch (err) {
      setScanlogQueueError(err?.message || 'Failed to refresh scanlog queue');
      return null;
    }
  }, []);

  const submitMachineAction = useCallback(
    async (action, payload = {}) => {
      setError('');
      setActionBusy(action);
      try {
        const res = await fetch('/api/machine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, async: true, ...payload }),
        });
        const data = await parseApiResponse(res);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || data?.raw || `Machine action failed (${res.status})`);
        }

        if (data?.queue) {
          setMachineQueueMeta({
            concurrency: Number(data.queue.concurrency || 1),
            active: Number(data.queue.active || 0),
            pending: Number(data.queue.pending || 0),
          });
        }

        if (data?.init_confirmation_phrase) {
          setInitConfirmationPhrase(String(data.init_confirmation_phrase));
        }

        if (data?.row) {
          updateMachineRow(data.row);
          if (isTerminalStatus(data.row.status)) {
            applyMachineResult(data.row);
          } else {
            setActiveMachineJobId(Number(data.row.id));
          }
        }

        await refreshMachineQueue();
        return data;
      } finally {
        setActionBusy('');
      }
    },
    [applyMachineResult, refreshMachineQueue, updateMachineRow]
  );

  const queueScanlogPull = useCallback(
    async (mode) => {
      setError('');
      setActionBusy(`scanlog_${mode}`);
      try {
        const { from, to } = currentMonthRange();
        const maxPages = Math.max(1, Math.min(100000, Number(scanlogMaxPages) || 200));

        const res = await fetch('/api/scanlog/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'windows-sdk',
            mode,
            from,
            to,
            limit: 1000,
            page: 1,
            max_pages: maxPages,
            async: true,
          }),
        });
        const data = await parseApiResponse(res);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || data?.raw || `Scanlog sync failed (${res.status})`);
        }

        setScanSyncResult(data);
        const batchId = Number(data?.batch_id || 0);
        if (batchId) {
          setActiveBatchId(batchId);
        }
        await refreshScanlogQueue();
      } finally {
        setActionBusy('');
      }
    },
    [refreshScanlogQueue, scanlogMaxPages]
  );

  useEffect(() => {
    void refreshMachineQueue();
    void refreshScanlogQueue();

    const timer = setInterval(() => {
      void refreshMachineQueue();
      void refreshScanlogQueue();
    }, 10000);

    return () => clearInterval(timer);
  }, [refreshMachineQueue, refreshScanlogQueue]);

  useEffect(() => {
    if (!activeMachineJobId) return;

    let cancelled = false;
    const poll = async () => {
      const row = await refreshMachineQueue(activeMachineJobId);
      if (cancelled || !row) return;
      if (isTerminalStatus(row.status)) {
        setActiveMachineJobId(null);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeMachineJobId, refreshMachineQueue]);

  useEffect(() => {
    if (!activeBatchId) return;

    let cancelled = false;
    const poll = async () => {
      const row = await refreshScanlogQueue(activeBatchId);
      if (cancelled || !row) return;
      setScanSyncResult(row);
      if (isTerminalStatus(row.status)) {
        setActiveBatchId(null);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeBatchId, refreshScanlogQueue]);

  const openConfirmModal = useCallback((config) => {
    setConfirmInput('');
    setConfirmModal(config);
  }, []);

  const confirmMachineAction = useCallback(
    (action, overrides = {}) => {
      const base = {
        kind: 'machine',
        action,
        title: actionLabel(action),
        message: 'This action will be submitted to background worker queue.',
        confirmLabel: 'Queue Action',
        danger: false,
        requiresPhrase: false,
        payload: {},
      };

      if (action === 'initialize_machine') {
        base.title = 'Danger: Initialize Machine';
        base.message =
          'Initialization is destructive and can clear users and attendance data from device memory.';
        base.confirmLabel = 'Initialize Device';
        base.danger = true;
        base.requiresPhrase = true;
      }

      if (action === 'cancel_job') {
        base.title = `Cancel Job #${overrides?.payload?.job_id}`;
        base.message = 'Cancellation is best-effort. Running actions may already be in progress.';
        base.confirmLabel = 'Cancel Job';
        base.danger = true;
      }

      openConfirmModal({
        ...base,
        ...overrides,
      });
    },
    [openConfirmModal]
  );

  const confirmScanlogAction = useCallback(
    (mode) => {
      const isAll = mode === 'all';
      openConfirmModal({
        kind: 'scanlog',
        mode,
        title: isAll ? 'Queue Scanlog All (Paging)' : 'Queue Scanlog New',
        message: isAll
          ? 'This can run for a long time and consumes machine paging session.'
          : 'This will fetch only new scanlog events from SDK and queue ingestion.',
        confirmLabel: isAll ? 'Queue Full Pull' : 'Queue New Pull',
        danger: isAll,
        requiresPhrase: false,
      });
    },
    [openConfirmModal]
  );

  const handleConfirmProceed = useCallback(async () => {
    if (!confirmModal) return;

    try {
      if (confirmModal.kind === 'machine') {
        const payload = { ...(confirmModal.payload || {}) };
        if (confirmModal.requiresPhrase) {
          payload.confirmation_text = confirmInput.trim();
        }
        await submitMachineAction(confirmModal.action, payload);
      }

      if (confirmModal.kind === 'scanlog') {
        await queueScanlogPull(confirmModal.mode);
      }

      setConfirmModal(null);
      setConfirmInput('');
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [confirmInput, confirmModal, queueScanlogPull, submitMachineAction]);

  const canProceedConfirm = useMemo(() => {
    if (!confirmModal?.requiresPhrase) return true;
    return confirmInput.trim() === initConfirmationPhrase;
  }, [confirmInput, confirmModal, initConfirmationPhrase]);

  const toggleMachineRowExpand = useCallback((id) => {
    setExpandedMachineRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleScanlogRowExpand = useCallback((id) => {
    setExpandedScanlogRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <>
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4 lg:space-y-0">
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h1 className="text-xl font-bold text-white">Machine Connect</h1>
            <p className="mt-1 text-xs text-slate-500">
              All machine operations are queued asynchronously through API workers. SDK response
              references are validated against{' '}
              <span className="font-semibold text-teal-300">docs/response_testing.md</span> and{' '}
              <span className="font-semibold text-teal-300">
                docs/scanlog-sdk-curl-postman-reference.md
              </span>
              .
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Machine Worker Queue</p>
                <p className="text-xs text-slate-500">
                  Active {machineQueueMeta.active}/{machineQueueMeta.concurrency} · Pending{' '}
                  {machineQueueMeta.pending}
                </p>
              </div>
              <button
                type="button"
                onClick={() => refreshMachineQueue()}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200"
              >
                Refresh Machine Queue
              </button>
            </div>
            {machineQueueError && <p className="text-xs text-amber-400">{machineQueueError}</p>}

            <div className="grid gap-3 pt-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => confirmMachineAction('info')}
                disabled={Boolean(actionBusy)}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-teal-500 disabled:opacity-50"
              >
                <Info className="h-4 w-4" />{' '}
                {actionBusy === 'info' ? 'Queueing...' : 'Get Device Info'}
              </button>

              <button
                type="button"
                onClick={() => confirmMachineAction('time')}
                disabled={Boolean(actionBusy)}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-cyan-500 disabled:opacity-50"
              >
                <Clock3 className="h-4 w-4" />{' '}
                {actionBusy === 'time' ? 'Queueing...' : 'Get Device Time'}
              </button>

              <button
                type="button"
                onClick={() => confirmMachineAction('sync_time')}
                disabled={Boolean(actionBusy)}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-amber-500 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />{' '}
                {actionBusy === 'sync_time' ? 'Queueing...' : 'Sync Date/Time'}
              </button>

              <button
                type="button"
                onClick={() => confirmMachineAction('pull_users')}
                disabled={Boolean(actionBusy)}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:border-emerald-500 disabled:opacity-50"
              >
                <Users className="h-4 w-4" />{' '}
                {actionBusy === 'pull_users' ? 'Queueing...' : 'Pull Users (Paging)'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="scanlog-mode" className="block text-xs text-slate-400">
                  Scanlog Mode
                </label>
                <select
                  id="scanlog-mode"
                  value={scanlogMode}
                  onChange={(event) => setScanlogMode(event.target.value)}
                  className="mt-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="new">New Scanlog</option>
                  <option value="all">All Scanlog (Paging)</option>
                </select>
              </div>
              <div>
                <label htmlFor="scanlog-max-pages" className="block text-xs text-slate-400">
                  Max Pages
                </label>
                <input
                  id="scanlog-max-pages"
                  type="number"
                  min={1}
                  max={100000}
                  value={scanlogMaxPages}
                  onChange={(event) => setScanlogMaxPages(Number(event.target.value) || 1)}
                  className="mt-1 w-24 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => confirmScanlogAction(scanlogMode)}
                disabled={Boolean(actionBusy)}
                className="flex items-center justify-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm font-semibold text-teal-300 hover:bg-teal-500/20 disabled:opacity-50"
              >
                <DatabaseZap className="h-4 w-4" />{' '}
                {actionBusy === `scanlog_${scanlogMode}`
                  ? 'Queueing scanlog...'
                  : scanlogMode === 'all'
                    ? 'Queue Full Scanlog Pull'
                    : 'Queue New Scanlog Pull'}
              </button>
            </div>
            {scanlogMode === 'all' && (
              <p className="mt-3 text-xs text-amber-300">
                Full scanlog paging can run for a long time. Use queue monitor and abort/cancel when
                needed.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-rose-700/40 bg-rose-950/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
                  <ShieldAlert className="h-4 w-4" /> Danger Zone
                </p>
                <p className="mt-1 text-xs text-rose-300/90">
                  Initialize Machine can wipe user + attendance + device operational data. Strong
                  confirmation required.
                </p>
              </div>
              <button
                type="button"
                onClick={() => confirmMachineAction('initialize_machine')}
                disabled={Boolean(actionBusy)}
                className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
              >
                {actionBusy === 'initialize_machine' ? 'Queueing...' : 'Initialize Machine'}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-rose-300/80">
              Required phrase: <span className="font-semibold">{initConfirmationPhrase}</span>
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-2 text-sm font-semibold text-white">Device Info Result</h2>
              <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                {deviceInfo ? formatJson(deviceInfo) : 'No device info result yet.'}
              </pre>
              <p className="mt-2 text-xs text-slate-500">
                Device time: {String(deviceTime || '-')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-2 text-sm font-semibold text-white">Users Pull Result</h2>
                <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                  {userSyncResult ? formatJson(userSyncResult) : 'No user pull result yet.'}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-2 text-sm font-semibold text-white">Initialize Result</h2>
                <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                  {initResult ? formatJson(initResult) : 'No initialize action executed yet.'}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-2 text-sm font-semibold text-white">Scanlog Queue Result</h2>
                <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                  {scanSyncResult ? formatJson(scanSyncResult) : 'No scanlog sync queued yet.'}
                </pre>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Recent Machine Jobs</h2>
            <div className="space-y-2">
              {machineRows.length === 0 && (
                <p className="text-xs text-slate-500">No machine jobs yet.</p>
              )}

              {machineRows.map((row) => {
                const status = String(row.status || '').toLowerCase();
                const statusClass =
                  {
                    success: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
                    running: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
                    queued: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
                    failed: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
                    cancelled: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
                    cancel_requested: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
                  }[status] || 'text-slate-300 bg-slate-700/30 border-slate-700/40';

                const isExpanded = Boolean(expandedMachineRows[row.id]);
                const cancellable = ['queued', 'running', 'cancel_requested'].includes(status);

                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMachineRowExpand(row.id)}
                        className="text-left"
                      >
                        <p className="text-sm font-semibold text-slate-200">
                          Job #{row.id} · {actionLabel(row.action)}
                        </p>
                        <p className="text-[11px] text-slate-500">Created {row.created_at}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] ${statusClass}`}
                        >
                          {status || 'unknown'}
                        </span>
                        {cancellable && (
                          <button
                            type="button"
                            onClick={() =>
                              confirmMachineAction('cancel_job', { payload: { job_id: row.id } })
                            }
                            className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-200"
                          >
                            <XCircle className="mr-1 inline-block h-3 w-3" /> Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-slate-950 p-2 text-xs text-slate-300">
                        {formatJson(row)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <ScanlogQueueSidebar
          className="mt-6 lg:mt-0"
          title="Scanlog Queue"
          queueMeta={scanlogQueueMeta}
          queueRows={scanlogRows}
          queueError={scanlogQueueError}
          expandedRows={expandedScanlogRows}
          onToggleRow={toggleScanlogRowExpand}
          onRefresh={() => refreshScanlogQueue()}
          activeBatchId={activeBatchId}
        />
      </div>

      {confirmModal && (
        <ModalShell
          title={confirmModal.title}
          subtitle={confirmModal.message}
          onClose={() => {
            setConfirmModal(null);
            setConfirmInput('');
          }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                confirmModal.danger
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Confirmation required before submitting worker action.
              </p>
            </div>

            {confirmModal.requiresPhrase && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Type exact phrase to continue:
                  <span className="ml-1 font-semibold text-rose-300">{initConfirmationPhrase}</span>
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="Type confirmation phrase"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmInput('');
                }}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmProceed}
                disabled={!canProceedConfirm || Boolean(actionBusy)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  confirmModal.danger
                    ? 'bg-rose-600 text-white disabled:bg-rose-900/50'
                    : 'bg-teal-600 text-white disabled:bg-teal-900/50'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
