'use client';

import { useState } from 'react';
import ModalShell from '@/components/ui/modal-shell';
import { useToast } from '@/components/ui/toast-provider';

export default function CreateGroupModal({ onClose, onCreate }) {
  const { warning } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      warning('Group name is required before creating a group.', 'Validation warning');
      return;
    }

    setSaving(true);
    const ok = await onCreate({ name: name.trim(), description: description.trim() });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <ModalShell title="New Group" onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Group Name *</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Description</label>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
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
          onClick={create}
          disabled={saving}
          className="flex-1 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400 disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create'}
        </button>
      </div>
    </ModalShell>
  );
}
