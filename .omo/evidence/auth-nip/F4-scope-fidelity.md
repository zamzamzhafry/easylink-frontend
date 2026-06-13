# F4 — Scope Fidelity Check (auth-nip-reanchor-migration, partial-completion wave)

Reviewer: F4 (deep). Date: 2026-06-13. Branch: `sync/ai-knowledge-2026-06-07`.
Method: per task — read plan "What to do" + "Must NOT do" → read actual diff (`git diff HEAD -- <file>`) / grep / DB query → verdict.

Baseline: HEAD = `a4aa214` (B1/B2 auth-escalation fix) + `ae052a2` (UI waves 1-3). **NO new commits this wave** (verified `git log HEAD --oneline | head -5`). All changes uncommitted in working tree.

Changed code surface (vs HEAD), exhaustive:
- Modified: `app/api/auth/login/route.js`, `app/api/groups/route.js`, `lib/auth-session.ts`
- New: `lib/auth-audit.ts`, `lib/auth-login-rate-limit.js`, `lib/admin-password-reset.js`, `app/api/admin/password-reset/route.js`, `tests/auth-login-rate-limit.test.js`, `tests/admin-password-reset.test.js`, `scripts/migration-task-{5,11,19}-*.sql`
- Untracked non-code data artifact: `docs/agent-context/tenagaMedis_2215.csv` (NIP source data referenced in plan Interview Summary; not code — out of audit scope, no source touched).

---

## PART A — DONE TASKS (10) — scope fidelity

### T1 — Preflight SQL audit  →  **COMPLIANT**
- Spec (plan L202-204): read-only `mysql --batch` audit of (a) admin01 tb_karyawan link, (b) Yustisia kar29 rows, (c) placeholders 9990001-9990044, (d) PK/isDeleted/nip-unique, (e) bcrypt count → write `.omo/evidence/auth-nip/task-1-preflight.txt`. Must NOT do: no mutations.
- Diff cite: ZERO code/schema diff. Evidence `task-1-preflight.txt` (9.6K) present.
- Verdict: read-only audit, no source change, artifact delivered. COMPLIANT.

### T2 — Confirm session payload shape  →  **COMPLIANT**
- Spec (L244-246): read `lib/auth-session.ts`, document subject format / TTL=43200 / resolve SQL / decode branches → `task-2-payload-shape.md`. Must NOT do: no edits.
- Diff cite: no code change attributable to T2. Evidence `task-2-payload-shape.md` (8.1K) present.
- Verdict: documentation-only. COMPLIANT.

### T3 — QA harness + decisions lock  →  **COMPLIANT**
- Spec (L284-286): create `qa-harness.sh`, `qa-playwright-recipe.md`, `decisions.md` (M1=BAN+migrate, placeholder=BLOCK range). Must NOT do: don't re-open decisions.
- Diff cite: artifacts `qa-harness.sh` (1.7K), `qa-playwright-recipe.md` (2.2K), `decisions.md` (1.1K), `task-3-harness-run.txt` all present. No source code change.
- Verdict: scaffolding-only, no scope creep. COMPLIANT.

### T5 — M3 role-change audit table + writer  →  **COMPLIANT**
- Spec (L383-386): additive `CREATE TABLE IF NOT EXISTS tb_role_change_audit` (id PK, actor, target, action ENUM(grant,revoke), role_key, group_id NULL, created_at); writer helper `recordRoleChange`; wire into groups assign_leader/remove_leader. Must NOT do: no mutation of existing tables, no `cs_*`, parameterized.
- Diff cite:
  - `scripts/migration-task-5-role-change-audit.sql` L16-29: exact column set, `IF NOT EXISTS`, InnoDB, 3 indexes, no FK, no ALTER of legacy tables. ✓
  - `lib/auth-audit.ts` L31-62: `recordRoleChange(input, executor=pool)`, validates target>0 / action∈{grant,revoke} / roleKey non-empty, parameterized 5-placeholder INSERT (L54-58). No `as any`. ✓
  - `app/api/groups/route.js` diff L9 import, L141-147 grant wiring, L195-201 revoke wiring. Parameterized. ✓
- DB: `tb_role_change_audit` table EXISTS.
- Verdict: 1:1 with spec, additive only. COMPLIANT.

