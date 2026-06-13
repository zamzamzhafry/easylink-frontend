# T16 Human QA Runbook — Seeded Accounts + Browser View QA

**Branch:** `sync/ai-knowledge-2026-06-07` (HEAD `45fe074`)
**Date:** 2026-06-13
**Scope:** Manual browser walkthrough of every active seeded account, per-role view assertions.

---

## Seeded accounts (live DB pull 2026-06-13)

| # | Login ID | Password | Lane | Subject (cookie `st`) | karyawan_id | Roles in DB | Expected `is_admin` | Expected `is_leader` | Groups |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `admin001` | `password` | NIP (employee_nip) | `karyawan_id` | 10006 | `admin / NULL` | true | false | `[]` |
| 2 | `leader001` | `password` | NIP (employee_nip) | `karyawan_id` | 10007 | `group_leader / 32` | false | true | `[{group_id:32, is_leader:true, can_schedule:true, can_dashboard:true}]` |
| 3 | `employee001` | `password` | NIP (employee_nip) | `karyawan_id` | 10008 | `viewer / 32` | false | false | `[{group_id:32, is_leader:false, can_schedule:false, can_dashboard:true}]` |
| 4 | `admin01` | `Admin@123` | Account (auth_accounts) | `account` | — (n/a, account_id=1) | `auth_accounts.role_key='admin'` | true | true | `[]` |

**Inactive — DO NOT use (kept for history):**
- `ADMIN01` / unknown (kar9999, `is_active=0`, k.nip=`9990044` inside placeholder block)
- `HRD01` / unknown (kar10003, `is_active=0`)
- `99999` / empty hash (kar10004, `is_active=0`)

**Blocked at login layer:** any NIP matching `^999000[1-9]$` or `^999001[0-9]$` or `^99900[2-3][0-9]$` or `^9990044$` (range `9990001–9990044`) — `isPlaceholderEmployeeNip` returns true.

---

## Pre-flight (before browser QA)

```bash
# 1. Confirm dev server up
curl -sI http://localhost:3000 | head -1   # expect HTTP/1.1 200

# 2. Confirm DB reachable
mysql -h 127.0.0.1 -u easylink -p'RSSU2026Aa11!' demo_easylinksdk \
  -e "SELECT 1 AS ok;"

# 3. Clear browser cookies for localhost:3000 (DevTools → Application → Cookies → Clear)
```

---

## Scenario A — admin001 (NIP admin break-glass)

**Login:** `http://localhost:3000/login` → NIP `admin001` / password `password`

**Expected on `/api/auth/me` (DevTools → Network → /me response):**
```json
{
  "karyawan_id": 10006,
  "nip": "admin001",
  "is_admin": true,
  "is_leader": false,
  "subject_type": "employee_nip",
  "groups": [],
  "canonical_roles": ["admin","employee"]
}
```

**Expected cookie `easylink_session` payload (decode base64url before `.`):**
```json
{"sub":"10006","st":"karyawan_id","v":2}
```

**Browser view checklist:**
- [ ] Sidebar shows ALL items (Dashboard, Attendance, Schedule, Employees, Groups, Machine, Reports, Admin tools)
- [ ] `/employees` loads, lists all employees (admin scope)
- [ ] `/groups` loads, can see all groups (no group filter)
- [ ] `/admin/password-reset` (if exists) accessible
- [ ] No 403 on any nav click

---

## Scenario B — leader001 (group_leader, grp32 only)

**Login:** NIP `leader001` / password `password`

**Expected on `/api/auth/me`:**
```json
{
  "karyawan_id": 10007,
  "nip": "leader001",
  "is_admin": false,
  "is_leader": true,
  "can_schedule": true,
  "can_dashboard": true,
  "subject_type": "employee_nip",
  "groups": [
    {"group_id":32,"is_leader":true,"can_schedule":true,"can_dashboard":true}
  ],
  "canonical_roles": ["group_leader","employee"]
}
```

**Cookie:** `{"sub":"10007","st":"karyawan_id","v":2}`

