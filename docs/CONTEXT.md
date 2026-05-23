# CONTEXT

**Status**: Active canonical context spine  
**Last updated**: 2026-05-22

This file is primary entrypoint for future contributors and AI agents. Use it before older handoff notes or planning docs.

## What this app is

EasyLink is private-network attendance and machine-sync app built with Next.js App Router and MySQL.

- UI pages live in `app/**/page.jsx`
- API routes live in `app/api/**/route.js`
- Shared runtime logic lives in `lib/**`
- SQL migrations live at repo root as `migration*.sql`
- Machine and scanlog integration flows through `lib/easylink-sdk-client.js`

## Runtime architecture

Main request flow:

1. UI calls internal API route.
2. API route rebuilds auth context from cookie via `lib/auth-session.ts`.
3. API route queries MySQL through `lib/db.js`.
4. Machine operations call SDK adapter layer.

Deployment and ops constraints:

- network scope is private-only: LAN plus approved VPN ranges
- Next.js app currently runs on port `3000`
- Apache/PHP landing hub is planned/default human entry on port `80`
- prefer event-driven refresh with manual refresh fallback over interval polling
- do not redirect to login on generic data failure; only on confirmed auth failure

## Domain areas

### Auth and authorization

Canonical policy language:

- `admin`
- `group_leader`
- `employee`

Core auth rules:

- effective auth is rebuilt server-side from DB state; cookie is not role source of truth
- authorization is capability-driven and scope-driven, not role-name-only
- `group_leader` may exist for multiple users
- one employee group may have multiple leaders
- `admin` is not single-user elevation; multiple users may be elevated admins
- scoped group memberships plus capabilities are real policy source
- convenience booleans like `is_leader` and `is_admin` are compatibility projections, not full policy graph
- `is_leader` should be treated as compatibility shorthand; `groups[]` scope entries plus capability flags carry real policy meaning
- preserve group-scoped elevated workflows without requiring admin promotion

Current identity lanes:

- `account`
- `employee_nip`
- `legacy_pin`

Primary auth code anchors:

- `lib/auth-session.ts`
- `app/api/auth/login/route.js`
- `app/api/auth/me/route.js`
- `lib/domain/employee-auth-model.ts`
- `lib/authz/authorization-adapter.ts`

### Attendance, schedule, performance

- attendance and schedule summary views use compact date headers
- holiday metadata should stay aligned across tables and exports
- performance and attendance visibility must respect auth scope and capability checks

### Machine and scanlog integration

- do not hardcode environment-sensitive endpoints when env fallback already exists
- preserve adapter fallback behavior: `auto`, `windows-sdk`, `fingerspot-easylink-ts`
- `tb_user` acts as device-scoped mirror data; when schema has `sn`, writes must include `EASYLINK_DEVICE_SN` or explicit request `sn`

## Canonical docs map

Read in this order for current auth work:

1. `docs/CONTEXT.md`
2. `docs/agent-restrictions.md`
3. `docs/auth-domain-glossary.md`
4. `docs/adr/0001-auth-identity-resolution-and-capability-model.md`
5. `docs/hrd01-auth-elevation-hardening-review-2026-05-22.md`
6. `docs/auth-hardening-execution-plan.md`
7. `docs/project-context.md` for older detailed architectural background

Additional reference docs:

- `docs/machine-sdk-routing-and-debug.md`
- `docs/scanlog-sdk-curl-postman-reference.md`
- `docs/app-current-state-graph.md`
- `docs/graphify-app-direction.md`
- `docs/learning/role-capability-matrix.md`
- `docs/agent-context/current-project-context.md`

## Active focus now

Current active architectural focus is auth hardening after `HRD01` role-elevation incident.

Active decisions locked now:

- glossary source of truth is `docs/auth-domain-glossary.md`
- architecture anchor is `docs/adr/0001-auth-identity-resolution-and-capability-model.md`
- auth hardening review and grilling anchor is `docs/hrd01-auth-elevation-hardening-review-2026-05-22.md`
- staged implementation plan is `docs/auth-hardening-execution-plan.md`
- scoped memberships plus capabilities are preferred over convenience booleans for policy decisions
- future docs should explain many-to-many leader/group relationships and many-admin support explicitly

## Stale and historical docs rules

Use these labels consistently:

- **Active**: current source of truth
- **Reference**: useful supporting detail, but not canonical on its own
- **Historical**: closed snapshot of past work
- **Stale/Superseded**: no longer valid as planning or status truth

Rules:

- if an older handoff conflicts with this file or current ADR/docs, follow current ADR/docs and this file
- older session handoffs should not define current canonical status unless this file points back to them
- stale plans should keep history but must warn readers at top of file

## Agent working rules summary

- do not commit automatically unless explicitly requested
- do not bypass type safety with `as any`, `@ts-ignore`, or `@ts-expect-error`
- do not remove failing tests to make CI green
- do not silently change DB schema in app code without aligning migration SQL
- do not skip auth checks on protected routes
- always keep SQL parameterized
- update docs alongside changes in auth/session behavior, schema/query model, SDK contracts, or attendance/performance rules
- before wrapping up code changes, run `npm run typecheck` and `npm run build`

## Historical status note

Older session planning files under `docs/agent-context/` may still contain useful background, but they are no longer primary context spine for current auth work unless explicitly marked active here.
