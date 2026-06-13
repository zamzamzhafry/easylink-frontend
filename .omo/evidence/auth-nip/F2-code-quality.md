# F2 — Code Quality Review (auth-NIP-reanchor partial-completion)

Wave: final reviewer audit (sisyphus-junior)
Date: 2026-06-13
Base: HEAD (working tree vs HEAD, pathspec excludes `.omo`, `.multibrain`, `.sisyphus`, `docs`)

## 1. Gates

### 1.1 `npm run typecheck`  ( `tsc --noEmit` )
- EXIT: **0**
- Log: `/tmp/F2-typecheck.log` (empty stdout/stderr, clean).
- Status: **PASS**

### 1.2 `npm run build`  ( `next build` )
- EXIT: **1**
- Compile result: `✓ Compiled successfully` + types validated.
- Failure occurs in post-compile `Collecting page data` stage:
  - `request to https://fonts.googleapis.com/css2?family=DM+Sans:wght@100..1000&display=swap failed` (retries 1/3, 2/3 exhausted)
  - `request to https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap failed`
  - `unhandledRejection PageNotFoundError: Cannot find module for page: /_document`, code `ENOENT`
- Root cause: offline-sandbox font fetch ETIMEDOUT (DM Sans / DM Mono from `fonts.googleapis.com`) cascades into `/_document` static-collection failure. App code compiles clean. **Pre-existing env-baseline behavior** documented in notepad lines 68/108/123/153/175. Not a regression of these changes.
- Status: **ENV-BASELINE FAIL** (treated as PASS for review purposes per task spec; typecheck is authoritative TS gate)

### 1.3 Tests:  `node --import tsx --env-file=.env --test tests/auth-*.test.js tests/admin-password-reset.test.js`
- EXIT: **1**
- Summary:
  - tests: **38**
  - suites: 7
  - pass: **37**
  - fail: **1**
  - cancelled: 0  /  skipped: 0  /  todo: 0
  - duration_ms: 3399.099
- Per-suite (top-level `ok` / `not ok`):

| # | Suite | Result |
|---|------|--------|
| 1 | `handleAdminPasswordReset — security gate` (tests/admin-password-reset.test.js) | ok |
| 2 | `handleAdminPasswordReset — admin happy path + audit (real DB)` | ok |
| 3 | `auth hardening helpers` (tests/auth-hardening-helpers.test.js) | ok |
| 4 | `login rate limiter (ip + loginId)` (tests/auth-login-rate-limit.test.js) | ok |
| 5 | `auth login lane resolver` (tests/auth-login-lane-resolver.test.js) | ok |
| 6 | `normalized auth response contract` (tests/auth-normalized-response.test.js) | ok |
| 7 | `auth session compatibility contract` (tests/auth-session-compat.test.js) | **not ok** |

- Sole failure: `auth-session-compat.test.js  >  insecure cookie knob stays disabled by default` at L177.
  - Asserts `secure === false` (expects ALLOW_INSECURE_COOKIES disabled).
  - Actual: `true !== false` because `.env` has `ALLOW_INSECURE_COOKIES=true`.
  - **Pre-existing HEAD baseline** (env-injected). Not a regression of the auth-NIP-reanchor changes. Documented and acknowledged.
- Status: **PASS (modulo env-baseline failure)**

## 2. Changed code files (vs HEAD, excluding docs/internal-meta)

```
git diff --stat HEAD -- ':!.omo' ':!.multibrain' ':!.sisyphus' ':!docs'

 app/api/auth/login/route.js |  52 ++++--
 app/api/groups/route.js     | 153 +++++++++++++++----
 lib/auth-session.ts         | 156 ++++++++++++++++++++-
 3 files changed, 308 insertions(+), 53 deletions(-)
```

Plus untracked NEW files (status `??`):
- `lib/auth-audit.ts`
- `lib/auth-login-rate-limit.js`
- `lib/admin-password-reset.js`
- `app/api/admin/password-reset/route.js`
- `tests/auth-login-rate-limit.test.js`
- `tests/admin-password-reset.test.js`
- `scripts/migration-task-5-role-change-audit.sql`
- `scripts/migration-task-11-leader-backfill.sql`
- `scripts/migration-task-19-password-reset-audit.sql`