### T6 — H5 login rate-limit + unified error strings  →  **COMPLIANT**
- Spec (L425-427): per-IP + per-NIP rate-limit in login route (in-memory, ~10/min→429), unify divergent failure strings into one constant, CSRF OUT with rationale note. Must NOT do: no CSRF machinery, no DB/Redis store, don't change success path.
- Diff cite:
  - `lib/auth-login-rate-limit.js` L12-13 `WINDOW_MS=60_000`/`MAX_ATTEMPTS=10`, L56-76 sliding-window per `${ip}::${loginId}`, in-memory Map (L16), `unref()` cleanup (L31). ✓
  - `app/api/auth/login/route.js` diff L25 `INVALID_CREDENTIALS_MESSAGE='Invalid credentials'` + `invalidCredentialsResponse()` L27-32; rate-limit gate L40-56 (429 + Retry-After + X-RateLimit-Limit). All 4 prior 401 credential lanes unified: account-bad-pw (L66), nip-no-row (L87, was 'Invalid credentials or inactive account'), placeholder-block (L93), nip-bad-pw (L99). ✓
  - CSRF rationale note diff L22. ✓ Success path untouched.
- Verdict: exactly spec; no CSRF, no DB store. COMPLIANT.

### T7 — 44-placeholder login policy (BLOCK range)  →  **COMPLIANT**
- Spec (L467-469): reject NIP in range 9990001-9990044 in NIP login path, return unified invalid-cred error, named constants `PLACEHOLDER_NIP_MIN/MAX` with comment → `/tmp/nip_placeholder_report.tsv`, guard short rows 9999/99999. Must NOT do: no placeholder→real backfill, no leak, no over-broad 999* match.
- Diff cite:
  - `lib/auth-session.ts` diff L13-14 consts `PLACEHOLDER_NIP_MIN=9990001`/`MAX=9990044` (file L32-33), L16-23 `isPlaceholderEmployeeNip` (digit-only `/^\d+$/` + `Number.isInteger` + range → 9999/99999/alpha all false). Comment L9-12 with tsv pointer. ✓
  - Guard at login route diff L92-94 (BEFORE verifyPassword) returns unified `invalidCredentialsResponse()`. ✓
  - Defense-in-depth guard in `createAuthContextByNip` diff L40 (returns null). ByNip SELECT gained `k.nip AS karyawan_nip` (diff L33); WHERE still `a.nip=?` (auth.nip stays login key — no backfill, no JOIN-flip). ✓
- Verdict: range-only, unified error, no over-broad match. COMPLIANT.

### T8 — createAuthContextByKaryawanId resolver (additive)  →  **COMPLIANT**
- Spec (L519-523): add `createAuthContextByKaryawanId(karyawanId)` mirroring ByNip but keyed on `tb_karyawan.id`, JOIN `WHERE k.id=? AND a.is_active=1 AND k.isDeleted=0`, reuse B1/B2 role logic, parameterized. Must NOT do: don't change ByNip external behavior, don't drop nip column, no `as any`/`@ts-ignore`.
- Diff cite:
  - New fn at `lib/auth-session.ts` L639 (diff L51-183), inserted AFTER ByNip ends (hunk `@@ -616,+634`). SELECT diff L65: `WHERE k.id = ? AND a.is_active = 1 AND k.isDeleted = 0` (one `?`, parameterized). ✓
  - B2 global-only admin/hr (diff L84-85), B1 per-group is_leader map (diff L107-115) — mirrors shipped B1/B2 semantics; tb_user_group_access fallback READ (diff L140-159) mirrors ByNip; return block (diff L162-176) `subject_type:'employee_nip'`. ✓
  - ByNip itself: ONLY change is `karyawan_nip` alias + placeholder guard (T7) — no behavioral re-key. nip column NOT dropped. No `as any` in new fn (uses `users[0] as any` cast consistent with existing ByNip pattern, no `@ts-ignore`). ✓
- Verdict: additive, mirrors spec, ByNip behavior preserved. COMPLIANT.

### T11 — H4 groups leader READ+WRITE → tb_karyawan_roles (together)  →  **COMPLIANT**
- Spec (L694-697): GET sources leader list from `tb_karyawan_roles` group_leader rows (karyawan_id); assign_leader/remove_leader INSERT/DELETE `tb_karyawan_roles`; wire T5 audit on both; READ+WRITE in same change. Must NOT do: do NOT clean/stop tb_user_group_access writes, no adjacent CRUD refactor, multi-leader must work.
- Diff cite:
  - GET READ migrated: diff L56-72 — leader SELECT now `FROM tb_karyawan_roles r JOIN tb_karyawan k WHERE r.role_key=? AND r.group_id IS NOT NULL` (device-table SELECT removed). ✓
  - WRITE: assign diff L106-121 `INSERT INTO tb_karyawan_roles ... WHERE NOT EXISTS` (multi-leader-safe); remove diff L175-178 `DELETE FROM tb_karyawan_roles`. ✓
  - Audit wired: grant diff L141-147, revoke diff L195-201. ✓
  - Device writes RETAINED (column-gated dead data): assign diff L125-139, remove diff L181-193 — `INSERT/UPDATE tb_user_group_access` still fire under `if (await hasGroupAccessColumn('is_leader'))`. ✓ (matches Must NOT do).
  - `resolveKaryawanIdByPin` helper diff L13-19 (parameterized). Wire contract still projects pin/nip/nama for UI back-compat.
  - Backfill SQL `scripts/migration-task-11-leader-backfill.sql`: additive `INSERT ... WHERE NOT EXISTS`, no ALTER, no enum change.
