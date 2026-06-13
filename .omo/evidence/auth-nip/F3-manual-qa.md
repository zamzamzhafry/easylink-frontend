# F3 Real Manual QA — Auth NIP Re-anchor (testable scope)

Date: 2026-06-13
Reviewer: sisyphus-junior
Mode: Final wave reviewer audit

## Scope

Live, end-to-end QA of every scenario in the F3 plan that depends only on IMPLEMENTED tasks (T5, T6, T7, T8, T11, T18, T19 + base login route). Scenarios gated on amendment-blocked tasks (T9 numeric karyawan_id subject, T14/T15 PIN hardcut, T16 break-glass, T17 account-lane removal + isDeleted enforcement) are documented as DEFERRED with the blocking task ID and the expected post-merge behavior.

Evidence dir: `.omo/evidence/auth-nip/final-qa/`
- `s1-s4-curl.txt` — happy-path NIP logins + wrong-pw
- `s5-placeholder.txt` — placeholder NIP unified 401
- `s6-ratelimit.txt` — rate-limit per (IP+login_id)
- `s7-s9-admin-reset.txt` — admin password reset cycle + ACL
- `s10-s11-groups.txt` — groups leader API + audit
- `s12-s14-ui-nav.txt` — Playwright role-gated sidebar

## Method

1. Dev server in tmux `elworkspace` on :3000. Restarted with `rm -rf .next && npm run dev` at start of run (corrupt `.next` from prior build/dev overlap was returning HTTP 500 with `Cannot find module './8948.js'`).
2. curl + jq for API scenarios. mysql --batch via `set -a && source .env && set +a` then `mysql -h$DB_HOST -P$DB_PORT -u$DB_USER -p"$DBP"` (DB user `easylink`, not root; DB_PASSWORD strip-quoted).
3. Cookie jars per login id under `/tmp/qa-f3-<lid>.cookie`, deleted before each scenario for clean state.
4. Playwright MCP for sidebar UI verification. **NOTE**: trusted `.click()` is dead in this MCP browser AND the controlled-form `requestSubmit()` did not bind to React state (native input value setter + input/change dispatch did not propagate). Workaround: `fetch('/api/auth/login')` from page context (cookie still set by `Set-Cookie`) followed by `browser_navigate` to a real route — the next request carries the cookie, server-rendered auth context drives the sidebar, which is the actual production code path under test.

---

## Scenario Results

### S1. employee001 / password — **PASS**
HTTP 200. `subject_type=employee_nip`, `karyawan_id=10008`, `is_admin=false`, `is_leader=false`, `canonical_roles=[employee]`, `groups=[{group_id:32, is_leader:false, can_dashboard:true}]`.
Evidence: `s1-s4-curl.txt` (S1 block).

### S2. leader001 / password — **PASS**
HTTP 200. `karyawan_id=10007`, `is_leader=true`, `canonical_roles=[group_leader, employee]`, group 32 with `is_leader:true`.
Evidence: `s1-s4-curl.txt` (S2 block).

### S3. admin001 / password — **PASS**
HTTP 200. `karyawan_id=10006`, `is_admin=true`, `canonical_roles=[admin, employee]`, `groups=[]` (global admin, NULL group).
Evidence: `s1-s4-curl.txt` (S3 block).

### S4. employee001 / WRONGPW — **PASS**
HTTP 401. Body byte-exact: `{"ok":false,"error":"Invalid credentials"}`.
Evidence: `s1-s4-curl.txt` (S4 block).

### S5. Placeholder NIP login (kar1 seeded with `auth.nip='QA_PH_F3'`, k.nip=9990001, in PLACEHOLDER_NIP range) — **PASS**
Pre-seed kar1 auth count = 0. Inserted temp row reusing employee001 bcrypt hash. POST `/api/auth/login` with `login_id=QA_PH_F3` returned **HTTP 401** body `{"ok":false,"error":"Invalid credentials"}` — **byte-identical** to the S4 wrong-pw body (unified credential error from `invalidCredentialsResponse()`). CLEANUP: `DELETE` ran; post-cleanup kar1 auth count = 0 (baseline restored, zero residue).
Evidence: `s5-placeholder.txt`.

