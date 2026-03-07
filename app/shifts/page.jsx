'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import ModalShell from '@/components/ui/modal-shell';
import { getShiftIcon } from '@/components/schedule/shift-icon';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';
import { SHIFT_ICON_OPTIONS } from '@/lib/shift-icon-options';
import { shiftBadgeInlineStyle, shiftClassName } from '@/lib/shift-helpers';

const EMPTY_FORM = {
  nama_shift: '',
  jam_masuk: '',
  jam_keluar: '',
  next_day: false,
  is_paid: true,
  jam_kerja: '',
  color_hex: '#6B7280',
  needs_scan: true,
  icon_key: 'briefcase',
  is_active: true,
};

function toTimeInput(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function mapShiftToForm(shift) {
  return {
    nama_shift: shift.nama_shift || '',
    jam_masuk: toTimeInput(shift.jam_masuk),
    jam_keluar: toTimeInput(shift.jam_keluar),
    next_day: Number(shift.next_day) === 1,
    is_paid: Number(shift.is_paid) === 1,
    jam_kerja: shift.jam_kerja == null ? '' : String(shift.jam_kerja),
    color_hex: shift.color_hex || '#6B7280',
    needs_scan: Number(shift.needs_scan) === 1,
    icon_key: shift.icon_key || 'briefcase',
    is_active: Number(shift.is_active) === 1,
  };
}

function ShiftModal({ mode, shift, onClose, onSubmit }) {
  const { warning } = useToast();
  const [form, setForm] = useState(() => (shift ? mapShiftToForm(shift) : EMPTY_FORM));
  const [saving, setSaving] = useState(false);

  const previewShift = useMemo(
    () => ({
      nama_shift: form.nama_shift || 'Shift',
      color_hex: form.color_hex,
      icon_key: form.icon_key,
    }),
    [form.color_hex, form.icon_key, form.nama_shift]
  );
  const PreviewIcon = getShiftIcon(previewShift);

  const save = async () => {
    if (!form.nama_shift.trim()) {
      warning('Shift name is required.', 'Validation warning');
      return;
    }

    setSaving(true);
    const ok = await onSubmit({
      nama_shift: form.nama_shift.trim(),
      jam_masuk: form.jam_masuk || null,
      jam_keluar: form.jam_keluar || null,
      next_day: form.next_day,
      is_paid: form.is_paid,
      jam_kerja: form.jam_kerja === '' ? null : Number(form.jam_kerja),
      color_hex: form.color_hex,
      needs_scan: form.needs_scan,
      icon_key: form.icon_key || null,
      is_active: form.is_active,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <ModalShell
      title={mode === 'create' ? 'Create Shift' : 'Edit Shift'}
      subtitle={
        mode === 'create'
          ? 'Add a custom schedule template.'
          : `ID #${shift.id} | update shift timing and attributes`
      }
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Shift Name</label>
          <input
            value={form.nama_shift}
            onChange={(event) => setForm((prev) => ({ ...prev, nama_shift: event.target.value }))}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            placeholder="e.g. On Call"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Punch In</label>
            <input
              type="time"
              value={form.jam_masuk}
              disabled={!form.needs_scan}
              onChange={(event) => setForm((prev) => ({ ...prev, jam_masuk: event.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Punch Out</label>
            <input
              type="time"
              value={form.jam_keluar}
              disabled={!form.needs_scan}
              onChange={(event) => setForm((prev) => ({ ...prev, jam_keluar: event.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Estimated Work Hours</label>
            <input
              type="number"
              min="0"
              max="24"
              step="0.25"
              value={form.jam_kerja}
              onChange={(event) => setForm((prev) => ({ ...prev, jam_kerja: event.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Color</label>
            <input
              type="color"
              value={form.color_hex}
              onChange={(event) => setForm((prev) => ({ ...prev, color_hex: event.target.value }))}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-1 py-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Icon</label>
            <select
              value={form.icon_key}
              onChange={(event) => setForm((prev) => ({ ...prev, icon_key: event.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            >
              {SHIFT_ICON_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.needs_scan}
              onChange={(event) => setForm((prev) => ({ ...prev, needs_scan: event.target.checked }))}
              className="h-4 w-4 rounded border border-slate-600 bg-slate-800 text-teal-500"
            />
            Needs Scan
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.next_day}
              onChange={(event) => setForm((prev) => ({ ...prev, next_day: event.target.checked }))}
              className="h-4 w-4 rounded border border-slate-600 bg-slate-800 text-teal-500"
            />
            Ends Next Day
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_paid}
              onChange={(event) => setForm((prev) => ({ ...prev, is_paid: event.target.checked }))}
              className="h-4 w-4 rounded border border-slate-600 bg-slate-800 text-teal-500"
            />
            Paid Shift
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              className="h-4 w-4 rounded border border-slate-600 bg-slate-800 text-teal-500"
            />
            Active
          </label>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <p className="mb-2 text-xs text-slate-500">Preview</p>
          <span
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium ${shiftClassName(
              previewShift.nama_shift
            )}`}
            style={shiftBadgeInlineStyle(previewShift) || undefined}
          >
            <PreviewIcon className="h-3.5 w-3.5" />
            {previewShift.nama_shift}
          </span>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'create' ? 'Create Shift' : 'Save Shift'}
        </button>
      </div>
    </ModalShell>
  );
}

export default function ShiftMakerPage() {
  const { success, warning } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson('/api/shifts');
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error) {
      warning(error.message || 'Failed to load shift rows.', 'Shift request failed');
    } finally {
      setLoading(false);
    }
  }, [warning]);

  useEffect(() => {
    load();
  }, [load]);

  const createShift = async (payload) => {
    try {
      await requestJson('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await load();
      success('Shift has been created.', 'Created');
      return true;
    } catch (error) {
      warning(error.message || 'Unable to create shift.', 'Create failed');
      return false;
    }
  };

  const updateShift = async (payload) => {
    if (!editing) return false;
    try {
      await requestJson(`/api/shifts/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await load();
      success('Shift has been updated.', 'Saved');
      return true;
    } catch (error) {
      warning(error.message || 'Unable to update shift.', 'Save failed');
      return false;
    }
  };

  const deleteShift = async (shift) => {
    const ok = window.confirm(`Deactivate shift "${shift.nama_shift}"?`);
    if (!ok) return;
    try {
      await requestJson(`/api/shifts/${shift.id}`, { method: 'DELETE' });
      await load();
      success(`Shift ${shift.nama_shift} has been deactivated.`, 'Deleted');
    } catch (error) {
      warning(error.message || 'Unable to delete shift.', 'Delete failed');
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Configuration</p>
          <h1 className="text-3xl font-bold text-white">Shift Maker</h1>
          <p className="mt-1 text-sm text-slate-400">
            Create and customize shift punch time in/out, color, icon, and scan rules.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400"
        >
          <Plus className="h-4 w-4" />
          New Shift
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Shift</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Punch Time</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Hours</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Scan Rule</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-2 text-xs uppercase tracking-wide text-slate-500 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    Loading shifts...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    No shifts found.
                  </td>
                </tr>
              ) : (
                rows.map((shift) => {
                  const Icon = getShiftIcon(shift);
                  return (
                    <tr key={shift.id}>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium ${shiftClassName(
                            shift.nama_shift
                          )}`}
                          style={shiftBadgeInlineStyle(shift) || undefined}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {shift.nama_shift}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {shift.jam_masuk ? (
                          <>
                            {String(shift.jam_masuk).slice(0, 5)} - {String(shift.jam_keluar).slice(0, 5)}
                            {Number(shift.next_day) === 1 ? ' (+1)' : ''}
                          </>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {shift.jam_kerja == null ? '-' : `${Number(shift.jam_kerja).toFixed(2)}h`}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {Number(shift.needs_scan) === 1 ? (
                          <span className="inline-flex rounded border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-teal-300">
                            Needs Scan
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                            No Scan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {Number(shift.is_active) === 1 ? (
                          <span className="inline-flex rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(shift)}
                            className="rounded border border-slate-700 bg-slate-800 p-1.5 text-slate-300 transition-colors hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteShift(shift)}
                            className="rounded border border-rose-500/40 bg-rose-500/10 p-1.5 text-rose-300 transition-colors hover:bg-rose-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <ShiftModal mode="create" onClose={() => setCreating(false)} onSubmit={createShift} />
      )}
      {editing && (
        <ShiftModal
          mode="edit"
          shift={editing}
          onClose={() => setEditing(null)}
          onSubmit={updateShift}
        />
      )}
    </div>
  );
}

