export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAuthContextFromCookies, unauthorizedResponse } from '@/lib/auth-session';

export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) {
    return unauthorizedResponse('Login required.');
  }
  return NextResponse.json({ ok: true, user: auth });
}