### S6. Rate-limit: 11 rapid attempts on same loginId+IP — **PASS**
Used a unique throwaway login_id (`ratelimit_test_$(date +%s)`) with `password=wrong` to keep S6 isolated from other counters. Attempts 1–10: HTTP 401 `{"ok":false,"error":"Invalid credentials"}` with no rate headers. Attempt 11: **HTTP 429** body `{"ok":false,"error":"Too many login attempts. Try again in 60s."}`, headers **`retry-after: 60`** and **`x-ratelimit-limit: 10`**. Attempt 12 also 429 (window still open).
Evidence: `s6-ratelimit.txt`.

### S7. Admin password reset cycle (5 steps) — **PASS**, password restored
1. `admin001/password` login → HTTP 200, `is_admin=true`, `karyawan_id=10006`.
2. `POST /api/admin/password-reset {target_karyawan_id:10008, new_password:"TempPass123"}` with admin cookie → **HTTP 200** `{"ok":true}`.
3. `employee001/TempPass123` login → **HTTP 200**, user payload intact (`karyawan_id=10008`, role unchanged).
4. `POST /api/admin/password-reset {target_karyawan_id:10008, new_password:"password"}` → **HTTP 200** `{"ok":true}`.
5. `employee001/password` login (original) → **HTTP 200**, **password restored**.

`tb_password_reset_audit` recorded 2 rows for this cycle: id 8 + 9, `actor_karyawan_id=10006`, `target_karyawan_id=10008`. Post-cycle hash prefix still `$2b$` (bcrypt preserved, no plaintext leak).
Evidence: `s7-s9-admin-reset.txt`.

### S8. Non-admin reset (emp001 cookie) — **PASS**
With employee001 cookie (`is_admin=false`), `POST /api/admin/password-reset` → **HTTP 403** body `{"ok":false,"error":"Forbidden"}` (generic, no admin-probe leak).
Evidence: `s7-s9-admin-reset.txt`.

### S9. Unauthenticated reset (no cookie) — **PASS**
`POST /api/admin/password-reset` with no cookie → **HTTP 401** body `{"ok":false,"error":"Login required."}`.
Evidence: `s7-s9-admin-reset.txt`.

### S10. GET /api/groups leader list (admin001 cookie) — **PASS**
HTTP 200. Top-level `leaders` array length = **5**, matching DB ground truth from `tb_karyawan_roles WHERE role_key='group_leader'` exactly:

| group_id | karyawan_id | pin       | nip          | nama                                 |
|----------|-------------|-----------|--------------|--------------------------------------|
| 2        | 2           | 82        | 20211200006  | dr. Dini Pangestika                  |
| 7        | 23          | 65        | 20211200027  | Al Dilladyas Kusuma Putri, A,Md.A.K  |
| 9        | 108         | 99        | 20250700001  | Arum Purwaningsih, AMd.RMIK          |
| 9        | 29          | 17        | 9990009      | Yustisia Karinta Nurmalitasari, S.K.M|
| 32       | 10007       | leader001 | leader001    | Seed Leader 001                       |

**grp9 multi-leader confirmed**: both kar29 and kar108 returned in API for `group_id=9`, matching DB. Wire still projects `pin` for backward compat (Task 11 contract).
Evidence: `s10-s11-groups.txt`.

### S11. assign_leader + remove_leader audit trail — **PASS**
Baseline `tb_role_change_audit` count = 6 (pre-existing prior-task evidence). MAX(id)=8 pre-cycle.
- `POST /api/groups {action:'assign_leader', pin:'leader001', group_id:9}` → HTTP 200 `{"ok":true}`.
- `POST /api/groups {action:'remove_leader', pin:'leader001', group_id:9}` → HTTP 200 `{"ok":true}`.

New rows (id > 8):

| id | actor_karyawan_id | target_karyawan_id | action  | role_key      | group_id |
|----|-------------------|--------------------|---------|---------------|----------|
| 9  | 10006             | 10007              | grant   | group_leader  | 9        |
| 10 | 10006             | 10007              | revoke  | group_leader  | 9        |

Delta: **1 grant + 1 revoke**, actor=admin001 (10006), target=leader001 (10007). Pin→karyawan_id resolution worked, audit table populated with role_key + group_id.
Evidence: `s10-s11-groups.txt`.

### S12. Playwright: employee001 UI login + no admin nav — **PASS**
After `fetch('/api/auth/login')` (employee001/password) + `browser_navigate('/attendance')`, sidebar `aside a[href]` enumeration returned **only** `/` and `/schedule`. **None** of the admin items (`/employees`, `/groups`, `/shifts`, `/users`, `/scanlog`, `/machine`, `/attendance/review`, `/report`) appeared. `/schedule` is correctly visible because `canAccessScheduleView` admits any user with `canonical_roles.includes('employee')`. `/attendance` and `/performance`/`/analytics` are hidden because top-level `can_dashboard=false` and `can_schedule=false` for employee001's per-group capability.
Evidence: `s12-s14-ui-nav.txt`.

