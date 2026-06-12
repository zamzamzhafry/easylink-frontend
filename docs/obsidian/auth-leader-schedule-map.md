---
tags:
  - obsidian
  - auth
  - leader
  - schedule
  - nip
  - pin
  - grill
---

# Auth / Leader / Schedule Map

Last updated: 2026-06-11

## Current model

Auth model supports employee, leader, and admin behavior in code, with three identity lanes.

Key files:
- `app/api/auth/login/route.js`
- `app/api/auth/me/route.js`
- `lib/auth-session.ts`
- `lib/auth-login-helpers.js`
- `lib/auth-hardening-helpers.js`
- `lib/authz/authorization-adapter.ts`
- `app/api/schedule/route.js`
- `app/api/groups/route.js`
- `app/schedule/page.jsx`

## Login identifiers (three lanes today)

Login route accepts `login_id` or `nip`. Normalized:
- `const loginId = String(result.data.login_id || result.data.nip || '').trim();`

Lanes:
- **account** — `auth_accounts(login_id, role_key)`, flags from STATIC `ACCOUNT_ROLE_COMPAT` map. SDK-dumped, 1 real row (`admin01`).
- **employee_nip** — `tb_karyawan_auth(nip)` JOIN `tb_karyawan` + `tb_karyawan_roles` for roles.
- **legacy_pin** — entirely `tb_user` (device-synced, fragile). Gated by `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK` (default TRUE).

## Schedule authority

Existing code already gates leader-only schedule edit; gates are correct, source data is the problem.

Important checks:
- `canManageSchedule(auth)` in `lib/authz/authorization-adapter.ts` = `is_admin || is_leader || can_schedule`
- `getAllowedGroupIds(auth, 'leader')` in `lib/auth-session.ts` ≈L694 (null for admin, else `groups[].filter(is_leader).map(group_id)`)
- API POST gate in `app/api/schedule/route.js` `ensureScheduleEdit()` ~L36
- `app/schedule/page.jsx` uses `canManageSchedule(currentUser)` for UI affordance

## Real problems — CONFIRMED 2026-06-11

The earlier list of "most likely runtime causes" is superseded. Live DB + code + Playwright tests confirm three actual problems:

### 1. HTTP 409 "Auth identity conflict" blocks `admin01` login

Not a password failure. Mechanism:
- `admin01` exists in BOTH `auth_accounts` AND `tb_karyawan_auth` (MySQL case-insensitive matches `ADMIN01`)
- `app/api/auth/login/route.js:57-58` forces `selectedSubjectType='account'`, then builds the NIP context anyway for collision check
- `resolveAuthenticatedLane` (`lib/auth-login-helpers.js:12`) calls `hasPrivilegeMismatch` (`lib/auth-hardening-helpers.js:56-64`) comparing 5 flags (`is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`)
- Account lane gives static admin flags; NIP lane derives `is_leader/can_schedule` from `tb_user_group_access` by PIN, but `kar9999` has `nip=NULL` and no group-access rows → flags differ → 409

### 2. BLOCKER B1 — per-group `is_leader` broadcast across all groups (live escalation)

`createAuthContextByNip` (`lib/auth-session.ts:530-545`) computes a single GLOBAL `is_leader` (L514), then passes `roleKey='scheduler'` to `buildScopedGroupAccess` if user has any leader/scheduler role. `ACCOUNT_ROLE_COMPAT.scheduler.is_leader=true` is then stamped on EVERY scoped group — including ones where the actual role row was `viewer`. A leader of group A who is also a viewer of group B becomes leader of B. `isAllowedGroup(auth, B, 'leader')` (L791) returns true → `bulk_group` schedule edit allowed on B. Exploitable today, independent of the redesign.

### 3. BLOCKER B2 — admin role with non-null `group_id` → global admin

