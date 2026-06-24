'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import SearchInput from '@/components/ui/search-input';
import { requestJson } from '@/lib/request-json';
import { PAGE_SIZE_OPTIONS } from '@/lib/constants';
import { useToast } from '@/components/ui/toast-provider';
import ModalShell from '@/components/ui/modal-shell';
import DataTable from '@/components/ui/data-table';
import { Button, ButtonGroup } from '@/components/ui/button';
import InlineStatusPanel from '@/components/ui/inline-status-panel';
import { usePaginatedResource } from '@/hooks/use-paginated-resource';
import { cn } from '@/lib/utils';

// ─── privilege label ───────────────────────────────────────────────────────────
const PRIVILEGE_MAP = {
  0: {
    label: 'User',
    cls: 'border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted/60 dark:text-foreground',
  },
  14: {
    label: 'Admin',
    cls: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300',
  },
};

function privilegeLabel(priv) {
  const n = Number(priv ?? 0);
  if (n >= 14) return PRIVILEGE_MAP[14];
  return PRIVILEGE_MAP[0];
}

// ─── empty form ────────────────────────────────────────────────────────────────
const EMPTY_FORM = { pin: '', nama: '', pwd: '', rfid: '', privilege: '0' };

// ─── Field helper ──────────────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div>
      <div className="mb-1 block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
        {label} {required && <span className="text-rose-400">*</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder-slate-400 focus:border-teal-500 focus:outline-none dark:border-border dark:bg-muted dark:text-foreground dark:placeholder-slate-500',
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
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-teal-500 focus:outline-none dark:border-border dark:bg-muted dark:text-foreground"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
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
          <Button variant="outline" tone="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" tone="primary" disabled={saving}>
            {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // modal: null | { mode: 'create'|'edit'|'password', user?: User }
  const [modal, setModal] = useState(null);

  const toast = useToast();

  const {
    items: users,
    total,
    pages,
    page,
    limit: rowsPerPage,
    loading,
    error: loadError,
    setPage,
    setLimit,
    load,
    retry,
  } = usePaginatedResource({
    fetchPage: async ({ page, limit, signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) {
        params.set('search', search);
      }
      return requestJson(`/api/users?${params.toString()}`, { signal });
    },
    initialPage: 1,
    initialLimit: 20,
    dependencies: [search],
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchInput, setPage]);

  // ── save (create) ─────────────────────────────────────────────────────────────
  const handleCreate = async (payload) => {
    try {
      await requestJson('/api/users', { method: 'POST', body: JSON.stringify(payload) });
      toast.success(`User ${payload.pin} created`);
      await load({ page });
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
      await load({ page });
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
      await load({ page });
    } catch (err) {
      toast.error(err.message || 'Failed to delete user');
    }
  };

  const closeModal = () => setModal(null);

  const onSave = modal?.mode === 'create' ? handleCreate : handleSaveEdit;
  const hasRows = users.length > 0;
  const showingFrom = hasRows ? (page - 1) * rowsPerPage + 1 : 0;
  const showingTo = hasRows ? Math.min((page - 1) * rowsPerPage + users.length, total) : 0;
  const searchSummary = search ? `Filter: "${search}"` : 'Filter: all users';

  const columns = [
    {
      key: 'pin',
      header: 'PIN',
      className: 'w-28',
      render: (user) => (
        <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300">
          {user.pin}
        </span>
      ),
    },
    {
      key: 'nama',
      header: 'Name',
      render: (user) =>
        user.nama || <span className="italic text-muted-foreground">—</span>,
    },
    {
      key: 'privilege',
      header: 'Role',
      className: 'w-24',
      render: (user) => {
        const { label, cls } = privilegeLabel(user.privilege);
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              cls
            )}
          >
            <ShieldCheck className="h-3 w-3" />
            {label}
          </span>
        );
      },
    },
    {
      key: 'rfid',
      header: 'RFID',
      className: 'w-32',
      priority: 'hide',
      render: (user) =>
        user.rfid ? (
          <span className="font-mono text-xs text-muted-foreground dark:text-muted-foreground">
            {user.rfid}
          </span>
        ) : (
          <span className="italic text-muted-foreground">—</span>
        ),
    },
    {
      key: 'groups',
      header: 'Groups',
      render: (user) =>
        user.groups.length === 0 ? (
          <span className="italic text-xs text-muted-foreground">No groups</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.groups.map((g) => (
              <span
                key={g.group_id}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  g.is_approved
                    ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                )}
                title={g.is_approved ? 'Approved' : 'Pending approval'}
              >
                {g.nama_group || `Group ${g.group_id}`}
                {!g.is_approved && ' ⏳'}
              </span>
            ))}
          </div>
        ),
    },
    {
      key: 'scan_total',
      header: 'Scans',
      align: 'right',
      className: 'w-20',
      render: (user) => (
        <span className="font-mono text-xs text-muted-foreground dark:text-foreground">
          {user.scan_total.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'scan_days',
      header: 'Days',
      align: 'right',
      className: 'w-20',
      priority: 'hide',
      render: (user) => (
        <span className="font-mono text-xs text-muted-foreground dark:text-foreground">
          {user.scan_days.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'last_scan',
      header: 'Last Scan',
      className: 'w-36',
      render: (user) =>
        user.last_scan ? (
          <div className="text-xs">
            <div className="text-muted-foreground dark:text-foreground">
              {String(user.last_scan).slice(0, 10)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {String(user.last_scan).slice(11, 19) || ''}
            </div>
          </div>
        ) : (
          <span className="italic text-xs text-muted-foreground">Never</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      mobileLabel: 'Actions',
      className: 'w-28',
      render: (user) => (
        <ButtonGroup>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setModal({ mode: 'edit', user })}
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setModal({ mode: 'password', user })}
            title="Change password"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </Button>
          {user.karyawan_id && (
            <Link
              href={`/employees/${user.karyawan_id}`}
              title="Open profile report"
              className="inline-flex h-9 w-9 items-center justify-center text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Link>
          )}
          <Button
            variant="ghost"
            tone="danger"
            size="icon"
            onClick={() => handleDelete(user)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </ButtonGroup>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground dark:text-foreground">
            <Users className="h-5 w-5 text-teal-400" />
            Users
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground dark:text-muted-foreground">
            Device users from tb_user — {total} total
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <SearchInput
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
            }}
            placeholder="Search PIN, name, or RFID..."
            className="w-64"
          />

          {/* Create */}
          <Button
            variant="solid"
            tone="primary"
            onClick={() => setModal({ mode: 'create' })}
          >
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-white px-4 py-3 dark:border-border dark:bg-card">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
            Total users
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground dark:text-foreground">
            {total.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground dark:text-muted-foreground">
            From server-side pagination
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-4 py-3 dark:border-border dark:bg-card">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
            Current page
          </p>
          <p className="mt-1 text-2xl font-semibold text-foreground dark:text-foreground">
            {users.length.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground dark:text-muted-foreground">
            Page {page} / {pages}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-4 py-3 dark:border-border dark:bg-card">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
            Filter status
          </p>
          <p className="mt-1 truncate text-sm font-medium text-teal-700 dark:text-teal-300">
            {searchSummary}
          </p>
          <p className="text-[11px] text-muted-foreground dark:text-muted-foreground">
            {loading ? 'Refreshing data…' : 'Ready'}
          </p>
        </div>
      </div>

      <InlineStatusPanel message={loadError} variant="error" actionLabel="Retry" onAction={retry} />

      {/* Table */}
      <DataTable
        columns={columns}
        rows={users}
        loading={loading}
        error={loadError}
        emptyLabel={search ? 'No users found for current filter' : 'No users found'}
        rowKey="pin"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-4 py-3 text-xs text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
        <div>
          Showing {showingFrom}-{showingTo} of {total}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="users-rows">Rows</label>
          <select
            id="users-rows"
            value={rowsPerPage}
            onChange={(event) => {
              setLimit(Number(event.target.value));
              setPage(1);
            }}
            className="rounded border border-border bg-white px-2 py-1 text-muted-foreground dark:border-border dark:bg-card dark:text-foreground"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <ButtonGroup>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
            >
              Next
            </Button>
          </ButtonGroup>
          <span className="font-mono text-muted-foreground dark:text-foreground">
            {page}/{pages}
          </span>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <UserModal mode={modal.mode} user={modal.user} onClose={closeModal} onSave={onSave} />
      )}
    </div>
  );
}