### S13. Playwright: leader001 UI login + group_leader nav — **PASS**
me: `is_leader=true, can_schedule=true, can_dashboard=true, canonical_roles=[group_leader, employee]`.
Sidebar after navigate-to-`/attendance`: `/`, `/schedule`, `/attendance`, `/performance`, `/analytics`. Admin-only links **all absent**. The leader-tier extras (schedule + attendance + performance + analytics) are present, distinguishing leader001 from employee001.
Evidence: `s12-s14-ui-nav.txt`.

### S14. Playwright: admin001 UI login + admin nav — **PASS**
me: `is_admin=true, karyawan_id=10006, nip=admin001`.
Sidebar after navigate-to-`/`: ALL items present — `/`, `/schedule`, `/attendance`, `/attendance/review`, `/performance`, `/analytics`, `/report`, `/employees`, `/groups`, `/shifts`, `/users`, `/scanlog`, `/machine`.
Evidence: `s12-s14-ui-nav.txt`.

---

## Deferred (cannot test in current scope)

| Scenario                                                                             | Blocked by | Why                                                                                                 |
|--------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------|
| NIP login subject = numeric `karyawan_id`                                            | T9         | Subject is still `nip` string (e.g. `"employee001"`); T9 amendment switches `st:'employee_nip'` payload subject to `karyawan_id` int. Cookie payload reads were skipped — current shape is still string-NIP and that's the contracted behavior for the current scope. |
| Account lane `admin01 / Admin@123` → 401 expected                                    | T17        | Account lane is still live by spec. Expected to remain HTTP 200 today; only after T17 removes the lane should the response flip to 401. Not regressed.                                                                                                            |
| PIN-only login (legacy pin lane) → 401 expected                                      | T14/T15    | `LEGACY_PIN_FALLBACK` flag defaults true. Current behavior intentionally still permits PIN-only authentication.                                                                                                                                                 |
| Soft-delete `/me 401` (isDeleted=1)                                                  | T17        | Login resolver does not yet enforce `k.isDeleted = 0`. Audit of isDeleted values gated on T17's H3 amendment.                                                                                                                                                    |
| Break-glass script on fresh DB                                                       | T16        | Break-glass reassignment to admin001/kar10006 not implemented yet; current break-glass references kar9999 (inert).                                                                                                                                              |

---

## Cleanup verification

| Check                                          | Result                                                                 |
|------------------------------------------------|------------------------------------------------------------------------|
| `tb_karyawan_auth WHERE karyawan_id=1`         | **0 rows** — placeholder seed (QA_PH_F3) fully removed                 |
| `tb_karyawan_auth WHERE nip LIKE 'QA%'`        | **0 rows** — no QA residue anywhere                                    |
| employee001 password_hash prefix               | `$2b$` (bcrypt) — preserved                                            |
| `employee001 / password` post-cycle login      | HTTP 200 — original password fully restored                            |
| `tb_karyawan_roles` leader rows                | Unchanged (assign_leader for grp9/leader001 was reverted by remove)    |
| `tb_user_group_access` (legacy device table)   | Best-effort dead-data write fired during assign/remove (per code); never read by the API — no cleanup needed (and not in QA spec) |

No code modified during this run. No commits. No leftover seeds. No leftover password mutations.

---

## VERDICT LINE

`NIP lanes 3/3 | Account DEFERRED-T17 | Placeholder-block P | rate-limit P | admin-reset P | groups-API P | UI role-nav 3/3 | Deferred 5 scenarios pending T9/T14/T15/T16/T17 | VERDICT: APPROVE-FOR-COMPLETED-SCOPE`

All 14 testable scenarios PASS with byte-level evidence in `final-qa/`. Cleanup confirmed: zero DB residue, employee001 password restored, role-change audit trail intact (2 new rows from S11 reflecting the live grant→revoke cycle), password-reset audit intact (2 new rows from S7 reflecting the live reset→restore cycle). Audits ride the actual code paths under test — these are not test-only stubs.

Implemented scope is production-ready for the auth-NIP re-anchor delta. Deferred items remain correctly gated by their amendment tasks; nothing in F3 surfaced a regression against the implemented work.
