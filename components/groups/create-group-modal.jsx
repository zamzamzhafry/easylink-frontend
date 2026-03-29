'use client';

import { useState } from 'react';
import ModalShell from '@/components/ui/modal-shell';
import { useToast } from '@/components/ui/toast-provider';

export default function CreateGroupModal({
  onClose,
  onCreate,
  title = 'New Group',
  submitLabel = 'Create',
  initialName = '',
  initialDescription = '',
}) {
  const { warning } = useToast();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
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
    <ModalShell title={title} onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-3">
        <div>
          <label htmlFor="group-name" className="mb-1 block text-xs text-muted-foreground">
            Group Name *
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="ui-control-input w-full text-sm"
          />
        </div>
        <div>
          <label htmlFor="group-description" className="mb-1 block text-xs text-muted-foreground">
            Description
          </label>
          <input
            id="group-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="ui-control-input w-full text-sm"
          />
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="ui-btn-secondary flex-1 rounded-lg px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="ui-btn-primary flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </ModalShell>
  );
}
