# Session Handoff — 2026-06-01 — Auth Model Cleanup + Login/429 Fix

## User request (verbatim)

> "so after reading the schema is auth account the only way for auth ing? and what is the schema of the user, fetching from the machines. is it capable to assign as is_leader and is_admin? i think if u explore there are artifact or remnant of those approach. stop the auth user first and fix the login and 429 too many request issue and do web explore or reference of best model to approach those. and then wrote into a handoff i will start on fresh new session for fixing those too"

## Locked scope

- **STOP**: Do NOT create test users or test login until auth model is cleaned up
- **Fix**: Login flow + 429 rate-limit kick-out
- **Research**: Best auth model for this app (employee + group leader + admin roles)
- **Document**: Everything below for fresh session

---

## Current Auth Architecture (3 Overlapping Login Paths)

### Path 1: `auth_accounts` (Standalone Account Login)

**Table**: `auth_accounts`
```
id              INT PK AUTO_INCREMENT
login_id        VARCHAR(80) UNIQUE NOT NULL
display_name    VARCHAR(120) NOT NULL
password_hash   VARCHAR(255) NOT NULL
role_key        ENUM('admin','hr','scheduler','viewer') NOT NULL
is_active       TINYINT(1) DEFAULT 1
last_login_at   DATETIME
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

**Session cookie subject**: `account:admin01`

**Auth context build** (`createAuthContextByLoginId` in `lib/auth-session.ts`):
- Queries `auth_accounts` by `login_id`
- Maps `role_key` → legacy flags via `ACCOUNT_ROLE_COMPAT`:
  - `admin` → privilege=4, is_admin=true, is_leader=true, can_schedule=true
  - `hr` → privilege=3, is_hr=true, can_schedule=true
  - `scheduler` → privilege=2, is_leader=true, can_schedule=true
  - `viewer` → privilege=1, can_schedule=true
- If NOT admin/hr, queries `auth_account_group_scope` for group access
- **PROBLEM**: No `employee_id` link — auth_accounts are NOT linked to employees

**Current data**: 1 row — `admin01` / `Admin VM` / role=admin

### Path 2: `tb_karyawan_auth` (Employee NIP Login)

**Table**: `tb_karyawan_auth`
```
karyawan_id     BIGINT FK → tb_karyawan(id)
nip             VARCHAR UNIQUE
password_hash   VARCHAR(255)
is_active       TINYINT(1)
last_login_at   DATETIME
```

**Session cookie subject**: `nip:12345`

**Auth context build** (`createAuthContextByNip` in `lib/auth-session.ts`):
- Queries `tb_karyawan_auth` JOIN `tb_karyawan` by NIP
- Queries `tb_user_group_access` by PIN for group membership
- Determines `is_leader` from group access rows
- **PROBLEM**: Uses `tb_user_group_access` which is PIN-based (device user), not account-based

**Current data**: Unknown count (not checked in this session)

### Path 3: Legacy PIN Fallback (`tb_user` direct)

**Table**: `tb_user` (composite PK: `sn`, `pin`)
```
sn              VARCHAR(50) PK
pin             VARCHAR(12) PK
nama            TEXT
pwd             TEXT
privilege       INT
```

**Session cookie subject**: `pin:65`

**Auth context build** (`createAuthContextByPin` in `lib/auth-session.ts`):
- Queries `tb_user` by PIN
- Uses `privilege >= 4` for `is_admin`
- Queries `tb_user_group_access` for group membership
- **Controlled by**: `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK` env var (default: `true`)
- **PROBLEM**: This is the device user table — mixing device identity with web auth

### Login Endpoint (`app/api/auth/login/route.js`)

Two-path waterfall:
1. Try `auth_accounts` by `login_id` → if found, use Path 1
2. Try `tb_karyawan_auth` by NIP → if found, use Path 2
3. (No explicit Path 3 in login — only in session resolution)

**Schema validation**: accepts `login_id` OR `nip` + `password`

### Session Resolution (`getAuthContextFromCookies` in `lib/auth-session.ts`)

Cookie `easylink_session` → decode → dispatch by subject prefix:
- `account:X` → `createAuthContextByLoginId(X)`
- `nip:X` → `createAuthContextByNip(X)`
- `pin:X` → `createAuthContextByPin(X)` (if legacy fallback enabled)
- No prefix → waterfall: try account → nip → pin

---

## Auth Artifacts & Remnants

### Active Tables

| Table | Used By | Purpose |
|---|---|---|
| `auth_accounts` | Login Path 1, session resolution | Standalone login accounts |
| `auth_account_group_scope` | Path 1 group access | Group scope for non-admin accounts |
| `tb_karyawan_auth` | Login Path 2, session resolution | Employee NIP-based login |
| `tb_user_group_access` | Paths 2+3 group access | PIN-based group membership (is_leader, can_schedule) |
| `tb_user` | Path 3 (legacy), user CRUD | Device users from biometric machines |
| `tb_karyawan` | Path 2 join | Employee master data |

### Potentially Dead/Conflicting Tables

| Table | Status | Notes |
|---|---|---|
| `employee_auth_accounts` | **DEAD?** — 1 row (admin/1234), not used in login flow | Separate employee auth, never checked in login route |
| `cs_employee_auth_identity` | **V3 canonical** — created by users route POST | Canonical identity table, not used in login resolution |
| `cs_employee_role_bindings` | **V3 canonical** — created by users route POST | Canonical role bindings, not used in login resolution |
| `employees` | **V3 canonical** — 1 row | Canonical employee table, not used in auth |

### V3 Migration Intent

`migration_v3_clean_slate_schema.sql` introduced:
- `cs_employee_auth_identity` — canonical auth identity (login_id, password_hash, employee_id FK)
- `cs_employee_role_bindings` — canonical role bindings (identity_id, role, group_id)
- Bridge views mapping canonical → legacy format

**Status**: Tables exist, users route writes to them, but login/session resolution does NOT read from them.

---

## Rate Limiter & 429 Issue

### Current State (`middleware.ts`)

```typescript
RATE_LIMIT_WINDOW_MS = 60_000;     // 1 minute
RATE_LIMIT_MAX_AUTH = 30;           // max 30 auth attempts per minute (was 10, bumped)
RATE_LIMIT_MAX_API = 120;           // max 120 API calls per minute
```

- In-memory per-IP rate limiter
- Auth endpoints: `/api/auth/*` share one bucket
- API endpoints: `/api/*` share one bucket
- 429 response includes `Retry-After: 60` header

### Kick-Out Chain (FIXED in this session)

**Before fix**: Fast navigation → 10+ `/api/auth/me` calls in <1min → 429 → `requestJson` throws → catch redirects to `/login`

**Fixes applied**:
1. `components/app-shell.jsx` — Replaced raw `requestJson('/api/auth/me')` with `useAuthSession()` hook (30s cache + in-flight dedup)
2. `components/app-shell.jsx` — Redirect only on `hookStatusCode === 401` (not 429/network)
3. `components/app-shell.jsx` — Removed `pathname` from auth useEffect deps
4. `middleware.ts` — Bumped `RATE_LIMIT_MAX_AUTH` from 10 to 30
5. `hooks/use-auth-session.js` — Added `fetchAuthSession` export for non-hook contexts
6. `app/login/page.jsx` — Uses `fetchAuthSession()` (cached) instead of raw `requestJson('/api/auth/me')`
7. `app/login/page.jsx` — Calls `resetSessionCache()` after successful login

### Remaining 429 Risk

**Problem**: `use-auth-session.js` returns `{ user: null, statusCode: 429 }` on rate limit. App-shell correctly doesn't redirect on 429, but the hook doesn't retry — user sees "not logged in" until cache expires (30s) and next fetch succeeds.

**Recommended fix**: Add retry-with-backoff for 429 in `fetchAuthSession()`:
```typescript
// In fetchAuthSession(), after getting 429:
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  return fetchAuthSession(force); // retry once
}
```

---

## SN Bug (User CRUD)

### Problem

`app/api/users/route.js` — `tb_user` has composite PK `(sn, pin)`. Creating users requires SN. `EASYLINK_DEVICE_SN` env var NOT set on VM. All 135 existing `tb_user` rows have empty string `sn`.

### Fix Applied

`getDefaultTbUserSn()` now:
1. Checks `process.env.EASYLINK_DEVICE_SN` first
2. If not set, queries most common non-empty SN from `tb_user` (cached)
3. If no non-empty SN found, returns empty string (allowed since existing data uses it)
4. Error checks changed from `!tbUserSn` to `tbUserSn == null` (allows empty string)

**Status**: Code fixed, not yet tested on VM (VM has no `EASYLINK_DEVICE_SN` set, all rows have empty `sn`).

---

## Current DB State (VM + Local Synced)

| Table | Count | Notes |
|---|---|---|
| tb_user | 135 | Device users, all sn='' |
| tb_karyawan | 135 | Employees |
| tb_scanlog | 66,441 | Legacy scanlog |
| scanlog_events | 54,414 | Canonical scanlog events |
| tb_group | 27 | Groups |
| tb_schedule | 757 | Schedules |
| tb_shift_type | 10 | Shift types |
| auth_accounts | 1 | admin01 only |
| tb_user_group_access | 4 | PIN-based group access |
| tb_employee_group | 116 | Employee-group assignments |
| employee_auth_accounts | 1 | admin/1234 (dead?) |
| employees | 1 | V3 canonical (dead?) |

---

## Best Practice Research Summary

### Recommended Auth Model

**Single source of truth**: `auth_accounts` table with `employee_id` FK

```
auth_accounts
├── id (PK)
├── login_id (UNIQUE)
├── employee_id (FK → tb_karyawan.id) ← ADD THIS
├── password_hash
├── role_key (admin|hr|scheduler|viewer)
├── is_active
└── ...

auth_account_group_scope
├── account_id (FK → auth_accounts.id)
├── group_id (FK → tb_group.id)
└── (account-level group access)
```

**Key changes**:
1. Add `employee_id` to `auth_accounts` — links login to employee
2. Use `auth_account_group_scope` for group access (not `tb_user_group_access`)
3. Deprecate `tb_karyawan_auth` (merge into `auth_accounts`)
4. Deprecate `tb_user_group_access` for auth (keep for device sync only)
5. Disable legacy PIN fallback (`EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=false`)

**Role model**:
- `admin` — full access, all groups
- `hr` — all groups, schedule + dashboard
- `scheduler` — assigned groups, schedule + dashboard
- `viewer` — assigned groups, dashboard only

**Group leadership**: Via `auth_account_group_scope.is_leader` flag (add column)

### Rate Limit Best Practices

- Auth endpoints: 30/min is reasonable for single-instance
- Add `Retry-After` header consumption client-side
- Consider Redis-based rate limiter for multi-instance
- Differentiate `/api/auth/me` (read-only, cacheable) from `/api/auth/login` (write, rate-limit strictly)

---

## Files Modified in This Session

1. **`components/app-shell.jsx`** — Auth gate rewrite: uses `useAuthSession()` hook, redirects only on 401
2. **`middleware.ts`** — `RATE_LIMIT_MAX_AUTH` bumped from 10 to 30
3. **`hooks/use-auth-session.js`** — Added `fetchAuthSession` export, `statusCode` tracking
4. **`app/login/page.jsx`** — Uses `fetchAuthSession()` (cached), calls `resetSessionCache()` after login
5. **`app/api/users/route.js`** — `getDefaultTbUserSn()` auto-detects SN from DB

## Commits

- `0dca1ca` — Auth leak fix (login page cache + session cache reset)
- Earlier commits: handleSetRange fix, SN auto-detect

## VM State

- SSH: `plink.exe -pw RSSU2026 -no-antispoof -hostkey "ssh-ed25519 255 SHA256:KJ1c6KdQDctTfRecaW4ibvtuQUYWJ8AxdddcqIDIBjo" user@192.168.1.129 "COMMAND"`
- App: `/home/user/apps/easylink-frontend`
- DB: user=easylink, pass=RSSU2026Aa11!, db=demo_easylinksdk
- PM2: `easylink-frontend` (id 0)
- Deployed commit: `0dca1ca`

## What Fresh Session Should Do

1. **Decide auth model**: Single `auth_accounts` with `employee_id` FK? Or keep dual-path?
2. **Clean up dead tables**: `employee_auth_accounts`, `cs_employee_auth_identity`, `cs_employee_role_bindings` — use or drop?
3. **Fix 429 retry**: Add retry-with-backoff in `fetchAuthSession()` for 429 responses
4. **Test login flow**: After auth model decision, create test user, verify login + session + permissions
5. **Test schedule CRUD**: Verify `canManageSchedule()` works for admin + group_leader roles
6. **Deploy**: Push auth model changes to VM, test end-to-end
