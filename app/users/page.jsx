'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { requestJson } from '@/lib/request-json';
import { useToast } from '@/components/ui/toast-provider';
import ModalShell from '@/components/ui/modal-shell';
import {
  TableShell,
  TableHeadRow,
  TableLoadingRow,
  TableEmptyRow,
} from '@/components/ui/table-shell';
import { cn } from '@/lib/utils';

// ─── privilege label ───────────────────────────────────────────────────────────
const PRIVILEGE_MAP = {
  0: { label: 'User', cls: 'text-slate-400 bg-slate-800/60 border-slate-700' },
  14: { label: 'Admin', cls: 'text-teal-300 bg-teal-500/10 border-teal-500/30' },
};

function privilegeLabel(priv) {
  const n = Number(priv ?? 0);
  if (n >= 14) return PRIVILEGE_MAP[14];
  return PRIVILEGE_MAP[0];
}

// ─── table headers ─────────────────────────────────────────────────────────────
const HEADERS = [
  { key: 'pin', label: 'PIN', className: 'w-28' },
  { key: 'nama', label: 'Name', className: 'min-w-[180px]' },
  { key: 'privilege', label: 'Role', className: 'w-24' },
  { key: 'rfid', label: 'RFID', className: 'w-32' },
  { key: 'groups', label: 'Groups', className: 'min-w-[160px]' },
  { key: 'scan_total', label: 'Scans', className: 'w-20 text-right' },
  { key: 'scan_days', label: 'Days', className: 'w-20 text-right' },
  { key: 'last_scan', label: 'Last Scan', className: 'w-36' },
  { key: 'actions', label: '', className: 'w-28' },
];

// ─── empty form ────────────────────────────────────────────────────────────────
const EMPTY_FORM = { pin: '', nama: '', pwd: '', rfid: '', privilege: '0' };

// ─── Field helper ──────────────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none',
        className
      )}
      {...props}
    />
  );
}

