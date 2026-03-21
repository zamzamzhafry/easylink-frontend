'use client';

import { useEffect, useState, useCallback } from 'react';
import ModalShell from '@/components/ui/modal-shell';
import { Clock, Server, CalendarDays, Plus, Trash2, Save, RefreshCw } from 'lucide-react';

/* ── tiny helpers ─────────────────────────────────────────── */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
const selectCls = inputCls;
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition';
const btnDanger =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-400 hover:bg-red-900/30 transition';

/* ── tabs ─────────────────────────────────────────────────── */

const TABS = [
  { key: 'scheduling', label: 'Scheduling', icon: Clock },
  { key: 'device', label: 'Device', icon: Server },
  { key: 'holidays', label: 'Holidays', icon: CalendarDays },
];

/* ── component ────────────────────────────────────────────── */

export default function SettingsModal({ onClose }) {
  const [tab, setTab] = useState('scheduling');
  const [config, setConfig] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* new holiday form */
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newIsCuti, setNewIsCuti] = useState(false);

  /* ── loaders ──────────────────────────────────────────── */

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (json.ok) setConfig(json.config);
    } catch (err) {
      setError('Failed to load config: ' + err.message);
    }
  }, []);

  const loadHolidays = useCallback(async () => {
    try {
      const year = new Date().getFullYear();
      const res = await fetch(`/api/holidays?year=${year}`);
      const json = await res.json();
      if (json.ok) setHolidays(json.rows || []);
    } catch (err) {
      setError('Failed to load holidays: ' + err.message);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadHolidays();
  }, [loadConfig, loadHolidays]);

  /* ── save config ──────────────────────────────────────── */

  async function saveConfig() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setConfig(json.config);
      setDirty(false);
      setSuccess('Settings saved');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  /* ── add custom holiday ───────────────────────────────── */

  async function addHoliday() {
    if (!newDate || !newName.trim()) return;
    setError('');
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDate,
          name: newName.trim(),
          is_cuti_bersama: newIsCuti,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setNewDate('');
      setNewName('');
      setNewIsCuti(false);
      loadHolidays();
      setSuccess('Holiday added');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError('Add failed: ' + err.message);
    }
  }

  /* ── delete custom holiday ────────────────────────────── */

  async function deleteHoliday(date) {
    setError('');
    try {
      const res = await fetch('/api/holidays', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      loadHolidays();
      setSuccess('Holiday removed');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError('Delete failed: ' + err.message);
    }
  }

  /* ── update helpers ───────────────────────────────────── */

  function updateScheduling(key, value) {
    setConfig((prev) => ({
      ...prev,
      scheduling: { ...(prev?.scheduling || {}), [key]: value },
    }));
    setDirty(true);
  }

  function updateDevice(key, value) {
    setConfig((prev) => ({
      ...prev,
      device: { ...(prev?.device || {}), [key]: value },
    }));
    setDirty(true);
  }

  function toggleDay(day) {
    const current = config?.scheduling?.daysOfWeek || [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    updateScheduling('daysOfWeek', next);
  }

  if (!config) {
    return (
      <ModalShell title="Settings" onClose={onClose} maxWidth="max-w-2xl">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      </ModalShell>
    );
  }

  const sched = config.scheduling || {};
  const device = config.device || {};

  return (
    <ModalShell
      title="Settings"
      subtitle="Configure scheduling, device, and holidays"
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {/* tab bar */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-800/60 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
              tab === key ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* status */}
      {error && (
        <div className="mb-3 rounded-lg bg-red-900/30 border border-red-800 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded-lg bg-teal-900/30 border border-teal-800 px-3 py-2 text-xs text-teal-300">
          {success}
        </div>
      )}

      {/* ─── SCHEDULING TAB ──────────────────────────────── */}
      {tab === 'scheduling' && (
        <div className="space-y-4">
          {/* enable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Auto-fetch scanlogs</p>
              <p className="text-xs text-slate-400">Pull logs from machine on schedule</p>
            </div>
            <button
              onClick={() => updateScheduling('enabled', !sched.enabled)}
              className={`relative h-6 w-11 rounded-full transition ${
                sched.enabled ? 'bg-teal-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  sched.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Interval (minutes)" hint="How often to pull">
              <input
                type="number"
                min={1}
                max={1440}
                className={inputCls}
                value={sched.intervalMinutes ?? 30}
                onChange={(e) => updateScheduling('intervalMinutes', Number(e.target.value))}
              />
            </Field>

            <Field label="Pull Mode">
              <select
                className={selectCls}
                value={sched.pullMode || 'new'}
                onChange={(e) => updateScheduling('pullMode', e.target.value)}
              >
                <option value="new">New logs only</option>
                <option value="range">Date range</option>
                <option value="all">All logs</option>
              </select>
            </Field>

            <Field label="Active from">
              <input
                type="time"
                className={inputCls}
                value={sched.startTime || '06:00'}
                onChange={(e) => updateScheduling('startTime', e.target.value)}
              />
            </Field>

            <Field label="Active until">
              <input
                type="time"
                className={inputCls}
                value={sched.endTime || '22:00'}
                onChange={(e) => updateScheduling('endTime', e.target.value)}
              />
            </Field>
          </div>

          {/* day-of-week picker */}
          <Field label="Active days">
            <div className="flex gap-1.5 pt-1">
              {DAY_LABELS.map((label, idx) => {
                const active = (sched.daysOfWeek || []).includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={`flex h-8 w-9 items-center justify-center rounded-md text-xs font-medium transition ${
                      active
                        ? 'bg-teal-600 text-white'
                        : 'border border-slate-700 text-slate-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Retry on failure">
              <select
                className={selectCls}
                value={sched.retryOnFail ? 'yes' : 'no'}
                onChange={(e) => updateScheduling('retryOnFail', e.target.value === 'yes')}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>

            <Field label="Max retries">
              <input
                type="number"
                min={1}
                max={10}
                className={inputCls}
                value={sched.maxRetries ?? 3}
                onChange={(e) => updateScheduling('maxRetries', Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="SDK Source">
            <select
              className={selectCls}
              value={sched.source || 'auto'}
              onChange={(e) => updateScheduling('source', e.target.value)}
            >
              <option value="auto">Auto (prefer Windows SDK)</option>
              <option value="windows-sdk">Windows SDK</option>
              <option value="fingerspot-easylink-ts">fingerspot-easylink-ts</option>
            </select>
          </Field>
        </div>
      )}

      {/* ─── DEVICE TAB ──────────────────────────────────── */}
      {tab === 'device' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Configure connection details for the EasyLink Windows SDK and physical device.
          </p>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
              Windows SDK (REST API)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="IP Address">
                <input
                  className={inputCls}
                  value={device.windowsSdkIp || ''}
                  placeholder="192.168.1.111"
                  onChange={(e) => updateDevice('windowsSdkIp', e.target.value)}
                />
              </Field>
              <Field label="Port">
                <input
                  className={inputCls}
                  value={device.windowsSdkPort || ''}
                  placeholder="8090"
                  onChange={(e) => updateDevice('windowsSdkPort', e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Direct Device
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="IP Address">
                <input
                  className={inputCls}
                  value={device.deviceIp || ''}
                  placeholder="192.168.1.200"
                  onChange={(e) => updateDevice('deviceIp', e.target.value)}
                />
              </Field>
              <Field label="Port">
                <input
                  className={inputCls}
                  value={device.devicePort || ''}
                  placeholder="5005"
                  onChange={(e) => updateDevice('devicePort', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Serial Number">
              <input
                className={inputCls}
                value={device.deviceSn || ''}
                placeholder="Fio66208021230737"
                onChange={(e) => updateDevice('deviceSn', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Default SDK Source">
            <select
              className={selectCls}
              value={device.sdkSource || 'auto'}
              onChange={(e) => updateDevice('sdkSource', e.target.value)}
            >
              <option value="auto">Auto (prefer Windows SDK)</option>
              <option value="windows-sdk">Windows SDK only</option>
              <option value="fingerspot-easylink-ts">fingerspot-easylink-ts only</option>
            </select>
          </Field>
        </div>
      )}

      {/* ─── HOLIDAYS TAB ────────────────────────────────── */}
      {tab === 'holidays' && (
        <div className="space-y-4">
          {/* add new */}
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/30 p-3">
            <p className="mb-2 text-xs font-semibold text-teal-400 uppercase tracking-wider">
              Add custom holiday
            </p>
            <div className="grid grid-cols-[140px_1fr_auto] gap-2 items-end">
              <Field label="Date">
                <input
                  type="date"
                  className={inputCls}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </Field>
              <Field label="Name">
                <input
                  className={inputCls}
                  value={newName}
                  placeholder="Holiday name..."
                  onChange={(e) => setNewName(e.target.value)}
                />
              </Field>
              <button
                onClick={addHoliday}
                className={btnPrimary}
                disabled={!newDate || !newName.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={newIsCuti}
                onChange={(e) => setNewIsCuti(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500"
              />
              Cuti Bersama
            </label>
          </div>

          {/* list */}
          <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
            {holidays.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No holidays loaded</p>
            )}
            {holidays.map((h) => (
              <div
                key={h.date}
                className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 text-xs font-mono text-slate-500">{h.date}</span>
                  <span className="truncate text-sm text-white">{h.name}</span>
                  {h.is_cuti_bersama && (
                    <span className="shrink-0 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
                      Cuti
                    </span>
                  )}
                  <span className="shrink-0 rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {h.source}
                  </span>
                </div>
                {h.source === 'custom' && (
                  <button
                    onClick={() => deleteHoliday(h.date)}
                    className={btnDanger}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* refresh */}
          <div className="flex justify-end">
            <button onClick={loadHolidays} className={btnGhost}>
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ─── Footer ──────────────────────────────────────── */}
      {(tab === 'scheduling' || tab === 'device') && (
        <div className="mt-5 flex items-center justify-between border-t border-slate-700/50 pt-4">
          <span className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : ''}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveConfig} className={btnPrimary} disabled={saving || !dirty}>
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
