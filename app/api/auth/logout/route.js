export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth-session';

function handleLogout() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}

export async function POST() {
  return handleLogout();
}

export async function DELETE() {
  return handleLogout();
}


