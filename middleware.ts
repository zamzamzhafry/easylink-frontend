import { NextRequest, NextResponse } from 'next/server';

// ─── Rate Limiting (in-memory, per-IP) ───────────────────────────────────────
// Suitable for single-instance deployments. For multi-instance, use Redis.

type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_AUTH = 30; // max 30 auth attempts per minute
const RATE_LIMIT_MAX_API = 120; // max 120 API calls per minute

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function isRateLimited(key: string, maxRequests: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > maxRequests;
}

// Periodic cleanup to prevent memory leak (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60_000);

// ─── Security Headers ────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Only add HSTS in production
const isProduction = process.env.NODE_ENV === 'production';

// ─── CSRF Origin Validation ──────────────────────────────────────────────────

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  // No origin header (same-origin requests from some browsers, or non-browser clients)
  if (!origin) return true;

  // Compare origin host with request host
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request);

  // ── Rate limiting for auth endpoints ──
  if (pathname.startsWith('/api/auth/')) {
    const key = `auth:${ip}`;
    if (isRateLimited(key, RATE_LIMIT_MAX_AUTH)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Too many requests. Try again later.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }
  }

  // ── Rate limiting for all API endpoints ──
  if (pathname.startsWith('/api/')) {
    const key = `api:${ip}`;
    if (isRateLimited(key, RATE_LIMIT_MAX_API)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Rate limit exceeded. Try again later.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    // ── CSRF origin validation for mutating API requests ──
    if (MUTATING_METHODS.has(request.method) && !isValidOrigin(request)) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Invalid request origin.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ── Continue with security headers ──
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  if (isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

// ─── Matcher: Apply to all routes except static assets ───────────────────────

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
