'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import CreateGroupModal from '@/components/groups/create-group-modal';
import GroupsList from '@/components/groups/groups-list';
import UnassignedPanel from '@/components/groups/unassigned-panel';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';

export default function GroupsPage() {
  const { warning } = useToast();
  const [data, setData] = useState({
    groups: [],
    members: [],
    unassigned: [],
    leaders: [],
    leader_candidates: [],
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [assigning, setAssigning] = useState({});
  const [assigningLeader, setAssigningLeader] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson('/api/groups');
      setData(
        result ?? { groups: [], members: [], unassigned: [], leaders: [], leader_candidates: [] }
      );
    } catch (error) {
      warning(error.message || 'Failed to fetch groups.', 'Groups request failed');
    } finally {
      setLoading(false);
    }
  }, [warning]);

  useEffect(() => {
    load();
  }, [load]);

  const createGroup = async ({ name, description }) => {
    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_group', nama_group: name, deskripsi: description }),
      });
      await load();
      return true;
    } catch (error) {
      warning(error.message || 'Failed to create group.', 'Unable to create group');
      return false;
    }
  };

  const updateGroup = async ({ name, description }) => {
    if (!editing) return false;
    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_group',
          id: editing.id,
          nama_group: name,
          deskripsi: description,
        }),
      });
      await load();
      return true;
    } catch (error) {
      warning(error.message || 'Failed to update group.', 'Unable to update group');
      return false;
    }
  };

  const assignEmployee = async (groupId) => {
    const selectedId = assigning[groupId];
    if (!selectedId) {
      warning('Choose an employee first before assigning.', 'Assignment warning');
      return;
    }

    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          karyawan_id: Number(selectedId),
          group_id: groupId,
        }),
      });
      setAssigning((prev) => ({ ...prev, [groupId]: '' }));
      await load();
    } catch (error) {
      warning(error.message || 'Failed to assign employee.', 'Unable to assign employee');
    }
  };

  const removeEmployee = async (employeeId) => {
    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', karyawan_id: employeeId }),
      });
      await load();
    } catch (error) {
      warning(error.message || 'Failed to remove employee from group.', 'Unable to remove member');
    }
  };

  const assignLeader = async (groupId) => {
    const pin = assigningLeader[groupId];
    if (!pin) {
      warning('Choose a leader candidate first.', 'Leader assignment warning');
      return;
    }
    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_leader', group_id: groupId, pin }),
      });
      setAssigningLeader((prev) => ({ ...prev, [groupId]: '' }));
      await load();
    } catch (error) {
      warning(error.message || 'Failed to assign leader.', 'Unable to assign leader');
    }
  };

  const removeLeader = async (groupId, pin) => {
    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_leader', group_id: groupId, pin }),
      });
      await load();
    } catch (error) {
      warning(error.message || 'Failed to remove leader.', 'Unable to remove leader');
    }
  };

  const deleteGroup = async (group) => {
    if (!window.confirm(`Delete group "${group.nama_group}"? Members will become unassigned.`))
      return;
    try {
      await requestJson('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_group', id: group.id }),
      });
      await load();
    } catch (error) {
      warning(error.message || 'Failed to delete group.', 'Unable to delete group');
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-teal-400">
            Organization
          </p>
          <h1 className="text-3xl font-bold text-white">Employee Groups</h1>
          <p className="mt-1 text-sm text-slate-400">
            Organize employees into groups for bulk scheduling
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400"
        >
          <Plus className="h-4 w-4" /> New Group
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <GroupsList
            loading={loading}
            groups={data.groups}
            members={data.members}
            unassigned={data.unassigned}
            leaders={data.leaders ?? []}
            leaderCandidates={data.leader_candidates ?? []}
            expanded={expanded}
            assigning={assigning}
            assigningLeader={assigningLeader}
            onToggle={(groupId) => setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }))}
            onAssignSelection={(groupId, employeeId) =>
              setAssigning((prev) => ({ ...prev, [groupId]: employeeId }))
            }
            onAssignLeaderSelection={(groupId, pin) =>
              setAssigningLeader((prev) => ({ ...prev, [groupId]: pin }))
            }
            onAssign={assignEmployee}
            onAssignLeader={assignLeader}
            onRemoveLeader={removeLeader}
            onRemove={removeEmployee}
            onEditGroup={(group) => setEditing(group)}
            onDeleteGroup={deleteGroup}
          />
        </div>
        <UnassignedPanel rows={data.unassigned} />
      </div>

      {creating && <CreateGroupModal onClose={() => setCreating(false)} onCreate={createGroup} />}
      {editing && (
        <CreateGroupModal
          title="Edit Group"
          submitLabel="Save"
          initialName={editing.nama_group || ''}
          initialDescription={editing.deskripsi || ''}
          onClose={() => setEditing(null)}
          onCreate={async (payload) => {
            const ok = await updateGroup(payload);
            if (ok) setEditing(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}
