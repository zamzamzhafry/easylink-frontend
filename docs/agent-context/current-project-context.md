# Current Project Context

EasyLink is a Next.js 14 App Router frontend for attendance and machine-sync workflows.

## Architecture

- UI pages live in `app/**/page.jsx`.
- API routes live in `app/api/**/route.js`.
- Shared runtime logic lives in `lib/**`.
- SQL migrations live at the repo root as `migration*.sql`.

## Core flows

- UI calls internal API routes.
- API routes enforce auth/capability checks from `lib/auth-session.ts`.
- MySQL access uses the pooled client in `lib/db.js`.
- Machine and scanlog operations use `lib/easylink-sdk-client.js` with adapter fallback support.

## Key docs to read first

- `docs/project-context.md`
- `docs/agent-restrictions.md`
- `docs/machine-sdk-routing-and-debug.md`
- `docs/scanlog-sdk-curl-postman-reference.md`

## Practical notes

- Preserve auth checks and parameterized SQL.
- Do not hardcode SDK endpoints if env-based fallback already exists.
- Update docs alongside behavior changes in auth, schema, or SDK integration.
- Run `npm run typecheck` and `npm run build` before wrapping up.
- Production-like builds require runtime env vars; copy `.env.example` into `.env` or `.env.local` before `npm run build`.
- Managed user state now spans `auth_accounts`, `tb_karyawan_auth`, canonical `cs_*` identity tables, and `tb_user` machine mirror rows.
- Treat `tb_user` as device-scoped mirror data; when schema has `sn`, writes must include `EASYLINK_DEVICE_SN` or explicit request `sn`.
- Private deployment shape is now split:
  - Next.js app on port `3000`
  - Apache/PHP landing hub planned as default port `80`
  - LAN + approved VPN only

## Active refactor context (April 2026)

- Quick Summaries views/exports are moving to compact date headers: `DD + short day` (for example `01 Sen`).
- Attendance and Schedule quick-summary tables use holiday metadata (`holidayMap`) for column coloring and holiday-name hints.
- Schedule template imports now need to tolerate compact date headers and optional helper columns (for example `Total Jam (Formula)`) while still resolving canonical ISO dates for writes.
- PDF exports for schedule/quick summaries should prefer landscape with minimal margins to fit month-wide date columns.