- DB: 5 group_leader rows with group_id present.
- Verdict: read+write migrated together, device writes retained, multi-leader-safe. COMPLIANT.

### T18 — M2 bcrypt-only enforcement audit  →  **COMPLIANT**
- Spec (L1046-1048): verify all `password_hash` are bcrypt; for plaintext rows rehash or document pending; read-mostly, no schema change. Must NOT do: no self-service reset, don't weaken verifyPassword.
- Diff cite: ZERO code/schema diff. Evidence `task-18-bcrypt-audit.txt` (1.2K) documents kar10004 empty-hash/inactive exception (not rehashed).
- DB: `COUNT(password_hash NOT LIKE '$2%' AND is_active=1) = 0`. Invariant holds.
- Verdict: audit-only, invariant satisfied, exception documented. COMPLIANT.

### T19 — M4 admin-driven password reset  →  **COMPLIANT**
- Spec (L1086-1088): admin-only password reset setting `tb_karyawan_auth.password_hash` (bcrypt) for target karyawan_id; wire audit. Must NOT do: NO self-service/email reset, parameterized, bcrypt only.
- Diff cite:
  - `scripts/migration-task-19-password-reset-audit.sql` L26-35: additive `tb_password_reset_audit` (id, actor, target, created_at), no password material, separate table (avoids ENUM ALTER coupling with blocked T4). ✓
  - `lib/admin-password-reset.js` L18-51: pure core, 401 if !auth (L19), 403 generic 'Forbidden' if !is_admin (L21), zod validate (L13-16,23-26), `hashPassword` bcrypt (L29), parameterized UPDATE (L33-36), `recordPasswordReset` on same connection (L42-45). Admin-only, NO self-service path. ✓
  - `app/api/admin/password-reset/route.js` L21-33: thin adapter, force-dynamic. ✓
  - `lib/auth-audit.ts` L81-104 `recordPasswordReset` parameterized, stores no password. ✓
  - `tests/admin-password-reset.test.js` present.
- DB: `tb_password_reset_audit` EXISTS.
- Verdict: admin-driven only, bcrypt, parameterized, audited. COMPLIANT.

**DONE summary: 10 COMPLIANT / 10. Zero scope-creep, zero under-delivery.**

---

## PART B — DEFERRED TASKS (9) — confirm NOT touched

### T4 — M1 enum BAN+migrate  →  **CORRECTLY-DEFERRED**
- Evidence: `SHOW COLUMNS FROM tb_karyawan_roles LIKE 'role_key'` → `enum('admin','hr','group_leader','scheduler','viewer')` — STILL 5-value, NOT narrowed. `SELECT DISTINCT role_key` → admin/group_leader/viewer (viewer row NOT converted to employee). No enum ALTER in any migration SQL. Amendment-blocked (Oracle: shrink to viewer→employee, awaiting user A/B/C). Not touched ✓.

### T9 — session subject → karyawan_id  →  **CORRECTLY-DEFERRED**
- Evidence: `app/api/auth/login/route.js` L44 still `setAuthCookie(response, loginId, request, {subjectType})` — subject is the string `loginId`, NOT numeric karyawan_id. No tri-format decode added to `getAuthContextFromCookies`. Login diff contains only T6/T7 hunks (rate-limit, placeholder, unified error), no subject switch. Not touched ✓.

### T10 — H2 drop tb_karyawan_auth.nip  →  **CORRECTLY-DEFERRED**
- Evidence: `SHOW COLUMNS FROM tb_karyawan_auth LIKE 'nip'` → `nip varchar(50) NO UNI` — column STILL EXISTS (unique credential handle retained per Oracle CANCEL). No `ALTER ... DROP COLUMN nip` in any migration. ByNip resolve still `WHERE a.nip=?` (auth-session L517). Not touched ✓.

### T12 — dual-run verification  →  **CORRECTLY-DEFERRED**
- Evidence: verification gate task, blocked on T9/T10. No `t12-*` evidence file produced; no code change (verification-only task anyway). Not executed ✓.

