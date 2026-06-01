# Session Handoff - 2026-05-12 - Network, Refresh, VM Landing

This note captures the current operational direction for the Linux VM deployment and the agreed app-behavior constraints.

## Locked product/ops decisions

- Access scope is private-only: local network plus approved VPN ranges.
- Default refresh model is event-driven invalidation plus manual refresh fallback.
- Primary backend target is P95 API latency under 500 ms for hot endpoints.
- App should not redirect to login on generic data failures; only on confirmed auth failures.

## Findings from live VM review

- The original auth rate limiter was too broad because it covered all `/api/auth/*` requests, including frequent `/api/auth/me` checks.
- This created false lockout behavior under normal page churn and made the app appear to kick users back to login.
- `app/api/schedule/route.js` had a MySQL `ONLY_FULL_GROUP_BY` incompatibility on the VM and needed a stricter grouping-safe projection.
- The Linux VM currently serves the Next.js app on port `3000`.
- The VM now holds a 1:1 clone of the local `demo_easylinksdk` database for realistic smoke testing.

## Current architecture direction

- Keep private app access behind LAN/VPN controls at network edge.
- Reduce page-mount fan-out calls where possible.
- Move hot pages toward composed reads, cache, and invalidate-on-change.
- Use loading states that preserve layout and prior data when refreshing.
- Build a landing hub on port `80` for human entry and future multi-app expansion.

## Known operational concerns

- The Next.js app still runs in dev mode on the VM because production build is blocked by remote font fetch behavior.
- Future stabilization should self-host or remove remote font dependency for production build reliability.
- Existing server-side logs showed pages such as groups, schedule, performance, and users are sensitive to schema drift and should be checked against the imported local DB.

## Required follow-up behavior

- Treat `ops/landing-page/` as source of truth for the Apache/PHP app hub.
- Treat this repo as the source of truth for future app cards and landing content.
- Keep docs in sync when changing auth/session, cache/refresh model, or server landing topology.
