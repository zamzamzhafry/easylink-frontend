export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAuthContextFromCookies, unauthorizedResponse } from '@/lib/auth-session';
import { buildNormalizedAuthUser } from '@/lib/auth-hardening-helpers';

export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) {
    return unauthorizedResponse('Login required.');
  }

  // Normalized response shape regardless of auth path
  return NextResponse.json({
    ok: true,
    user: buildNormalizedAuthUser(auth),
  });
}
