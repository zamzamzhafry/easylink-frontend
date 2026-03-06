'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import ModalShell from '@/components/ui/modal-shell';
import { useToast } from '@/components/ui/toast-provider';

const MONTH_MAP = {
  januari: '01',
  january: '01',
  februari: '02',
  february: '02',
  maret: '03',
  march: '03',
  april: '04',
  mei: '05',
  may: '05',
  juni: '06',
  june: '06',
  juli: '07',
  july: '07',
  agustus: '08',
  august: '08',
  september: '09',
  oktober: '10',
  october: '10',
  november: '11',
  desember: '12',
  december: '12',
};

function toDateInput(value) {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dateWithTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (dateWithTimeMatch) return dateWithTimeMatch[1];

  const numericDateMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (numericDateMatch) {
    const [, day, month, year] = numericDateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const namedDateMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!namedDateMatch) return '';

  const [, day, monthName, year] = namedDateMatch;
  const month = MONTH_MAP[monthName.toLowerCase()];
  if (!month) return '';
  return `${year}-${month}-${day.padStart(2, '0')}`;
}

function buildUserLabel(user) {
  return `${user.pin} - ${user.nama}`;
}

function Field({ label, value, onChange, hint, type = 'text' }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white transition-colors focus:border-teal-500 focus:outline-none"
      />
      {hint && <p className="mt-1 text-xs text-slate-600">{hint}</p>}
    </div>
  );
}

export default function EditEmployeeModal({ mode = 'edit', employee, users = [], onClose, onSave }) {
  const { warning } = useToast();
  const isCreate = mode === 'create';
  const initialPin = employee?.pin ? String(employee.pin) : '';
  const selectedUser = users.find((user) => String(user.pin) === initialPin);

  const [form, setForm] = useState(() => ({
    nama_karyawan: employee?.nama_karyawan ?? '',
    user_pin: initialPin,
    nip: employee?.nip ?? '',
    awal_kontrak: toDateInput(employee?.awal_kontrak),
    akhir_kontrak: toDateInput(employee?.akhir_kontrak),
    isActiveDuty: employee ? Boolean(Number(employee.isActiveDuty)) : true,
  }));
  const [userSearch, setUserSearch] = useState(() =>
    selectedUser
      ? buildUserLabel(selectedUser)
      : initialPin
        ? `${initialPin}${employee?.nama_user ? ` - ${employee.nama_user}` : ''}`
        : ''
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const subtitle = useMemo(
    () => (isCreate ? 'Create new employee record' : `ID #${employee.id} | PIN ${employee.pin || '-'}`),
    [employee?.id, employee?.pin, isCreate]
  );

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users.slice(0, 10);

    return users
      .filter((user) => {
        const pin = String(user.pin).toLowerCase();
        const nama = (user.nama ?? '').toLowerCase();
        return pin.includes(query) || nama.includes(query);
      })
      .slice(0, 10);
  }, [users, userSearch]);

  const save = async () => {
    if (!form.nama_karyawan.trim()) {
      warning('Full name is required.', 'Validation warning');
      return;
    }

    setSaving(true);
    const ok = await onSave({
      nama_karyawan: form.nama_karyawan.trim(),
      user_pin: form.user_pin,
      nip: form.nip.trim(),
      awal_kontrak: form.awal_kontrak,
      akhir_kontrak: form.akhir_kontrak,
      isActiveDuty: form.isActiveDuty,
    });
    setSaving(false);
    if (ok) onClose();
  };

  const chooseUser = (user) => {
    setForm((prev) => ({ ...prev, user_pin: String(user.pin) }));
    setUserSearch(buildUserLabel(user));
    setDropdownOpen(false);
  };

  return (
    <ModalShell
      title={isCreate ? 'Add Employee' : 'Edit Employee'}
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <Field
          label="Full Name (tb_karyawan.nama)"
          value={form.nama_karyawan}
          onChange={(value) => setForm((prev) => ({ ...prev, nama_karyawan: value }))}
        />
        <div className="relative" onBlur={() => setTimeout(() => setDropdownOpen(false), 100)}>
          <label className="mb-1 block text-xs text-slate-400">Device User Relation (tb_user)</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={userSearch}
              onFocus={() => setDropdownOpen(true)}
              onChange={(event) => {
                setUserSearch(event.target.value);
                setDropdownOpen(true);
                setForm((prev) => ({ ...prev, user_pin: '' }));
              }}
              placeholder="Type PIN or user name..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-8 text-sm text-white transition-colors focus:border-teal-500 focus:outline-none"
            />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          </div>

          {dropdownOpen && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setForm((prev) => ({ ...prev, user_pin: '' }));
                  setUserSearch('');
                  setDropdownOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-slate-800 px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-slate-800"
              >
                <span>No linked user (NULL)</span>
              </button>
              {filteredUsers.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">No matching user.</p>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = form.user_pin === String(user.pin);
                  return (
                    <button
                      key={user.pin}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        chooseUser(user);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-slate-800"
                    >
                      <span className="font-mono">{buildUserLabel(user)}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal-400" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-600">
            {form.user_pin
              ? `Selected PIN: ${form.user_pin}`
              : 'Optional: leave empty when employee has no linked machine user.'}
          </p>
        </div>
        <Field
          label="NIP"
          value={form.nip}
          onChange={(value) => setForm((prev) => ({ ...prev, nip: value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Awal Kontrak"
            value={form.awal_kontrak}
            onChange={(value) => setForm((prev) => ({ ...prev, awal_kontrak: value }))}
            type="date"
          />
          <Field
            label="Akhir Kontrak"
            value={form.akhir_kontrak}
            onChange={(value) => setForm((prev) => ({ ...prev, akhir_kontrak: value }))}
            type="date"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.isActiveDuty}
            onChange={(event) => setForm((prev) => ({ ...prev, isActiveDuty: event.target.checked }))}
            className="h-4 w-4 rounded border border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500/40"
          />
          Is Active Duty
        </label>
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
          {saving ? (isCreate ? 'Creating...' : 'Saving...') : isCreate ? 'Create Employee' : 'Save Changes'}
        </button>
      </div>
    </ModalShell>
  );
}