Total reviewed: **12 files** (3 modified + 9 new).

## 3. Per-file findings table

Legend: `0` = clean ; numbers cite `file:line`. SQL-param check covers `query(...${var}...)` interpolation of user-controlled values. `a.nip` PRESENCE expected per Oracle amendment (T10 cancelled) — inventoried, not flagged.

| File | `as any` | `@ts-ignore` | Unparam SQL (user input) | Empty catch | `console.log` | `a.nip` reads (expected) | TODO/FIXME/HACK/XXX |
|------|---------:|-------------:|--------------------------|------------:|--------------:|--------------------------|--------------------:|
| `app/api/auth/login/route.js` | 0 | 0 | 0 (only L78 template = error message, not SQL) | 0 (L188 `catch (error)` has body) | 0 | 0 (uses `auth.*` shorthand in raw SQL L122-128: `auth.nip`, table-alias not L-prefix) | 0 |
| `app/api/groups/route.js` | 0 | 0 | 0 | 0 (no catch) | 0 | 0 | 0 |
| `lib/auth-session.ts` | **5** (L522, L530, L658, L666, L794) | 0 | 0 (L401/440/494 interpolate const table names `AUTH_ACCOUNT_TABLE`/`AUTH_ACCOUNT_SCOPE_TABLE` declared L25-26; values still `?`-parameterized) | 0 (5 catches L257, L312, L469, L629, L765 — all have `console.warn`/`console.error` + return) | 0 (only `console.warn`/`console.error`, acceptable) | **2** (L517, L653 SELECT `a.nip` — expected per Oracle T10 cancellation) | 0 |
| `lib/auth-audit.ts` | 0 | 0 | 0 (L41 template = error message) | 0 (no catch) | 0 | 0 | 0 |
| `lib/auth-login-rate-limit.js` | 0 | 0 | 0 (L57 template = Map key) | 0 (no catch) | 0 | 0 | 0 |
| `lib/admin-password-reset.js` | 0 | 0 | 0 | 0 (no catch) | 0 | 0 | 0 |
| `app/api/admin/password-reset/route.js` | 0 | 0 | 0 | 0 (L27 `} catch { body = null; }` has body — intentional graceful JSON-parse fallback) | 0 | 0 | 0 |
| `tests/auth-login-rate-limit.test.js` | 0 | 0 | 0 (L20 template = assert message) | 0 (no catch) | 0 | 0 | 0 |
| `tests/admin-password-reset.test.js` | 0 | 0 | 0 | 0 (no catch) | 0 | 0 | 0 |
| `scripts/migration-task-5-role-change-audit.sql` | n/a (SQL) | n/a | n/a (DDL, no `${var}`) | n/a | n/a | 0 (no `a.nip` refs) | 0 |
| `scripts/migration-task-11-leader-backfill.sql` | n/a | n/a | n/a (DDL, named-column INSERT…SELECT) | n/a | n/a | 0 | 0 |
| `scripts/migration-task-19-password-reset-audit.sql` | n/a | n/a | n/a | n/a | n/a | 0 | 0 |

### 3.1 `as any` detail (lib/auth-session.ts)

All 5 hits narrow mysql2 `RowDataPacket[]` to readable shapes after `Array.isArray` guard:

| Line | Snippet | Context |
|-----:|---------|---------|
| 522 | `const user = users[0] as any;` | `createAuthContextByNip` row shape |
| 530 | `const roleRows = Array.isArray(roles) ? (roles as any[]) : [];` | role rows from `tb_karyawan_roles` |
| 658 | `const user = users[0] as any;` | NEW `createAuthContextByKaryawanId` row shape (mirror of L522) |
| 666 | `const roleRows = Array.isArray(roles) ? (roles as any[]) : [];` | NEW role rows (mirror of L530) |
| 794 | `const emp = Array.isArray(empRows) ? empRows[0] as any : null;` | `createAuthContextByPin` isDeleted lookup (UNCHANGED pre-existing baseline; outside this delta) |