// ─── User Modal (create / edit / change-password) ──────────────────────────────
function UserModal({ mode, user, onClose, onSave }) {
  const isCreate = mode === 'create';
  const isPassword = mode === 'password';

  const [form, setForm] = useState(() => {
    if (isCreate) return EMPTY_FORM;
    if (isPassword) return { pin: user?.pin ?? '', pwd: '', pwd2: '' };
    return {
      pin: user?.pin ?? '',
      nama: user?.nama ?? '',
      rfid: user?.rfid ?? '',
      privilege: String(user?.privilege ?? 0),
    };
  });

  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPassword && form.pwd !== form.pwd2) {
      toast.warning('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      let payload;
      if (isCreate) {
        payload = {
          pin: form.pin.trim(),
          nama: form.nama.trim(),
          pwd: form.pwd,
          rfid: form.rfid.trim(),
          privilege: Number(form.privilege),
        };
      } else if (isPassword) {
        payload = { pin: form.pin, pwd: form.pwd };
      } else {
        payload = {
          pin: form.pin,
          nama: form.nama.trim(),
          rfid: form.rfid.trim(),
          privilege: Number(form.privilege),
        };
      }

      const ok = await onSave(payload);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  const title = isCreate ? 'Create User' : isPassword ? 'Change Password' : 'Edit User';
  const subtitle = isCreate
    ? 'Add a new device user to tb_user'
    : isPassword
      ? `Change password for PIN ${user?.pin}`
      : `Editing PIN ${user?.pin}`;

  return (
    <ModalShell title={title} subtitle={subtitle} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* PIN — only shown on create */}
        {isCreate && (
          <Field label="PIN" required>
            <Input
              value={form.pin}
              onChange={(e) => set('pin', e.target.value)}
              placeholder="e.g. 00001"
              maxLength={12}
              required
            />
          </Field>
        )}

        {/* Name — create or edit */}
        {!isPassword && (
          <Field label="Name" required>
            <Input
              value={form.nama}
              onChange={(e) => set('nama', e.target.value)}
              placeholder="Full name"
              required
            />
          </Field>
        )}

        {/* RFID — create or edit */}
        {!isPassword && (
          <Field label="RFID">
            <Input
              value={form.rfid}
              onChange={(e) => set('rfid', e.target.value)}
              placeholder="RFID tag (optional)"
            />
          </Field>
        )}

        {/* Privilege — create or edit */}
        {!isPassword && (
          <Field label="Role">
            <select
              value={form.privilege}
              onChange={(e) => set('privilege', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="0">User (0)</option>
              <option value="14">Admin (14)</option>
            </select>
          </Field>
        )}

        {/* Password — create or change-password mode */}
        {(isCreate || isPassword) && (
          <Field label={isCreate ? 'Password' : 'New Password'} required={isPassword}>
            <div className="relative">
              <Input
                type={showPwd ? 'text' : 'password'}
                value={form.pwd}
                onChange={(e) => set('pwd', e.target.value)}
                placeholder="Leave blank for no password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        )}

        {/* Confirm password — change-password mode */}
        {isPassword && (
          <Field label="Confirm Password" required>
            <Input
              type={showPwd ? 'text' : 'password'}
              value={form.pwd2}
              onChange={(e) => set('pwd2', e.target.value)}
              placeholder="Repeat new password"
              required
            />
          </Field>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // modal: null | { mode: 'create'|'edit'|'password', user?: User }
  const [modal, setModal] = useState(null);

  const toast = useToast();

  // ── load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson('/api/users');
      setUsers(data.users ?? []);
    } catch (err) {
      toast.error(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ── filtered rows ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.pin.toLowerCase().includes(q) ||
        (u.nama ?? '').toLowerCase().includes(q) ||
        (u.rfid ?? '').toLowerCase().includes(q)
    );
  }, [users, search]);

  // ── save (create) ─────────────────────────────────────────────────────────────
  const handleCreate = async (payload) => {
    try {
      await requestJson('/api/users', { method: 'POST', body: JSON.stringify(payload) });
      toast.success(`User ${payload.pin} created`);
      await load();
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to create user');
      return false;
    }
  };

  // ── save (edit / password) ────────────────────────────────────────────────────
  const handleSaveEdit = async (payload) => {
    try {
      await requestJson('/api/users', { method: 'PUT', body: JSON.stringify(payload) });
      toast.success('User updated');
      await load();
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to update user');
      return false;
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user ${user.nama || user.pin}? This cannot be undone.`)) return;
    try {
      await requestJson('/api/users', {
        method: 'DELETE',
        body: JSON.stringify({ pin: user.pin }),
      });
      toast.success(`User ${user.pin} deleted`);
      setUsers((prev) => prev.filter((u) => u.pin !== user.pin));
    } catch (err) {
      toast.error(err.message || 'Failed to delete user');
    }
  };

  const closeModal = () => setModal(null);

  const onSave = modal?.mode === 'create' ? handleCreate : handleSaveEdit;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white">
            <Users className="h-5 w-5 text-teal-400" />
            Users
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Device users from tb_user — {users.length} total
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PIN or name…"
              className="w-56 rounded-lg border border-slate-700 bg-slate-800 py-2 pl-8 pr-3 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Create */}
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* Table */}
      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <TableHeadRow headers={HEADERS} />
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <TableLoadingRow colSpan={HEADERS.length} />
            ) : filtered.length === 0 ? (
              <TableEmptyRow colSpan={HEADERS.length} label="No users found" />
            ) : (
              filtered.map((user) => {
                const { label: roleLabel, cls: roleCls } = privilegeLabel(user.privilege);
                return (
                  <tr key={user.pin} className="group hover:bg-slate-800/40">
                    {/* PIN */}
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-teal-300">
                      {user.pin}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-white">
                      {user.nama || <span className="italic text-slate-500">—</span>}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          roleCls
                        )}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {roleLabel}
                      </span>
                    </td>

                    {/* RFID */}
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {user.rfid || <span className="italic text-slate-600">—</span>}
                    </td>

                    {/* Groups */}
                    <td className="px-4 py-3">
                      {user.groups.length === 0 ? (
                        <span className="italic text-xs text-slate-600">No groups</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.groups.map((g) => (
                            <span
                              key={g.group_id}
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                g.is_approved
                                  ? 'border-teal-500/30 bg-teal-500/10 text-teal-300'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              )}
                              title={g.is_approved ? 'Approved' : 'Pending approval'}
                            >
                              {g.nama_group || `Group ${g.group_id}`}
                              {!g.is_approved && ' ⏳'}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Scan total */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-300">
                      {user.scan_total.toLocaleString()}
                    </td>

                    {/* Scan days */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-300">
                      {user.scan_days.toLocaleString()}
                    </td>

                    {/* Last scan */}
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {user.last_scan ? (
                        <>
                          <div className="text-slate-300">
                            {String(user.last_scan).slice(0, 10)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {String(user.last_scan).slice(11, 19) || ''}
                          </div>
                        </>
                      ) : (
                        <span className="italic text-slate-600">Never</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setModal({ mode: 'edit', user })}
                          title="Edit"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ mode: 'password', user })}
                          title="Change password"
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-700 hover:text-amber-300"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          title="Delete"
                          className="rounded p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
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
      </TableShell>

      {/* Modal */}
      {modal && (
        <UserModal mode={modal.mode} user={modal.user} onClose={closeModal} onSave={onSave} />
      )}
    </div>
  );
}
