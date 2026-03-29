'use client';

import { useMemo, useState } from 'react';
import { useAppLocale } from '@/components/app-shell';
import ModalShell from '@/components/ui/modal-shell';
import { STATUS_MAP } from '@/lib/attendance-helpers';
import { getUIText } from '@/lib/localization/ui-texts';

const labelClass = 'mb-1 block ui-control-label';
const inputClass = 'ui-control-input min-h-0 text-sm';
const selectClass = 'ui-control-select min-h-0 text-sm';
const checkboxClass = 'ui-control-check';

export default function NoteModal({ row, onClose, onSave }) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = (path) => getUIText(path, resolvedLocale);
  const [status, setStatus] = useState(row.note_status || row.computed_status || 'normal');
  const [catatan, setCatatan] = useState(row.note_catatan || '');
  const [manualHours, setManualHours] = useState(
    row.note_manual_hours !== null && row.note_manual_hours !== undefined
      ? String(row.note_manual_hours)
      : ''
  );
  const [manualApproved, setManualApproved] = useState(
    Boolean(Number(row.note_manual_approved || 0))
  );
  const [saving, setSaving] = useState(false);

  const subtitle = useMemo(() => {
    const rawDate = String(row.scan_date ?? '');
    const dateText = rawDate.includes('T') ? rawDate.slice(0, 10) : rawDate;
    return `${row.nama} | ${dateText}`;
  }, [row.nama, row.scan_date]);

  const save = async () => {
    setSaving(true);
    const ok = await onSave({
      status,
      catatan,
      manual_hours: manualHours ? Number(manualHours) : null,
      manual_approved: manualApproved,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <ModalShell
      title={t('attendancePage.noteModal.title')}
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="note-status" className={labelClass}>
            {t('attendancePage.noteModal.status')}
          </label>
          <select
            id="note-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={selectClass}
          >
            {Object.entries(STATUS_MAP).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="note-catatan" className={labelClass}>
            {t('attendancePage.noteModal.noteLabel')}
          </label>
          <textarea
            id="note-catatan"
            rows={3}
            value={catatan}
            onChange={(event) => setCatatan(event.target.value)}
            placeholder={t('attendancePage.noteModal.notePlaceholder')}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="note-manual-hours" className={labelClass}>
              {t('attendancePage.noteModal.manualHours')}
            </label>
            <input
              id="note-manual-hours"
              type="number"
              min="0"
              step="0.5"
              value={manualHours}
              onChange={(event) => setManualHours(event.target.value)}
              placeholder={t('attendancePage.noteModal.manualHoursPlaceholder')}
              className={inputClass}
            />
          </div>
          <label className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={manualApproved}
              onChange={(event) => setManualApproved(event.target.checked)}
              className={checkboxClass}
            />
            {t('attendancePage.noteModal.approveOverride')}
          </label>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="ui-btn-secondary flex-1">
          {t('attendancePage.noteModal.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="ui-btn-primary flex-1 disabled:opacity-50"
        >
          {saving ? t('attendancePage.noteModal.saving') : t('attendancePage.noteModal.save')}
        </button>
      </div>
    </ModalShell>
  );
}
