'use client';

import { ChevronDown, ChevronRight, UserMinus, Users } from 'lucide-react';

function memberCountByGroup(members, groupId) {
  return members.filter((member) => member.group_id === groupId).length;
}

function membersByGroup(members, groupId) {
  return members.filter((member) => member.group_id === groupId);
}

export default function GroupsList({
  loading,
  groups,
  members,
  unassigned,
  expanded,
  assigning,
  onToggle,
  onAssignSelection,
  onAssign,
  onRemove,
}) {
  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">Loading...</div>;
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
        No groups yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const expandedGroup = expanded[group.id];
        const groupedMembers = membersByGroup(members, group.id);

        return (
          <div key={group.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <button
              type="button"
              onClick={() => onToggle(group.id)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-800/50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15">
                <Users className="h-4 w-4 text-teal-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-white">{group.nama_group}</div>
                {group.deskripsi && <div className="mt-0.5 text-xs text-slate-500">{group.deskripsi}</div>}
              </div>
              <span className="mr-2 text-xs font-mono text-slate-500">
                {memberCountByGroup(members, group.id)} members
              </span>
              {expandedGroup ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
            </button>

            {expandedGroup && (
              <div className="border-t border-slate-800">
                {groupedMembers.length === 0 ? (
                  <p className="px-5 py-4 text-xs italic text-slate-600">
                    No members yet. Assign from the selector below.
                  </p>
                ) : (
                  groupedMembers.map((member) => (
                    <div
                      key={member.karyawan_id}
                      className="flex items-center gap-3 border-b border-slate-800/50 px-5 py-2.5 last:border-0 hover:bg-slate-800/30"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-300">
                        {member.nama?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-white">{member.nama}</div>
                        <div className="font-mono text-xs text-slate-600">PIN: {member.pin}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(member.karyawan_id)}
                        className="p-1 text-slate-600 transition-colors hover:text-rose-400"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}

                {unassigned.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/50 px-5 py-3">
                    <span className="text-xs text-slate-600">Add:</span>
                    <select
                      value={assigning[group.id] ?? ''}
                      onChange={(event) => onAssignSelection(group.id, event.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:border-teal-500 focus:outline-none"
                    >
                      <option value="">- select employee -</option>
                      {unassigned.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.nama} (PIN: {employee.pin})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onAssign(group.id)}
                      className="rounded-lg border border-teal-500/30 bg-teal-500/20 px-3 py-1 text-xs text-teal-400 transition-colors hover:bg-teal-500/30"
                    >
                      Assign
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
