'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, Search } from 'lucide-react';
import EditEmployeeModal from '@/components/employees/edit-employee-modal';
import EmployeesTable from '@/components/employees/employees-table';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';

export default function EmployeesPage() {
  const { success, warning } = useToast();
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

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
    return rows.filter((employee) => {
      return (
        (employee.nama_karyawan ?? '').toLowerCase().includes(query) ||
        (employee.nama_user ?? '').toLowerCase().includes(query) ||
        (employee.pin ?? '').toLowerCase().includes(query) ||
        (employee.nip ?? '').toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  const unlinkedCount = useMemo(
    () => rows.filter((employee) => !employee.nama_karyawan || employee.nama_karyawan.trim() === '').length,
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
      success(`Employee ${employee.nama_karyawan || employee.pin || employee.id} was deleted.`, 'Soft deleted');
    } catch (error) {
      warning(error.message || 'Failed to delete employee.', 'Unable to delete employee');
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">Management</p>
          <h1 className="text-3xl font-bold text-white">Employees</h1>
          <p className="mt-1 text-sm text-slate-400">
            Link device users (tb_user) to employee records (tb_karyawan)
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-white">{rows.length}</div>
          <div className="text-xs text-slate-500">total records</div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400"
        >
          <Plus className="h-4 w-4" />
          Add Employee
        </button>
      </div>

      {unlinkedCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              {unlinkedCount} employee{unlinkedCount > 1 ? 's' : ''} without a real name
            </p>
            <p className="mt-0.5 text-xs text-amber-400/70">
              These users were registered on the device but have not been linked to a full name yet.
            </p>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, PIN, or NIP..."
          className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-600 transition-colors focus:border-teal-500 focus:outline-none"
        />
      </div>

      <EmployeesTable
        loading={loading}
        rows={filteredRows}
        onEdit={setEditing}
        onDelete={deleteEmployee}
      />

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
