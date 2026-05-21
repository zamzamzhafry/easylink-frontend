export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAuthContextFromCookies, unauthorizedResponse } from '@/lib/auth-session';

export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) {
    return unauthorizedResponse('Login required.');
  }

  // Normalized response shape regardless of auth path
  return NextResponse.json({
    ok: true,
    user: {
      pin: auth.pin,
      nama: auth.nama,
      privilege: auth.privilege,
      is_admin: auth.is_admin,
      is_hr: Boolean(auth.is_hr),
      is_leader: auth.is_leader,
      can_schedule: auth.can_schedule,
      can_dashboard: auth.can_dashboard,
      groups: auth.groups,
      canonical_roles: auth.canonical_roles,
      subject_type: auth.subject_type || null,
      account_id: auth.account_id || null,
      login_id: auth.login_id || null,
      role_key: auth.role_key || null,
      nip: auth.nip || null,
      karyawan_id: auth.karyawan_id || null,
    },
  });
}
