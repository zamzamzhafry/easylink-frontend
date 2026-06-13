# Completed Work — 10 Tasks Shipped (Uncommitted)

All changes are working-tree only. No commits made this session. Gates: `npm run typecheck`
(tsc --noEmit) clean on all; tests via `node --import tsx --env-file=.env --test`.

---

## Wave 0 — Preflight (T1–T3)

| Task | Output |
|---|---|
| **T1** Preflight SQL audit | Surfaced the 3 plan-breaking facts (see `04-db-ground-truth.md`). Evidence: `.omo/evidence/auth-nip/task-1-preflight.txt` |
| **T2** Session payload shape | Token wire `<base64url-JSON>.<HMAC-SHA256>`, fields `sub/st/exp/v`. TTL `43200s` (12h). 3-stage decode waterfall. Evidence: `.omo/evidence/auth-nip/task-2-payload-shape.md` |
| **T3** QA harness + decisions | `.omo/evidence/auth-nip/qa-harness.sh` (curl login helper). Locked M1=BAN+migrate, placeholder=BLOCK |

---

## Wave 1 — Independent hardening (T5, T6, T7)

### T5 — Role-change audit (M3)
- Migration `scripts/migration-task-5-role-change-audit.sql`: additive `tb_role_change_audit`
  (id, actor_karyawan_id, target_karyawan_id, action ENUM('grant','revoke'), role_key, group_id, created_at).
- `lib/auth-audit.ts` → `recordRoleChange(...)`, parameterized INSERT, tx-safe optional executor.
- Wired into `app/api/groups/route.js` assign_leader (grant) + remove_leader (revoke).
- Verified: 1 grant row + 1 revoke row per cycle. DB now holds 6 audit rows.

### T6 — Login rate-limit + unified error (H5)
- `lib/auth-login-rate-limit.js`: in-memory sliding window, **10 attempts / 60s** keyed by `ip::loginId`.
  11th attempt → HTTP 429 with `Retry-After` + `X-RateLimit-Limit` headers.
- `app/api/auth/login/route.js`: all 4 invalid-credential 401 paths now return one shared
  constant `INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials'` → byte-identical body
  (no user enumeration). 400 request-shape errors left separate.
- CSRF intentionally OUT (LAN-only, same-origin enforced in middleware). Documented in code.
- Tests `tests/auth-login-rate-limit.test.js` (cap / per-account / per-IP / sliding window). All pass.

### T7 — Placeholder NIP block
- `lib/auth-session.ts`: `PLACEHOLDER_NIP_MIN=9990001`, `PLACEHOLDER_NIP_MAX=9990044`,
  digit-only matcher `isPlaceholderEmployeeNip()` (guards `parseInt('admin001')→NaN`, so alpha NIPs pass).
- Guard in `createAuthContextByNip` (covers `/api/auth/me`) AND in the login route (returns unified 401).
- SELECT projection adds `k.nip AS karyawan_nip`. **WHERE clause unchanged** (`a.nip=?`) — login still keys on the unique handle.
- Verified: placeholder denied (unified error), `employee001`/`leader001`/`admin001` (alpha) pass, short NIPs `9999`/`99999` pass. 19-case boundary table.

---

## Wave 2 — Additive resolver + role read/write + audits (T8, T11, T18, T19)

### T8 — `createAuthContextByKaryawanId(id)`
- `lib/auth-session.ts` L639+: new resolver keyed by `tb_karyawan.id`. Mirrors `createAuthContextByNip`
  exactly (B1 per-group leader, B2 global admin/hr, group fallback). Adds `AND k.isDeleted = 0`.
- Reuses the placeholder guard. Additive only — existing resolver untouched.
- Verified live: `leader001` → context with `is_leader=true` + groups; `is_active=0` row → null; placeholder → null.

### T11 — Groups leader read+write → `tb_karyawan_roles` (H4)
- `app/api/groups/route.js`: leader READ now joins `tb_karyawan_roles` (role_key='group_leader');
  assign_leader/remove_leader write `tb_karyawan_roles` by karyawan_id; multi-leader per group supported.
- Migration `scripts/migration-task-11-leader-backfill.sql` (idempotent) backfilled
  device-table leaders → role rows: **1 → 5** group_leader rows (grp9 multi-leader: kar29+kar108).
- Device-table (`tb_user_group_access`) writes **retained as dead data** (column-gated), never read for authority.
- Verified: list/assign/remove cycle clean, audit rows recorded.

### T18 — bcrypt-only audit (M2)
- All active auth rows confirmed `$2b$` (len 60). `COUNT(password_hash NOT LIKE '$2%' AND is_active=1) = 0`.
- Only non-bcrypt row is `kar10004` (empty hash, `is_active=0`) — documented, untouched (cannot log in).

### T19 — Admin-driven password reset (M4)
- `app/api/admin/password-reset/route.js` (POST) + pure core `lib/admin-password-reset.js`.
- Auth gate: unauthenticated → 401 `'Login required.'`; non-admin → 403 `'Forbidden'` (generic, no probe leak).
- bcrypt via `hashPassword`, parameterized `UPDATE`. No self-service path.
- Audit: NEW sibling table `tb_password_reset_audit` (avoids ENUM ALTER coupling with blocked T4).
  Stores actor/target/timestamp only — never the password.
- Tests `tests/admin-password-reset.test.js`: 5/5 (401/403/400/200/target-not-found).
- Verified live cycle: admin resets emp → emp logs in new pw → reset back → original works. `employee001` restored to `password`.

---

## Files changed (working tree, vs HEAD)

**Modified**
- `app/api/auth/login/route.js`
- `app/api/groups/route.js`
- `lib/auth-session.ts`

**New**
- `lib/auth-audit.ts`
- `lib/auth-login-rate-limit.js`
- `lib/admin-password-reset.js`
- `app/api/admin/password-reset/route.js`
- `tests/auth-login-rate-limit.test.js`
- `tests/admin-password-reset.test.js`
- `scripts/migration-task-5-role-change-audit.sql`
- `scripts/migration-task-11-leader-backfill.sql`
- `scripts/migration-task-19-password-reset-audit.sql`

All three migrations are applied to the dev DB (`demo_easylinksdk`).
