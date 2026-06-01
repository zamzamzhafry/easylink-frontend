import { NextRequest, NextResponse } from 'next/server';

// ─── Rate Limiting (in-memory, per-IP) ───────────────────────────────────────
// Suitable for single-instance deployments. For multi-instance, use Redis.

type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitEntry>();
let cleanupInterval: NodeJS.Timeout | null = null;


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

export function evaluateRateLimit(key: string, maxRequests: number, now = Date.now()) {
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    const next = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(key, next);
    return { limited: false, count: next.count, resetAt: next.resetAt, remaining: Math.max(0, maxRequests - next.count) };
  }

  entry.count += 1;
  return {
    limited: entry.count > maxRequests,
    count: entry.count,
    resetAt: entry.resetAt,
    remaining: Math.max(0, maxRequests - Math.min(entry.count, maxRequests)),
  };
}

function cleanupExpiredRateLimitEntries(now = Date.now()) {
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

function ensureRateLimitCleanupInterval() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    cleanupExpiredRateLimitEntries();
  }, 5 * 60_000);
  cleanupInterval.unref?.();
}

// ─── Security Headers ────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // X-XSS-Protection intentionally omitted: modern browsers ignore it and CSP is the supported mitigation.
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

function rateLimitHeaders(rateLimit: { resetAt: number; remaining: number }) {
  const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));

  return {
    'RateLimit-Reset': String(rateLimit.resetAt),
    'RateLimit-Remaining': String(rateLimit.remaining),
    'Retry-After': String(retryAfterSeconds),
  };
}

export function middleware(request: NextRequest) {
  ensureRateLimitCleanupInterval();
  const { pathname } = request.nextUrl;
  const ip = getClientIp(request);

  // ── Rate limiting for auth endpoints ──
  if (pathname.startsWith('/api/auth/')) {
    const key = `auth:${ip}`;
    const authLimit = evaluateRateLimit(key, RATE_LIMIT_MAX_AUTH);
    if (authLimit.limited) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Too many requests. Try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...rateLimitHeaders(authLimit),
          },
        }
      );
    }
  }

  // ── Rate limiting for all API endpoints ──
  if (pathname.startsWith('/api/')) {
    const key = `api:${ip}`;
    const apiLimit = evaluateRateLimit(key, RATE_LIMIT_MAX_API);
    if (apiLimit.limited) {
      return new NextResponse(
        JSON.stringify({ ok: false, error: 'Rate limit exceeded. Try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...rateLimitHeaders(apiLimit),
          },
        }
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