Assessment: minor type-safety smell, pre-existing pattern in the file. L658/L666 are NEW (added by T8 mirror of ByNip). Consistent with existing house style — flagging as MINOR (not blocking). A stricter typed-row type for the join could be introduced uniformly across the file in a follow-up.

### 3.2 `a.nip` inventory (lib/auth-session.ts)

| Line | Snippet | Verdict |
|-----:|---------|---------|
| 517 | `'SELECT a.karyawan_id, a.nip, k.nama, k.pin, k.nip AS karyawan_nip ... WHERE a.nip = ? AND a.is_active = 1'` | EXPECTED — `auth.nip` stays the login key per Oracle T10 cancellation. SELECT projection + WHERE clause. |
| 653 | `'SELECT a.karyawan_id, a.nip, k.nama, k.pin, k.nip AS karyawan_nip ... WHERE k.id = ? AND a.is_active = 1 AND k.isDeleted = 0'` | EXPECTED — new `createAuthContextByKaryawanId` resolver still selects `a.nip` for the return shape's `nip` field; WHERE is `k.id = ?` (immutable karyawan_id) but projection retains `a.nip`. Matches contract. |

Login route SQL L122-128 also retains `WHERE auth.nip = ?` (table alias `auth`, not `a`) — same expected pattern.

### 3.3 Template-literal SQL clarification

`lib/auth-session.ts` interpolates table NAMES (`AUTH_ACCOUNT_TABLE`, `AUTH_ACCOUNT_SCOPE_TABLE`) at L401, L440, L494:

- L25: `const AUTH_ACCOUNT_TABLE = 'auth_accounts';`
- L26: `const AUTH_ACCOUNT_SCOPE_TABLE = 'auth_account_group_scope';`

Both are module-level string literals, not derived from request/user input. All caller values (`login_id`, `account_id`) remain bound via `?`-parameter placeholders. **No injection vector**.

## 4. Verdict line

```
Typecheck [PASS] | Build [ENV-BASELINE FAIL: Google-Fonts ETIMEDOUT + cascading /_document ENOENT — pre-existing offline-sandbox baseline] | Tests [37 pass / 1 fail (auth-session-compat.test.js subtest 'insecure cookie knob stays disabled by default' — pre-existing HEAD env-baseline due to .env ALLOW_INSECURE_COOKIES=true) / 0 cancelled] | SQL params [clean — only const-table-name template interpolation, no user-controlled `${var}` in SQL] | VERDICT: APPROVE
```

### Rationale

- Typecheck (authoritative TS gate): CLEAN, exit 0.
- Build failure is offline-sandbox environmental (Google Fonts unreachable) → cascading `/_document` ENOENT during static-collection. Compile + lint + types stages all reported `✓` before the post-compile network step failed. Documented as pre-existing baseline in notepad (lines 68, 108, 123, 153, 175).
- Test failure is HEAD env-baseline: `.env` ALLOW_INSECURE_COOKIES=true is acknowledged in task brief as expected non-regression.
- Code-quality hunts: **0 critical issues**.
  - 0 `@ts-ignore` / 0 `console.log` / 0 TODO/FIXME / 0 empty catch / 0 user-input SQL interpolation.
  - 5 `as any` in lib/auth-session.ts are MINOR (pre-existing house style; 2 new at L658/L666 mirror existing pattern at L522/L530).
  - `a.nip` SELECT references at L517, L653 are EXPECTED (Oracle amendment cancelled T10 auth.nip drop).
- Scope discipline: changes match the documented 10 implemented tasks (T5 audit, T6 rate-limit, T7 placeholder block, T8 ByKaryawanId resolver, T11 leader re-anchor, T18 bcrypt audit, T19 admin password reset). Amendment-blocked T4/T9/T10/T16 etc are NOT in this delta as expected.

**APPROVE.**

## 5. Artifacts

- Typecheck log: `/tmp/F2-typecheck.log`
- Build log: `/tmp/F2-build.log`
- Test log: `/tmp/F2-tests.log`
