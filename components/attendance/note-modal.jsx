'use client';

import { useMemo, useState } from 'react';
import ModalShell from '@/components/ui/modal-shell';
import { STATUS_MAP } from '@/lib/attendance-helpers';

export default function NoteModal({ row, onClose, onSave }) {
  const [status, setStatus] = useState(row.note_status || row.computed_status || 'normal');
  const [catatan, setCatatan] = useState(row.note_catatan || '');
  const [saving, setSaving] = useState(false);

  const subtitle = useMemo(() => `${row.nama} | ${row.scan_date}`, [row.nama, row.scan_date]);

  const save = async () => {
    setSaving(true);
    const ok = await onSave({ status, catatan });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <ModalShell title="Edit Catatan" subtitle={subtitle} onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Status</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            {Object.entries(STATUS_MAP).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Catatan / Keterangan</label>
          <textarea
            rows={3}
            value={catatan}
            onChange={(event) => setCatatan(event.target.value)}
            placeholder="Contoh: izin dokter, tugas luar kota..."
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 flex gap-2">
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
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </ModalShell>
  );
}
