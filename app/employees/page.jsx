'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import SearchInput from '@/components/ui/search-input';
import EditEmployeeModal from '@/components/employees/edit-employee-modal';
import EmployeesTable from '@/components/employees/employees-table';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';
import { PAGE_SIZE_OPTIONS } from '@/lib/constants';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';

export default function EmployeesPage() {
  const { success, warning } = useToast();
  const { locale } = useAppLocale();
  const t = (path) => getUIText(path, locale);
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesData, usersData] = await Promise.all([
        requestJson('/api/employees'),
        requestJson('/api/employees/users'),
      ]);
      setRows(Array.isArray(employeesData) ? employeesData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (error) {
      warning(error.message || 'Failed to fetch employees.', 'Employees request failed');
    } finally {
      setLoading(false);
    }
  }, [warning]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase();
    return rows
      .filter((employee) => {
        const statusMatch =
          statusFilter === 'all'
            ? true
            : statusFilter === 'active'
              ? Boolean(employee.isActiveDuty)
              : !Boolean(employee.isActiveDuty);
        if (!statusMatch) return false;

        return (
          (employee.nama_karyawan ?? '').toLowerCase().includes(query) ||
          (employee.nama_user ?? '').toLowerCase().includes(query) ||
          (employee.pin ?? '').toLowerCase().includes(query) ||
          (employee.nip ?? '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const getName = (item) => String(item.nama_karyawan || item.nama_user || '').toLowerCase();
        const getPin = (item) => String(item.pin || '').toLowerCase();
        const getNip = (item) => String(item.nip || '').toLowerCase();

        const lhs = sortKey === 'pin' ? getPin(a) : sortKey === 'nip' ? getNip(a) : getName(a);
        const rhs = sortKey === 'pin' ? getPin(b) : sortKey === 'nip' ? getNip(b) : getName(b);

        if (lhs === rhs) return 0;
        if (sortDir === 'asc') return lhs > rhs ? 1 : -1;
        return lhs < rhs ? 1 : -1;
      });
  }, [rows, search, statusFilter, sortKey, sortDir]);

  const pages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / rowsPerPage)),
    [filteredRows.length, rowsPerPage]
  );
  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const unlinkedCount = useMemo(
    () =>
      rows.filter((employee) => !employee.nama_karyawan || employee.nama_karyawan.trim() === '')
        .length,
    [rows]
  );

  const saveEmployee = async (form) => {
    if (!editing) return false;

    try {
      await requestJson(`/api/employees/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      await load();
      success('Employee data has been updated.', 'Saved');
      return true;
    } catch (error) {
      warning(error.message || 'Failed to update employee.', 'Unable to save changes');
      return false;
    }
  };

  const createEmployee = async (form) => {
    try {
      await requestJson('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      await load();
      success('Employee has been added.', 'Created');
      return true;
    } catch (error) {
      warning(error.message || 'Failed to create employee.', 'Unable to create employee');
      return false;
    }
  };

  const deleteEmployee = async (employee) => {
    try {
      await requestJson(`/api/employees/${employee.id}`, { method: 'DELETE' });
      await load();
      success(
        `Employee ${employee.nama_karyawan || employee.pin || employee.id} was deleted.`,
        'Soft deleted'
      );
    } catch (error) {
      warning(error.message || 'Failed to delete employee.', 'Unable to delete employee');
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">
            {t('employeesPage.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold text-foreground">{t('employeesPage.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('employeesPage.description')}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-foreground">{rows.length}</div>
          <div className="text-xs text-muted-foreground">{t('employeesPage.totalRecords')}</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-teal-400"
        >
          <Plus className="h-4 w-4" />
          {t('employeesPage.addEmployee')}
        </button>
      </div>

      {unlinkedCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              {unlinkedCount} {unlinkedCount > 1 ? t('employeesPage.unlinkedMany') : t('employeesPage.unlinkedOne')}
            </p>
            <p className="mt-0.5 text-xs text-amber-400/70">
              {t('employeesPage.unlinkedDesc')}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-4">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('employeesPage.searchPlaceholder')}
          className="md:col-span-2"
        />
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          <option value="all">{t('employeesPage.dutyAll')}</option>
          <option value="active">{t('employeesPage.dutyActive')}</option>
          <option value="inactive">{t('employeesPage.dutyInactive')}</option>
        </select>
        <div className="flex gap-2">
          <select
            value={sortKey}
            onChange={(event) => {
              setSortKey(event.target.value);
              setPage(1);
            }}
            className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            <option value="name">{t('employeesPage.sortName')}</option>
            <option value="pin">{t('employeesPage.sortPin')}</option>
            <option value="nip">{t('employeesPage.sortNip')}</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground"
          >
            {sortDir === 'asc' ? 'ASC' : 'DESC'}
          </button>
        </div>
      </div>

      <EmployeesTable
        loading={loading}
        rows={pagedRows}
        onEdit={setEditing}
        onDelete={deleteEmployee}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <div>
          {t('employeesPage.pagerShowing')} {(page - 1) * rowsPerPage + 1}-{Math.min(page * rowsPerPage, filteredRows.length)}{' '}
          {t('employeesPage.pagerOf')} {filteredRows.length}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="employees-rows">{t('employeesPage.rows')}</label>
          <select
            id="employees-rows"
            value={rowsPerPage}
            onChange={(event) => setRowsPerPage(Number(event.target.value))}
            className="rounded border border-border bg-card px-2 py-1 text-foreground"
          >
            {PAGE_SIZE_OPTIONS.filter((size) => size <= 50).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded border border-border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('employeesPage.prev')}
          </button>
          <span className="font-mono text-foreground">
            {page}/{pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="rounded border border-border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('employeesPage.next')}
          </button>
        </div>
      </div>

      {creating && (
        <EditEmployeeModal
          mode="create"
          users={users}
          onClose={() => setCreating(false)}
          onSave={createEmployee}
        />
      )}

      {editing && (
        <EditEmployeeModal
          mode="edit"
          employee={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSave={saveEmployee}
        />
      )}
    </div>
  );
}
