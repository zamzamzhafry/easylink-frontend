# Task 1 — Successful Auth Network Traces (RESOLVED)

Captured: 2026-06-06, dev server `http://localhost:3000`, DB `demo_easylinksdk` (localhost:3306).

## Unblock Summary
- Root blocker was environment/data, not repo code.
- Fix applied (no repo source change):
  1. Started MySQL (XAMPP) on `localhost:3306`.
  2. Applied additive canonical schema `migration_v3_clean_slate_schema.sql` (creates `cs_*` tables; non-destructive, `CREATE TABLE IF NOT EXISTS`).
  3. Reseeded official fixtures via `node scripts/seed-v3-role-fixtures.mjs --execute`.
- Working fixtures (password `password` for all):
  - `admin001` (account/admin lane)
  - `leader001` (employee NIP lane, group leader)
  - `employee001` (employee NIP lane, plain employee)

## Why `ADMIN01 / Admin@123` could never work
- `Admin@123` matches neither stored bcrypt hash (offline `bcrypt.compare` = false for both `auth_accounts.admin01` and `tb_karyawan_auth.ADMIN01`).
- `ADMIN01`/`admin01` is a permanently collided identifier: it exists in BOTH `auth_accounts` (admin) and `tb_karyawan_auth` (employee). The Task 6 mismatch guard (`hasPrivilegeMismatch`) fires -> `409 Auth identity conflict` by design. No password can clean-login that identifier pair.
- The repo-sanctioned fixtures (`admin001`/`leader001`/`employee001`) have NO `auth_accounts` counterpart, so they route cleanly with no collision.

## Successful Account Login Trace (admin001)
- `POST /api/auth/login` body `{"login_id":"admin001","password":"password"}` -> `200`
  - `set-cookie: easylink_session=...; HttpOnly; SameSite=lax; Max-Age=43200`
  - body `{"ok":true,"user":{"pin":"admin001","is_admin":true,"privilege":4,"subject_type":"employee_nip","canonical_roles":["admin","employee"],...}}`
- `GET /api/auth/me` (with session cookie) -> `200`
  - `user.nama="Seed Admin 001"`, `is_leader=false`
- No `429` in success path.

## Successful Employee NIP Login Trace (employee001)
- `POST /api/auth/login` body `{"nip":"employee001","password":"password"}` -> `200`
  - body `{"ok":true,"user":{"pin":"employee001","is_admin":false,"is_leader":false,"groups":[{"group_id":32,"nama_group":"Role Fixture Auth Group",...}],"subject_type":"employee_nip",...}}`
- `GET /api/auth/me` (with session cookie) -> `200`
  - `user.nama="Seed Employee 001"`, `is_leader=false`
- No `429` in success path.

## Group Leader Auth Proof (leader001)
- `POST /api/auth/login` body `{"nip":"leader001","password":"password"}` -> `200`
  - body `{"ok":true,"user":{"pin":"leader001","is_leader":true,"can_schedule":true,"can_dashboard":true,"groups":[{"group_id":32,"nama_group":"Role Fixture Auth Group","is_leader":true}],"canonical_roles":["group_leader","employee"],...}}`
- `GET /api/auth/me` (with session cookie) -> `200`, `is_leader=true`.

### Group leader model (source of truth)
- Fixture defined in `scripts/seed-v3-role-fixtures.mjs`: `leader001`, `legacyRole/canonicalRole='group_leader'`, `assignGroup='Role Fixture Auth Group'`, `needsLeaderAccess=true`.
- Leader privilege is derived, not stored on the auth row:
  - `lib/auth-session.ts:514` -> `is_leader` from `tb_karyawan_roles.role_key in ('group_leader','scheduler')`.
  - `lib/auth-session.ts:548` -> fallback to `tb_user_group_access` (`is_leader/can_schedule/can_dashboard`).
- Seeder writes `tb_karyawan_roles`, `tb_user_group_access`, plus canonical `cs_employee_role_bindings` / `cs_group_ownership`.

## Failing / 429 Path (previously captured, still valid)
- First auth `429` occurs on `GET /api/auth/me` at ~request 30 from same browser/IP (middleware `RATE_LIMIT_MAX_AUTH = 30`/min/IP in `middleware.ts:84-92`).
- Root-cause class: client fanout / unauthenticated session-hydration churn (invalid session loop), NOT successful login flow.
- Mitigation already shipped: `hooks/use-auth-session.js` adds `sessionStorage` cache + inflight de-dupe to bound `/api/auth/me` calls across remounts; no rate-limit loosening applied.

## Acceptance Mapping
- [x] Successful account login trace: admin001 above.
- [x] Successful employee NIP login trace: employee001 (and leader001) above.
- [x] Failing/429 path with exact first-429 route: `GET /api/auth/me`.
- [x] Root-cause hypothesis with proof: client fanout / invalid session loop on `/api/auth/me`.
