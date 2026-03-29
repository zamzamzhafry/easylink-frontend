'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  DatabaseZap,
  Info,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { useAppLocale } from '@/components/app-shell';
import ModalShell from '@/components/ui/modal-shell';
import InlineStatusPanel from '@/components/ui/inline-status-panel';
import { getUIText } from '@/lib/localization/ui-texts';
import { requestJson } from '@/lib/request-json';

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

const TASK12_ALIASES = ['devinfo', 'scanlog_new', 'users_partial'];

function actionLabel(action, locale = 'en') {
  const map = {
    info: getUIText('machinePage.actions.info', locale),
    time: getUIText('machinePage.actions.time', locale),
    sync_time: getUIText('machinePage.actions.syncTime', locale),
    pull_users: getUIText('machinePage.actions.pullUsers', locale),
    set_user: getUIText('machinePage.actions.addUser', locale),
    initialize_machine: getUIText('machinePage.actions.initializeMachine', locale),
    cancel_job: getUIText('machinePage.actions.cancelJob', locale),
  };
  return (
    map[String(action || '').toLowerCase()] || getUIText('machinePage.actions.unknown', locale)
  );
}

export default function MachinePage() {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const tr = useCallback(
    (path, replacements = {}) => {
      let text = t(path);
      for (const [key, value] of Object.entries(replacements)) {
        text = text.replaceAll(`{{${key}}}`, String(value));
      }
      return text;
    },
    [t]
  );
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  const [deviceInfo, setDeviceInfo] = useState(null);
  const [deviceTime, setDeviceTime] = useState(null);
  const [userSyncResult, setUserSyncResult] = useState(null);
  const [scanSyncResult, setScanSyncResult] = useState(null);
  const [initResult, setInitResult] = useState(null);
  const [addUserPayload, setAddUserPayload] = useState({
    pin: '',
    name: '',
    password: '1234',
    rfid: '',
    privilege: 0,
  });

  const [machineRows, setMachineRows] = useState([]);
  const [machinePage, setMachinePage] = useState(1);
  const [machinePages, setMachinePages] = useState(1);
  const [machineTotal, setMachineTotal] = useState(0);
  const [machineLimit, setMachineLimit] = useState(30);
  const [machineQueueMeta, setMachineQueueMeta] = useState({
    concurrency: 1,
    active: 0,
    pending: 0,
  });
  const [machineQueueError, setMachineQueueError] = useState('');
  const [expandedMachineRows, setExpandedMachineRows] = useState({});
  const [activeMachineJobId, setActiveMachineJobId] = useState(null);
  const [initConfirmationPhrase, setInitConfirmationPhrase] = useState('INITIALIZE MACHINE');
  const [task12Artifacts, setTask12Artifacts] = useState({});
  const [scanlogNewPayload, setScanlogNewPayload] = useState(() => {
    const range = currentMonthRange();
    return { from: range.from, to: range.to, limit: 500 };
  });
  const [usersPartialParams, setUsersPartialParams] = useState({ page: 1, delayMs: 1000 });
  const [usersPartialStatus, setUsersPartialStatus] = useState('');

  const [scanlogMode, setScanlogMode] = useState('new');
  const [scanlogMaxPages, setScanlogMaxPages] = useState(200);
  const [activeBatchId, setActiveBatchId] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [isPageVisible, setIsPageVisible] = useState(true);
  const isAdmin = Boolean(currentUser?.is_admin);

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

    if (action === 'pull_users' || action === 'set_user') {
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
        const url = jobId
          ? `/api/machine?job_id=${jobId}`
          : `/api/machine?page=${machinePage}&limit=${machineLimit}`;
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
        setMachineTotal(Number(data?.total ?? rows.length));
        setMachinePages(Math.max(1, Number(data?.pages ?? 1)));

        const nextPage = Math.max(1, Number(data?.page ?? machinePage));
        if (nextPage !== machinePage) {
          setMachinePage(nextPage);
        }
        return null;
      } catch (err) {
        setMachineQueueError(err?.message || t('machinePage.errors.refreshQueueFailed'));
        return null;
      }
    },
    [applyMachineResult, machineLimit, machinePage, t, updateMachineRow]
  );

  const refreshScanlogQueue = useCallback(async (batchId) => {
    if (!batchId) return null;

    try {
      const res = await fetch(`/api/scanlog/sync?batch_id=${batchId}`);
      const data = await parseApiResponse(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.raw || `Scanlog queue failed (${res.status})`);
      }
      return data?.row || null;
    } catch {
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

        const isTask12Alias = TASK12_ALIASES.includes(action);
        if (isTask12Alias) {
          setTask12Artifacts((prev) => ({
            ...prev,
            [action]: {
              metadata: data?.artifact_metadata ?? null,
              payload,
              result: data?.result ?? null,
              timestamp: new Date().toISOString(),
            },
          }));
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
          const firstState = await refreshScanlogQueue(batchId);
          if (firstState) setScanSyncResult(firstState);
        }
      } finally {
        setActionBusy('');
      }
    },
    [refreshScanlogQueue, scanlogMaxPages]
  );

  const queueTask12ScanlogNew = useCallback(async () => {
    setError('');
    setActionBusy('scanlog_new');
    const { from, to, limit } = scanlogNewPayload;
    try {
      const maxPages = 1;
      const res = await fetch('/api/scanlog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'windows-sdk',
          mode: 'new',
          from,
          to,
          limit: Number(limit) || 1000,
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
        const firstState = await refreshScanlogQueue(batchId);
        if (firstState) setScanSyncResult(firstState);
      }
    } finally {
      setActionBusy('');
    }
  }, [refreshScanlogQueue, scanlogNewPayload]);

  useEffect(() => {
    let mounted = true;
    requestJson('/api/auth/me')
      .then((user) => {
        if (!mounted) return;
        setCurrentUser(user || null);
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUser(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (!isAdmin || !isPageVisible) return;
    void refreshMachineQueue();

    const timer = setInterval(() => {
      void refreshMachineQueue();
    }, 10000);

    return () => clearInterval(timer);
  }, [isAdmin, isPageVisible, refreshMachineQueue]);

  useEffect(() => {
    if (!isAdmin || !isPageVisible || !activeMachineJobId) return;

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
  }, [activeMachineJobId, isAdmin, isPageVisible, refreshMachineQueue]);

  useEffect(() => {
    if (!isAdmin || !isPageVisible || !activeBatchId) return;
    const stream = new EventSource('/api/scanlog/stream?limit=12&interval_ms=4000');

    const onQueue = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        if (!activeBatchId) return;

        const matched = rows.find((row) => Number(row?.id || 0) === Number(activeBatchId));
        if (!matched) return;

        setScanSyncResult(matched);
        if (isTerminalStatus(matched.status)) {
          setActiveBatchId(null);
        }
      } catch {
        // ignore malformed payload
      }
    };

    stream.addEventListener('queue', onQueue);

    return () => {
      stream.removeEventListener('queue', onQueue);
      stream.close();
    };
  }, [activeBatchId, isAdmin, isPageVisible]);

  const openConfirmModal = useCallback((config) => {
    setConfirmInput('');
    setConfirmModal(config);
  }, []);

  const confirmMachineAction = useCallback(
    (action, overrides = {}) => {
      const base = {
        kind: 'machine',
        action,
        title: actionLabel(action, resolvedLocale),
        message: t('machinePage.confirm.defaultMessage'),
        confirmLabel: t('machinePage.confirm.queueAction'),
        danger: false,
        requiresPhrase: false,
        payload: {},
      };

      if (action === 'initialize_machine') {
        base.title = t('machinePage.confirm.initializeTitle');
        base.message = t('machinePage.confirm.initializeMessage');
        base.confirmLabel = t('machinePage.confirm.initializeConfirm');
        base.danger = true;
        base.requiresPhrase = true;
      }

      if (action === 'cancel_job') {
        base.title = tr('machinePage.confirm.cancelJobTitle', {
          jobId: overrides?.payload?.job_id,
        });
        base.message = t('machinePage.confirm.cancelJobMessage');
        base.confirmLabel = t('machinePage.confirm.cancelJobConfirm');
        base.danger = true;
      }

      openConfirmModal({
        ...base,
        ...overrides,
      });
    },
    [openConfirmModal, resolvedLocale, t, tr]
  );

  const confirmScanlogAction = useCallback(
    (mode) => {
      const isAll = mode === 'all';
      openConfirmModal({
        kind: 'scanlog',
        mode,
        title: isAll
          ? t('machinePage.scanlog.queueAllTitle')
          : t('machinePage.scanlog.queueNewTitle'),
        message: isAll
          ? t('machinePage.scanlog.queueAllMessage')
          : t('machinePage.scanlog.queueNewMessage'),
        confirmLabel: isAll
          ? t('machinePage.scanlog.queueFullPull')
          : t('machinePage.scanlog.queueNewPull'),
        danger: isAll,
        requiresPhrase: false,
      });
    },
    [openConfirmModal, t]
  );

  const queueAddUser = useCallback(() => {
    const pin = addUserPayload.pin.trim();
    const name = addUserPayload.name.trim();
    if (!pin || !name) {
      setError(t('machinePage.addUser.requiredFields'));
      return;
    }

    confirmMachineAction('set_user', {
      title: t('machinePage.addUser.queueTitle'),
      message: t('machinePage.addUser.queueMessage'),
      confirmLabel: t('machinePage.addUser.queueConfirm'),
      payload: {
        pin,
        name,
        password: addUserPayload.password || '1234',
        rfid: addUserPayload.rfid.trim(),
        privilege: Number(addUserPayload.privilege || 0),
      },
    });
  }, [addUserPayload, confirmMachineAction, t]);

  const queueUsersPartial = useCallback(async () => {
    setError('');
    const { page, delayMs } = usersPartialParams;
    try {
      const data = await submitMachineAction('users_partial', {
        page,
        limit: 50,
        delay_ms: delayMs,
        max_pages: 1,
      });
      setUsersPartialStatus(tr('machinePage.task12.usersPartialStatus', { page, delayMs }));
      return data;
    } catch (err) {
      setError(err?.message || String(err));
      return null;
    }
  }, [submitMachineAction, tr, usersPartialParams]);

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

  const artifactEntries = useMemo(() => {
    return [
      {
        label: t('machinePage.task12.artifacts.devinfoLabel'),
        alias: 'devinfo',
        data: deviceInfo,
        metadata: task12Artifacts.devinfo?.metadata,
        note: t('machinePage.task12.artifacts.devinfoNote'),
      },
      {
        label: t('machinePage.task12.artifacts.scanlogNewLabel'),
        alias: 'scanlog_new',
        data: scanSyncResult,
        metadata: task12Artifacts.scanlog_new?.metadata,
        note: t('machinePage.task12.artifacts.scanlogNewNote'),
      },
      {
        label: t('machinePage.task12.artifacts.usersPartialLabel'),
        alias: 'users_partial',
        data: userSyncResult,
        metadata: task12Artifacts.users_partial?.metadata,
        note: t('machinePage.task12.artifacts.usersPartialNote'),
      },
      {
        label: t('machinePage.task12.artifacts.usersLabel'),
        alias: 'users',
        data: userSyncResult,
        metadata: task12Artifacts.users || null,
        note: t('machinePage.task12.artifacts.usersNote'),
      },
    ];
  }, [deviceInfo, scanSyncResult, t, task12Artifacts, userSyncResult]);

  const toggleMachineRowExpand = useCallback((id) => {
    setExpandedMachineRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-6">
          <div className="ui-page-shell p-5">
            <h1 className="text-xl font-bold text-foreground">{t('machinePage.header.title')}</h1>
            <p className="ui-readable-muted mt-1">{t('machinePage.header.description')}</p>
          </div>

          {!isAdmin && (
            <InlineStatusPanel message={t('machinePage.queue.restricted')} variant="warning" />
          )}

          <div className="ui-card-shell p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('machinePage.queue.title')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAdmin
                    ? tr('machinePage.queue.summary', {
                        active: machineQueueMeta.active,
                        concurrency: machineQueueMeta.concurrency,
                        pending: machineQueueMeta.pending,
                      })
                    : t('machinePage.queue.hidden')}
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => refreshMachineQueue()}
                  className="ui-btn-secondary !min-h-0 px-3 py-2 text-xs"
                >
                  {t('machinePage.queue.refresh')}
                </button>
              )}
            </div>
            {machineQueueError && <p className="text-xs text-amber-400">{machineQueueError}</p>}

            <div className="grid gap-3 pt-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => confirmMachineAction('info')}
                disabled={Boolean(actionBusy)}
                className="ui-btn-secondary w-full disabled:opacity-50"
              >
                <Info className="h-4 w-4" />{' '}
                {actionBusy === 'info'
                  ? t('machinePage.queue.queueing')
                  : actionLabel('info', resolvedLocale)}
              </button>

              <button
                type="button"
                onClick={() => confirmMachineAction('time')}
                disabled={Boolean(actionBusy)}
                className="ui-btn-secondary w-full disabled:opacity-50"
              >
                <Clock3 className="h-4 w-4" />{' '}
                {actionBusy === 'time'
                  ? t('machinePage.queue.queueing')
                  : actionLabel('time', resolvedLocale)}
              </button>

              <button
                type="button"
                onClick={() => confirmMachineAction('sync_time')}
                disabled={Boolean(actionBusy)}
                className="ui-btn-secondary w-full disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />{' '}
                {actionBusy === 'sync_time'
                  ? t('machinePage.queue.queueing')
                  : actionLabel('sync_time', resolvedLocale)}
              </button>

              <button
                type="button"
                onClick={() => confirmMachineAction('pull_users')}
                disabled={Boolean(actionBusy)}
                className="ui-btn-secondary w-full disabled:opacity-50"
              >
                <Users className="h-4 w-4" />{' '}
                {actionBusy === 'pull_users'
                  ? t('machinePage.queue.queueing')
                  : actionLabel('pull_users', resolvedLocale)}
              </button>
            </div>

            <div className="ui-card-muted mt-4 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-300">
                <UserPlus className="h-4 w-4" /> {t('machinePage.addUser.menuTitle')}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  type="text"
                  placeholder={t('machinePage.addUser.pinPlaceholder')}
                  value={addUserPayload.pin}
                  onChange={(event) =>
                    setAddUserPayload((prev) => ({ ...prev, pin: event.target.value }))
                  }
                  className="ui-control-input"
                />
                <input
                  type="text"
                  placeholder={t('machinePage.addUser.namePlaceholder')}
                  value={addUserPayload.name}
                  onChange={(event) =>
                    setAddUserPayload((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="ui-control-input"
                />
                <input
                  type="text"
                  placeholder={t('machinePage.addUser.passwordPlaceholder')}
                  value={addUserPayload.password}
                  onChange={(event) =>
                    setAddUserPayload((prev) => ({ ...prev, password: event.target.value }))
                  }
                  className="ui-control-input"
                />
                <input
                  type="text"
                  placeholder={t('machinePage.addUser.rfidPlaceholder')}
                  value={addUserPayload.rfid}
                  onChange={(event) =>
                    setAddUserPayload((prev) => ({ ...prev, rfid: event.target.value }))
                  }
                  className="ui-control-input"
                />
                <select
                  value={addUserPayload.privilege}
                  onChange={(event) =>
                    setAddUserPayload((prev) => ({
                      ...prev,
                      privilege: Number(event.target.value) || 0,
                    }))
                  }
                  className="ui-control-select"
                >
                  <option value={0}>{t('machinePage.addUser.privilegeUser')}</option>
                  <option value={1}>{t('machinePage.addUser.privilegeAdmin')}</option>
                </select>
                <button
                  type="button"
                  onClick={queueAddUser}
                  disabled={Boolean(actionBusy)}
                  className="ui-btn-primary disabled:opacity-50"
                >
                  {actionBusy === 'set_user'
                    ? t('machinePage.addUser.queueBusy')
                    : t('machinePage.addUser.queueCta')}
                </button>
              </div>
            </div>
          </div>

          <div className="ui-card-shell p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">
              {t('machinePage.task12.actionsTitle')}
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="ui-card-muted space-y-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
                  {t('machinePage.task12.devinfoTitle')}
                </p>
                <p className="text-sm text-slate-200">{t('machinePage.task12.devinfoBody')}</p>
                <button
                  type="button"
                  onClick={() =>
                    confirmMachineAction('devinfo', {
                      title: t('machinePage.task12.devinfoQueueTitle'),
                      message: t('machinePage.task12.devinfoQueueMessage'),
                      confirmLabel: t('machinePage.task12.devinfoQueueConfirm'),
                      payload: { async: true },
                    })
                  }
                  disabled={Boolean(actionBusy)}
                  className="ui-btn-secondary w-full disabled:opacity-50"
                >
                  {actionBusy === 'devinfo'
                    ? t('machinePage.task12.devinfoQueueBusy')
                    : t('machinePage.task12.devinfoQueueCta')}
                </button>
              </div>
              <div className="ui-card-muted space-y-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                  {t('machinePage.task12.scanlogNewTitle')}
                </p>
                <p className="text-sm text-slate-200">{t('machinePage.task12.scanlogNewBody')}</p>
                <div className="grid gap-2 text-xs text-slate-400">
                  <label className="flex flex-col gap-1">
                    <span>{t('machinePage.task12.from')}</span>
                    <input
                      type="date"
                      value={scanlogNewPayload.from}
                      onChange={(event) =>
                        setScanlogNewPayload((prev) => ({ ...prev, from: event.target.value }))
                      }
                      className="ui-control-input min-h-0 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>{t('machinePage.task12.to')}</span>
                    <input
                      type="date"
                      value={scanlogNewPayload.to}
                      onChange={(event) =>
                        setScanlogNewPayload((prev) => ({ ...prev, to: event.target.value }))
                      }
                      className="ui-control-input min-h-0 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>{t('machinePage.task12.limit')}</span>
                    <input
                      type="number"
                      value={scanlogNewPayload.limit}
                      min={1}
                      max={2000}
                      onChange={(event) =>
                        setScanlogNewPayload((prev) => ({
                          ...prev,
                          limit: Number(event.target.value) || 100,
                        }))
                      }
                      className="ui-control-input min-h-0 px-2 py-1 text-xs"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={queueTask12ScanlogNew}
                  disabled={Boolean(actionBusy)}
                  className="ui-btn-secondary w-full disabled:opacity-50"
                >
                  {actionBusy === 'scanlog_new'
                    ? t('machinePage.task12.scanlogNewQueueBusy')
                    : t('machinePage.task12.scanlogNewQueueCta')}
                </button>
              </div>
              <div className="ui-card-muted space-y-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  {t('machinePage.task12.usersPartialTitle')}
                </p>
                <p className="text-sm text-slate-200">{t('machinePage.task12.usersPartialBody')}</p>
                <div className="grid gap-2 text-xs text-slate-400">
                  <label className="flex flex-col gap-1">
                    <span>{t('machinePage.task12.page')}</span>
                    <input
                      type="number"
                      value={usersPartialParams.page}
                      min={1}
                      onChange={(event) =>
                        setUsersPartialParams((prev) => ({
                          ...prev,
                          page: Number(event.target.value) || 1,
                        }))
                      }
                      className="ui-control-input min-h-0 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>{t('machinePage.task12.delayMs')}</span>
                    <input
                      type="number"
                      value={usersPartialParams.delayMs}
                      min={250}
                      step={250}
                      onChange={(event) =>
                        setUsersPartialParams((prev) => ({
                          ...prev,
                          delayMs: Number(event.target.value) || 1000,
                        }))
                      }
                      className="ui-control-input min-h-0 px-2 py-1 text-xs"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={queueUsersPartial}
                  disabled={Boolean(actionBusy)}
                  className="ui-btn-secondary w-full disabled:opacity-50"
                >
                  {actionBusy === 'users_partial'
                    ? t('machinePage.task12.usersPartialQueueBusy')
                    : t('machinePage.task12.usersPartialQueueCta')}
                </button>
                {usersPartialStatus && (
                  <p className="text-[11px] text-slate-400">{usersPartialStatus}</p>
                )}
              </div>
            </div>
          </div>

          <div className="ui-card-shell p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">
              {t('machinePage.task12.artifactsTitle')}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {artifactEntries.map((entry) => (
                <div key={entry.alias} className="ui-card-muted space-y-2 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    {entry.label}
                  </p>
                  <p className="text-xs text-slate-500">{entry.note}</p>
                  {isAdmin ? (
                    <pre className="max-h-32 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-300">
                      {formatJson(
                        entry.metadata || entry.data || t('machinePage.task12.artifacts.empty')
                      )}
                    </pre>
                  ) : (
                    <p className="rounded border border-slate-700 bg-slate-950/80 p-2 text-[11px] text-slate-400">
                      {t('machinePage.common.hiddenForNonAdmin')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="ui-card-shell p-4">
            <div className="ui-control-row">
              <div className="ui-control-group">
                <label htmlFor="scanlog-mode" className="ui-control-label">
                  {t('machinePage.controls.scanlogMode')}
                </label>
                <select
                  id="scanlog-mode"
                  value={scanlogMode}
                  onChange={(event) => setScanlogMode(event.target.value)}
                  className="ui-control-select"
                >
                  <option value="new">{t('machinePage.controls.scanlogModeNew')}</option>
                  <option value="all">{t('machinePage.controls.scanlogModeAll')}</option>
                </select>
              </div>
              <div className="ui-control-group max-w-[12rem]">
                <label htmlFor="scanlog-max-pages" className="ui-control-label">
                  {t('machinePage.controls.maxPages')}
                </label>
                <input
                  id="scanlog-max-pages"
                  type="number"
                  min={1}
                  max={100000}
                  value={scanlogMaxPages}
                  onChange={(event) => setScanlogMaxPages(Number(event.target.value) || 1)}
                  className="ui-control-input"
                />
              </div>
              <button
                type="button"
                onClick={() => confirmScanlogAction(scanlogMode)}
                disabled={Boolean(actionBusy)}
                className="ui-btn-primary disabled:opacity-50"
              >
                <DatabaseZap className="h-4 w-4" />{' '}
                {actionBusy === `scanlog_${scanlogMode}`
                  ? t('machinePage.controls.queueScanlogBusy')
                  : scanlogMode === 'all'
                    ? t('machinePage.controls.queueFullScanlogPull')
                    : t('machinePage.controls.queueNewScanlogPull')}
              </button>
            </div>
            {scanlogMode === 'all' && (
              <p className="mt-3 text-xs text-amber-300">
                {t('machinePage.controls.fullScanlogWarning')}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-rose-700/40 bg-rose-950/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
                  <ShieldAlert className="h-4 w-4" /> {t('machinePage.dangerZone.title')}
                </p>
                <p className="mt-1 text-xs text-rose-300/90">{t('machinePage.dangerZone.body')}</p>
              </div>
              <button
                type="button"
                onClick={() => confirmMachineAction('initialize_machine')}
                disabled={Boolean(actionBusy)}
                className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
              >
                {actionBusy === 'initialize_machine'
                  ? t('machinePage.dangerZone.queueing')
                  : t('machinePage.dangerZone.cta')}
              </button>
            </div>
            <p className="mt-3 text-[11px] text-rose-300/80">
              {t('machinePage.dangerZone.requiredPhrase')}{' '}
              <span className="font-semibold">{initConfirmationPhrase}</span>
            </p>
          </div>

          <InlineStatusPanel message={error} variant="error" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="ui-card-shell p-4">
              <h2 className="mb-2 text-sm font-semibold text-white">
                {t('machinePage.results.deviceInfoTitle')}
              </h2>
              {isAdmin ? (
                <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                  {deviceInfo ? formatJson(deviceInfo) : t('machinePage.results.noDeviceInfo')}
                </pre>
              ) : (
                <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                  {t('machinePage.common.hiddenForNonAdmin')}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                {tr('machinePage.results.deviceTime', { time: String(deviceTime || '-') })}
              </p>
            </div>

            <div className="space-y-4">
              <div className="ui-card-shell p-4">
                <h2 className="mb-2 text-sm font-semibold text-white">
                  {t('machinePage.results.usersPullTitle')}
                </h2>
                {isAdmin ? (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                    {userSyncResult
                      ? formatJson(userSyncResult)
                      : t('machinePage.results.noUsersPull')}
                  </pre>
                ) : (
                  <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                    {t('machinePage.common.hiddenForNonAdmin')}
                  </p>
                )}
              </div>
              <div className="ui-card-shell p-4">
                <h2 className="mb-2 text-sm font-semibold text-white">
                  {t('machinePage.results.initializeTitle')}
                </h2>
                {isAdmin ? (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                    {initResult ? formatJson(initResult) : t('machinePage.results.noInitialize')}
                  </pre>
                ) : (
                  <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                    {t('machinePage.common.hiddenForNonAdmin')}
                  </p>
                )}
              </div>
              <div className="ui-card-shell p-4">
                <h2 className="mb-2 text-sm font-semibold text-white">
                  {t('machinePage.results.scanlogQueueTitle')}
                </h2>
                {isAdmin ? (
                  <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                    {scanSyncResult
                      ? formatJson(scanSyncResult)
                      : t('machinePage.results.noScanlogQueue')}
                  </pre>
                ) : (
                  <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                    {t('machinePage.common.hiddenForNonAdmin')}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="ui-card-shell p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {t('machinePage.jobs.title')}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <label htmlFor="machine-jobs-limit" className="text-muted-foreground">
                  {t('machinePage.jobs.rows')}
                </label>
                <select
                  id="machine-jobs-limit"
                  value={machineLimit}
                  onChange={(event) => {
                    setMachineLimit(Number(event.target.value) || 30);
                    setMachinePage(1);
                  }}
                  className="ui-control-select !min-h-0 !w-auto px-2 py-1 text-xs"
                >
                  {[10, 20, 30, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setMachinePage((prev) => Math.max(1, prev - 1))}
                  disabled={machinePage <= 1}
                  className="ui-btn-secondary !min-h-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('machinePage.jobs.prev')}
                </button>
                <span className="font-mono text-foreground">
                  {machinePage}/{machinePages}
                </span>
                <button
                  type="button"
                  onClick={() => setMachinePage((prev) => Math.min(machinePages, prev + 1))}
                  disabled={machinePage >= machinePages}
                  className="ui-btn-secondary !min-h-0 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('machinePage.jobs.next')}
                </button>
                <span className="text-muted-foreground">
                  {t('machinePage.jobs.total')} {machineTotal}
                </span>
              </div>
            </div>
            <div className="ui-table-shell space-y-2 p-2">
              {machineRows.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('machinePage.jobs.empty')}</p>
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
                  <div key={row.id} className="ui-table-row rounded-lg bg-slate-950/40 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMachineRowExpand(row.id)}
                        className="text-left"
                      >
                        <p className="text-sm font-semibold text-slate-200">
                          {tr('machinePage.row.jobTitle', {
                            id: row.id,
                            action: actionLabel(row.action, resolvedLocale),
                          })}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {tr('machinePage.row.created', { createdAt: row.created_at })}
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] ${statusClass}`}
                        >
                          {status || t('machinePage.common.unknown')}
                        </span>
                        {isAdmin && cancellable && (
                          <button
                            type="button"
                            onClick={() =>
                              confirmMachineAction('cancel_job', { payload: { job_id: row.id } })
                            }
                            className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-200"
                          >
                            <XCircle className="mr-1 inline-block h-3 w-3" />
                            {t('machinePage.jobs.cancel')}
                          </button>
                        )}
                      </div>
                    </div>
                    {isAdmin && isExpanded && (
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
                {t('machinePage.confirm.required')}
              </p>
            </div>

            {confirmModal.requiresPhrase && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  {t('machinePage.confirm.typePhrase')}
                  <span className="ml-1 font-semibold text-rose-300">{initConfirmationPhrase}</span>
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  className="ui-control-input"
                  placeholder={t('machinePage.confirm.phrasePlaceholder')}
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
                className="ui-btn-secondary"
              >
                {t('machinePage.confirm.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmProceed}
                disabled={!canProceedConfirm || Boolean(actionBusy)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  confirmModal.danger
                    ? 'bg-rose-600 text-white disabled:bg-rose-900/50'
                    : 'ui-btn-primary disabled:opacity-50'
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