### T13 — 12h soak + flip PAYLOAD_COMPAT  →  **CORRECTLY-DEFERRED**
- Evidence: `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` flag unchanged (default true, parseEnabledFlag intact). No flip. Wall-clock gate measured from T9 deploy; T9 itself deferred. Not touched ✓.

### T14 — PIN fallback flag off + soak  →  **CORRECTLY-DEFERRED**
- Evidence: `LEGACY_PIN_FALLBACK` flag unchanged. `createAuthContextByPin` intact. Blocked by T13. Not touched ✓.

### T15 — delete PIN path + tb_user_group_access auth READ  →  **CORRECTLY-DEFERRED**
- Evidence: `createAuthContextByPin` STILL EXISTS at `lib/auth-session.ts` L773 (exported). legacy_pin branch present: type union L86, decode L325, normalizeSubjectType L299, getAuthContextFromCookies dispatch L868/L870/L881/L895. tb_user_group_access auth READ still in ByNip (and mirrored in new ByKaryawanId fallback). Not touched ✓.

### T16 — break-glass gate  →  **CORRECTLY-DEFERRED**
- Evidence: gating verification, amendment-blocked (Oracle reassign to admin001/kar10006). kar9999/ADMIN01 remains is_active=0 (NOT reactivated). No `t16-*` break-glass evidence. Not executed ✓.

### T17 — remove auth_accounts lane + H3 isDeleted on all NIP resolves  →  **CORRECTLY-DEFERRED**
- Evidence: account lane fully intact — `findAuthAccountByLoginId` L379, `createAuthContextByLoginId` L417, `ACCOUNT_ROLE_COMPAT` L146 all present in auth-session.ts; login route account branch L93-164 intact. `auth_accounts` table STILL HAS row `admin01` (COUNT=1). H3 NOT enforced on ByNip (`WHERE a.nip=? AND a.is_active=1`, no `k.isDeleted=0`). Not touched ✓.

**DEFERRED summary: 9 CORRECTLY-DEFERRED / 9. Zero touched-without-authorization.**

---

## PART C — SPECIAL INVARIANT CHECKS (5)

| # | Invariant | Evidence | Verdict |
|---|-----------|----------|---------|
| 1 | B1/B2 NOT re-touched (prior fix a4aa214) | `createAuthContextByNip` only change = `karyawan_nip` SELECT alias + T7 placeholder guard (diff hunk `@@ -498,+514`). B1/B2 comment lines in diff (L82-85, L104-115) belong to the NEW `createAuthContextByKaryawanId` fn (hunk `@@ -616,+634`, an insertion), which intentionally mirrors B1/B2 per T8 spec — original ByNip B1/B2 logic unmodified. | **PASS** |
| 2 | `tb_user_group_access` WRITES retained in groups/route.js (device dead-data, column-gated) | `grep` → `INSERT INTO tb_user_group_access` L209, `UPDATE tb_user_group_access` L253, both under `if (await hasGroupAccessColumn('is_leader'))`. Only auth READS migrated. | **PASS** |
| 3 | No `cs_*` cross-service migration prefix anywhere | `git diff HEAD` → NONE; grep new SQL/lib/route files → NONE. | **PASS** |
| 4 | Ordering spine respected (H2 column drop deferred T10; account removal deferred T17; break-glass T16 not gated) | T10 nip column EXISTS (DB); T17 auth_accounts row EXISTS + account lane code intact; T16 no break-glass run, kar9999 still inactive. All amendment-blocked tasks unexecuted; no out-of-order execution. | **PASS** |
| 5 | No commits made | `git log HEAD --oneline \| head -5` → `a4aa214`, `ae052a2`, `080248c`, `4092365`, `ea6db8d`. HEAD unchanged; all wave changes uncommitted in working tree. | **PASS** |

**Invariants: 5/5 PASS.**

---

## VERDICT

`Tasks [10 COMPLIANT + 9 CORRECTLY-DEFERRED / 19] | Ordering [OK] | Scope-creep [CLEAN] | Invariants [5/5 PASS] | VERDICT: APPROVE-FOR-COMPLETED-SCOPE`

Notes:
- Every DONE task built exactly its spec; no scope creep, no under-delivery, no forbidden patterns.
- Every DEFERRED task correctly untouched, consistent with the Oracle amendment block awaiting user A/B/C decision.
- Non-code data artifact `docs/agent-context/tenagaMedis_2215.csv` is untracked NIP source data (plan Interview Summary), not a code change — outside scope-fidelity surface.
- Approval scope is **the completed partial wave only**. Plan as a whole remains incomplete (9 amendment-blocked tasks pending user decision) — this is by design, NOT a defect.
