export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth-session';

function handleLogout(request) {
  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response, request);
  return response;
}

export async function POST(request) {
  return handleLogout(request);
}

export async function DELETE(request) {
  return handleLogout(request);
}


