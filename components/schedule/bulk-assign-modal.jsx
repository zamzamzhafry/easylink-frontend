'use client';

import { useState } from 'react';
import ModalShell from '@/components/ui/modal-shell';
import { useToast } from '@/components/ui/toast-provider';

export default function BulkAssignModal({
  shifts,
  groups,
  defaultFrom,
  defaultTo,
  onClose,
  onApply,
  onDone,
}) {
  const { warning } = useToast();
  const [groupId, setGroupId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const apply = async () => {
    if (!groupId || !shiftId) {
      warning('Select both group and shift before applying bulk assignment.', 'Validation warning');
      return;
    }

    setSaving(true);
    const affected = await onApply({
      group_id: Number(groupId),
      shift_id: Number(shiftId),
      from,
      to,
    });
    setSaving(false);

    if (typeof affected === 'number') {
      setResult(affected);
    }
  };

  return (
    <ModalShell
      title="Bulk Assign - Group"
      subtitle="Apply one shift to all members of a group over a date range."
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Group</label>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="">- select group -</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Shift</label>
          <select
            value={shiftId}
            onChange={(event) => setShiftId(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            <option value="">- select shift -</option>
            {shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.nama_shift}
                {shift.jam_masuk ? ` (${shift.jam_masuk.slice(0, 5)}-${shift.jam_keluar.slice(0, 5)})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">From</label>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white focus:border-teal-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">To</label>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-white focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {result !== null && (
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-300">
            Applied to {result} schedule slot{result !== 1 ? 's' : ''}.
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        {result !== null ? (
          <button
            type="button"
            onClick={onDone}
            className="flex-1 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400"
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition-colors hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={saving}
              className="flex-1 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400 disabled:opacity-50"
            >
              {saving ? 'Applying...' : 'Apply'}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}