**Browser view checklist:**
- [ ] Sidebar: Dashboard, Attendance, Schedule (for grp32), Groups (read), Reports (scoped)
- [ ] Sidebar should NOT show admin-only items (Admin tools, all-employee management)
- [ ] `/schedule` loads, shows grp32 only (NOT other groups)
- [ ] `/groups` loads, sees grp32; attempting to edit grp2/grp7/grp9 → 403 or hidden
- [ ] `/employees` — should either be scoped to grp32 members or hidden entirely (verify against current policy)
- [ ] Attempting direct URL `/admin/...` → 403 or redirect

---

## Scenario C — employee001 (viewer, grp32)

**Login:** NIP `employee001` / password `password`

**Expected on `/api/auth/me`:**
```json
{
  "karyawan_id": 10008,
  "nip": "employee001",
  "is_admin": false,
  "is_leader": false,
  "can_schedule": false,
  "can_dashboard": true,
  "subject_type": "employee_nip",
  "groups": [
    {"group_id":32,"is_leader":false,"can_schedule":false,"can_dashboard":true}
  ],
  "canonical_roles": ["employee"]
}
```

**Cookie:** `{"sub":"10008","st":"karyawan_id","v":2}`

**Browser view checklist:**
- [ ] Sidebar: Dashboard (self only), Attendance (self only)
- [ ] NO Schedule editing, NO Groups admin, NO Employees list
- [ ] `/attendance` shows employee001's own scans only
- [ ] Direct URL `/schedule` → 403 or read-only
- [ ] Direct URL `/groups` → 403 or hidden

---

## Scenario D — admin01 (account-lane admin)

**Login:** Login ID `admin01` / password `Admin@123`

> Note: This lane uses the standalone `auth_accounts` table (NOT NIP). Cookie subject stays on `account:` lane until Amendment A T16-follow-up retires it.

**Expected on `/api/auth/me`:**
```json
{
  "account_id": 1,
  "login_id": "admin01",
  "role_key": "admin",
  "is_admin": true,
  "subject_type": "account",
  "groups": [],
  "karyawan_id": null,
  "nip": null
}
```

**Cookie:** `{"sub":"admin01","st":"account","v":2}` — NOT `karyawan_id` (intentional, see commit `45fe074`).

**Browser view checklist:**
- [ ] Same admin nav as Scenario A (all sidebar items)
- [ ] `is_admin=true` honored across all pages
- [ ] Logout works; re-login works

---

## Scenario E — Placeholder block (negative test)

**Login attempt:** Any NIP in `9990001–9990044`, e.g. `9990001` / `password` (or any password).

**Expected:** HTTP 401 with unified error body `{"error":"Invalid credentials"}` (byte-identical to bad-password 401; no enumeration).

**Browser check:**
- [ ] Login form shows generic "Invalid credentials" toast/text
- [ ] No hint that the NIP is "blocked vs missing vs wrong-password"

---

## Scenario F — Logout + cookie clear

After any login:
- [ ] Click Logout
- [ ] DevTools → Application → Cookies → `easylink_session` is gone (or expired)
- [ ] Refreshing protected page → redirect to `/login`

---

## Pass/Fail recording

For each scenario, record under:
`.omo/evidence/auth-nip/t16-human-qa/<scenario>.md` with:
- Screenshot of sidebar
- Network tab `/me` response JSON
- Any 403/redirect observed

---

## Known carry-forward (not blockers)

- `subject_type:"employee_nip"` in the `/me` response for NIP lanes is the **resolver self-label** (set inside `createAuthContextByKaryawanId` at `lib/auth-session.ts:L784`). Cookie `st` IS `karyawan_id`. T9 acceptance is on the cookie payload — not the response self-label. Future cleanup could align them but it's not a defect.
- `getAuthContextFromCookies` returns `await`-less `createAuthContext*` calls at 8 sites. Pattern is valid (async function unwraps). Hygiene pass later, NOT a bug.
- `LEGACY_SESSION_PAYLOAD_COMPAT` is ON for 12h soak (T13). After 12h `nip:` / `account:` prefix cookies stop decoding. During soak, all old cookies in the wild still work — no forced logout wave.
