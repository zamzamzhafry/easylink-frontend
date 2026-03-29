import type { AuthContext } from '@/lib/auth-session';

export type NavAuthRequirement = 'all' | 'member' | 'schedule' | 'dashboard' | 'admin';

export function canSeeNavItem(auth: AuthContext | null, requirement: NavAuthRequirement): boolean {
  if (!auth) return requirement === 'all';
  if (auth.is_admin) return true;

  if (requirement === 'all') return true;
  if (requirement === 'member') return Boolean(auth.can_schedule || auth.can_dashboard);
  if (requirement === 'schedule') return Boolean(auth.can_schedule);
  if (requirement === 'dashboard') return Boolean(auth.can_dashboard);

  return false;
}

export function canAccessAttendance(auth: AuthContext | null): boolean {
  return Boolean(
    auth &&
    (auth.is_admin ||
      auth.can_schedule ||
      auth.can_dashboard ||
      auth.canonical_roles.includes('employee'))
  );
}

export function canManageAttendanceNotes(auth: AuthContext | null): boolean {
  return Boolean(auth && (auth.is_admin || auth.is_leader));
}

export function canAccessRawAttendance(auth: AuthContext | null): boolean {
  return Boolean(auth && auth.is_admin);
}

export function getAttendanceGroupIds(auth: AuthContext | null): number[] | null {
  if (!auth) return [];
  if (auth.is_admin) return null;

  const visibleGroupIds = auth.groups
    .filter((group) => group.can_schedule || group.can_dashboard)
    .map((group) => Number(group.group_id));

  if (visibleGroupIds.length > 0) {
    return visibleGroupIds;
  }

  if (auth.canonical_roles.includes('employee')) {
    return auth.groups.map((group) => Number(group.group_id));
  }

  return [];
}