`is_admin = roleRows.some(r => r.role_key==='admin')` (L513) ignores `group_id`. A `tb_karyawan_roles` row `(admin, group_id=7)` yields global `is_admin=true`. The CHECK preventing this exists ONLY on `cs_employee_role_bindings`, not `tb_karyawan_roles`. Must be enforced in app code.

## Proposed redesign (NIP-anchored)

Pre-grill draft was: single NIP login lane → drop `account` + `legacy_pin`; roles only from `karyawan_id`-keyed canonical tables; leader = `tb_karyawan_roles(group_leader, group_id)` with multiple per group; group-scoped schedule edit.

Oracle grill saved verdict — see [[../agent-context/oracle-auth-redesign-grill-2026-06-11]]. Key amendments:
- **Session subject = `karyawan_id`** (immutable PK), NOT mutable NIP string (avoid silent logout on HR NIP edits, mis-bind risk)
- **Drop denormalized `tb_karyawan_auth.nip`** — resolve via `tb_karyawan.nip` JOIN; one source of truth
- **Add `k.isDeleted=0`** to NIP context query (H3 revocation gap)
- **Migrate groups UI leader read+write together** in `app/api/groups/route.js` (H4 split-brain) — currently reads `tb_user_group_access.is_leader` by PIN (L88-104) and writes via PIN (assign_leader/remove_leader) — biggest non-obvious blast item
- **Keep break-glass** — DB seed/reset script for admin recovery before removing account lane
- **Stay on `tb_karyawan_roles`** for now (not `cs_*`); enforce two missing guards in app code (B1, B2)
- **Add rate-limit + CSRF** on login (H5)

## Migration sequence

1. Verify `admin01` has a `tb_karyawan` row; backfill auth + admin role; verify NIP login works while both lanes still live.
2. **Ship B1 + B2 fix immediately** — exploitable today, independent of redesign.
3. Switch session subject → `karyawan_id`; add `createAuthContextByKaryawanId`.
4. Migrate `app/api/groups/route.js` leader read+write to `tb_karyawan_roles` (read + write together).
5. Dual-run: keep account + legacy_pin lanes alive while HR backfills NIPs.
6. Backfill complete → `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=off`, remove PIN path + `tb_user_group_access` auth read.
7. Remove account branch last; add `k.isDeleted=0`, rate-limit, CSRF; zero orphaned `tb_user_group_access.is_leader`.

Effort: Large (3d+). Steps 1-2 are Short and ship-now.

## Data reality (live DB, 2026-06-11)

- `tb_karyawan`: 135 employees, **99 nip-NULL (73%)**, 36 nip-present, 128 pin-present.
- `tb_karyawan_auth`: nip NOT NULL UNIQUE → blocks 73% of staff until NIP backfilled.
- `tb_karyawan_roles`: 1 row only (kar9999=admin, group_id=NULL). Enum: admin/hr/group_leader/scheduler/viewer.
- `tb_employee_group`: PK=karyawan_id → 1 group per employee.
- `tb_user_group_access`: 4 leader rows (pin82→grp2, pin65→grp7, pin17→grp9, pin99→grp9). **Group 9 already has 2 leaders → multi-leader pattern works today**.
- 3 of 4 current leaders are NIP-null (pin82/65/17). 4th (pin99 → kar108 Arum) has nip 20250700001.

NIP backfill lists for human action:
- [[../agent-context/leaders-missing-nip-2026-06-11]] (3 leaders)
- [[../agent-context/employees-missing-nip-2026-06-11]] (99 employees)

## Required evidence for failing account (still valid)

Capture `/api/auth/me` JSON and review:
- `login_id`, `nip`, `role_key`, `is_leader`, `can_schedule`, `can_dashboard`, `groups`, `canonical_roles`

Also capture any `403` body from `/api/schedule` or `409` from `/api/auth/login`.

## Related notes

- [[../agent-context/oracle-auth-redesign-grill-2026-06-11]]
- [[qa-review-checklist]]
- [[attendance-performance-fixes]]
- [[../human-handoff-pull-rebuild-sync]]

## Backlinks

- [[index]]
