'use client';

import { ChevronDown, ChevronRight, Crown, Pencil, Trash2, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';

const DEFAULT_VISIBLE_MEMBERS = 24;

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
  leaders,
  leaderCandidates,
  expanded,
  assigning,
  assigningLeader,
  onToggle,
  onAssignSelection,
  onAssignLeaderSelection,
  onAssign,
  onAssignLeader,
  onRemoveLeader,
  onRemove,
  onEditGroup,
  onDeleteGroup,
}) {
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = (path) => getUIText(path, resolvedLocale);
  const [visibleMembersByGroup, setVisibleMembersByGroup] = useState({});

  const growVisibleMembers = (groupId, totalCount) => {
    setVisibleMembersByGroup((previous) => {
      const current = previous[groupId] ?? DEFAULT_VISIBLE_MEMBERS;
      return {
        ...previous,
        [groupId]: Math.min(totalCount, current + DEFAULT_VISIBLE_MEMBERS),
      };
    });
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t('groupsList.loading')}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="ui-card-shell rounded-xl p-8 text-center text-sm text-muted-foreground">
        {t('groupsList.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const expandedGroup = expanded[group.id];
        const groupedMembers = membersByGroup(members, group.id);
        const groupLeaders = leaders.filter(
          (leader) => Number(leader.group_id) === Number(group.id)
        );
        const leaderOptions = leaderCandidates.filter(
          (candidate) => Number(candidate.group_id) === Number(group.id)
        );
        const memberVisibleCount = visibleMembersByGroup[group.id] ?? DEFAULT_VISIBLE_MEMBERS;
        const visibleMembers = groupedMembers.slice(0, memberVisibleCount);
        const hasMoreMembers = groupedMembers.length > visibleMembers.length;

        return (
          <div key={group.id} className="ui-card-shell overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => onToggle(group.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/60"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                  <Users className="h-4 w-4 text-teal-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">{group.nama_group}</div>
                  {group.deskripsi && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {group.deskripsi}
                    </div>
                  )}
                </div>
                <span className="mr-2 text-xs font-mono text-muted-foreground">
                  {memberCountByGroup(members, group.id)} {t('groupsList.members')}
                </span>
                {expandedGroup ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onEditGroup(group)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                title={t('groupsList.actions.editGroup')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteGroup(group)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-rose-300"
                title={t('groupsList.actions.deleteGroup')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {expandedGroup && (
              <div className="border-t border-border">
                {groupedMembers.length === 0 ? (
                  <p className="px-5 py-4 text-xs italic text-muted-foreground">
                    {t('groupsList.noMembers')}
                  </p>
                ) : (
                  visibleMembers.map((member) => (
                    <div
                      key={member.karyawan_id}
                      className="flex items-center gap-3 border-b border-border/70 px-5 py-2.5 last:border-0 hover:bg-muted/50"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                        {member.nama?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-foreground">{member.nama}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          PIN: {member.pin} · {t('groupsList.privilege')}: {member.privilege ?? 0}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(member.karyawan_id)}
                        className="p-1 text-muted-foreground transition-colors hover:text-rose-400"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
                {hasMoreMembers && (
                  <div className="border-t border-border/70 px-5 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => growVisibleMembers(group.id, groupedMembers.length)}
                      className="ui-btn-secondary min-h-0 px-2.5 py-1 text-xs"
                    >
                      {t('groupsList.actions.showMoreMembers')}
                    </button>
                  </div>
                )}

                <div className="border-t border-border/70 px-5 py-3">
                  <div className="mb-2 flex items-center gap-2 text-xs text-amber-300">
                    <Crown className="h-3.5 w-3.5" /> {t('groupsList.leaders.title')}
                  </div>
                  {groupLeaders.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      {t('groupsList.leaders.empty')}
                    </p>
                  ) : (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {groupLeaders.map((leader) => (
                        <span
                          key={`${group.id}-${leader.pin}`}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200"
                        >
                          {leader.nama || `PIN ${leader.pin}`} · PIN {leader.pin}
                          <button
                            type="button"
                            onClick={() => onRemoveLeader(group.id, leader.pin)}
                            className="rounded px-1 text-amber-100 hover:bg-amber-500/20"
                            title={t('groupsList.actions.removeLeader')}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {leaderOptions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={assigningLeader[group.id] ?? ''}
                        onChange={(event) => onAssignLeaderSelection(group.id, event.target.value)}
                        className="ui-control-select min-h-0 min-w-0 flex-1 px-2 py-1 text-xs"
                      >
                        <option value="">{t('groupsList.leaders.selectCandidate')}</option>
                        {leaderOptions.map((employee) => (
                          <option key={`${group.id}-${employee.pin}`} value={employee.pin}>
                            {employee.nama_karyawan} (PIN: {employee.pin}, privilege:{' '}
                            {employee.privilege ?? 0})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => onAssignLeader(group.id)}
                        className="rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-500/30"
                      >
                        {t('groupsList.actions.setLeader')}
                      </button>
                    </div>
                  )}
                </div>

                {unassigned.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-5 py-3">
                    <span className="text-xs text-muted-foreground">
                      {t('groupsList.addLabel')}
                    </span>
                    <select
                      value={assigning[group.id] ?? ''}
                      onChange={(event) => onAssignSelection(group.id, event.target.value)}
                      className="ui-control-select min-h-0 min-w-0 flex-1 px-2 py-1 text-xs"
                    >
                      <option value="">{t('groupsList.selectEmployee')}</option>
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
                      {t('groupsList.actions.assign')}
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
