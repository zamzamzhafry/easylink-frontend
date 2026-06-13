# Auth NIP Re-Anchor Migration

## TL;DR

> **Quick Summary**: Collapse EasyLink's 3 auth lanes (account / employee_nip / legacy_pin) into a single NIP-anchored lane where login resolves an employee by `tb_karyawan.nip`, the session subject is the immutable `karyawan_id` PK, and all role/leader capability comes from `tb_karyawan_roles` — removing the fragile machine-derived `tb_user_group_access` auth path and the standalone `auth_accounts` lane.
>
> **Deliverables**:
> - Session subject switched from `nip:X` string to numeric `karyawan_id` (H1) with backward-compatible cookie decode for `nip:`/`account:` during one 12h TTL window
> - Login + `/me` resolve identity via `tb_karyawan k JOIN tb_karyawan_auth a ON a.karyawan_id=k.id WHERE k.nip=? AND k.isDeleted=0` (H2 + H3)
> - Groups UI leader read+write migrated from `tb_user_group_access` (PIN) to `tb_karyawan_roles` (karyawan_id) — together (H4)
> - Per-IP + per-NIP login rate limit + unified error strings (H5; CSRF OUT for LAN)
> - Role-key enum decision applied (M1), bcrypt-only password storage verified (M2), role-change audit log (M3), admin-driven password reset (M4)
> - Legacy PIN lane removed (Step 6) then `auth_accounts` account lane removed LAST (Step 7), each via flag-off-soak-then-delete
> - 44 placeholder NIPs (9990001–9990044) login-policy enforced
>
> **Estimated Effort**: Large (3d+, multi-session, off-hours cutover windows)
> **Parallel Execution**: PARTIAL — strict ordering spine (preflight → H1/H2/H3 → H4 → dual-run → PIN removal → account removal), with independent side-tasks (M3 audit, H5 rate-limit, M1 enum, M2 verify, QA harness) parallelizable within waves
> **Critical Path**: Preflight gates → Step 3 (subject→karyawan_id + JOIN resolver) → H2 drop column → Step 4 (groups UI) → Step 5 dual-run → 12h soak → Step 6 (PIN off→delete) → Step 7 (account off→delete + isDeleted + rate-limit)

---

## Context

### Original Request
User (verbatim across turns): "we need to fix collision logic ... i want to bind the login data on NIP of employee and the password on there. not the TB_USER which from fetched machine. too fragile. and then they are given leader role. could be multiple leader in the group assigned and has access to create their schedule too". Later: "Make a plan and momus review immediately later. And then we do handoff" + "Resume planning and do momus and handoff if final" (high-accuracy / Momus mode REQUESTED).

### Interview Summary
**Already DONE this session (OUT of this plan's scope, referenced not redone):**
- B1 (per-group `is_leader` no longer broadcast across all groups) — commit a4aa214, browser+curl verified
- B2 (group-scoped admin row no longer confers global admin) — commit a4aa214, verified
- NIP backfill: 94 real NIPs from `docs/agent-context/tenagaMedis_2215.csv` + 44 placeholders (9990001–9990044); `tb_karyawan.nip` now 0 NULL / 138 set
- Seed lanes loaded: admin001/leader001/employee001 (pw `password`, auto-upgraded to bcrypt), role rows in `tb_karyawan_roles` + canonical `cs_*` tables; seed group_id=32

**Current live auth state (demo_easylinksdk):**
- `auth_accounts`: only `admin01` / `Admin@123` (account lane, bcrypt) — break-glass admin
- `tb_karyawan_auth` ACTIVE: kar10006 admin001, kar10007 leader001, kar10008 employee001 (bcrypt). INACTIVE: kar9999 ADMIN01 (tactical 409 fix), kar10003 HRD01, kar10004 99999 (empty hash)
- `tb_karyawan_roles`: kar9999 admin/NULL, kar10006 admin/NULL (global), kar10007 group_leader/grp32, kar10008 viewer/grp32

**Authoritative design source**: `docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md` (Oracle adversarial review, 105 lines). This plan implements its steps 3-7 + H1-H5 + M1-M4.

### Metis Review (gaps addressed in this plan)
- Cookie-compat must decode THREE subject formats in flight (`nip:`, `account:`, numeric `karyawan_id`) — else account-lane mass logout → Task wave 2
- 44 placeholder NIPs pass the NOT-NULL gate but aren't real people → explicit login policy Task
- admin01 `tb_karyawan` row + Yustisia kar29 auth/role rows UNVERIFIED → preflight Task (blocking gate before Step 7)
- H2 column drop MUST land after JOIN-resolver (grep no `a.nip` reads remain) → ordering enforced
- 12h cookie window is a HARD gate, not instant → explicit wait-then-flip Task
- M1 enum (RESOLVED: BAN + migrate to 3-role) + 44-placeholder (RESOLVED: BLOCK range 9990001-9990044) — decisions locked in T3 decisions.md; did not change step ordering

---

## Work Objectives

### Core Objective
Re-anchor all interactive web authentication to a single NIP-resolved, `karyawan_id`-keyed lane sourcing every role/capability from `tb_karyawan_roles`, and decommission the fragile `tb_user_group_access` auth path, the legacy PIN lane, and the standalone `auth_accounts` lane — without a hard cut or admin lockout.

### Concrete Deliverables
- `lib/auth-session.ts`: `createAuthContextByKaryawanId(id)`; NIP login resolves via `tb_karyawan.nip` JOIN with `AND k.isDeleted=0`; session subject = numeric `karyawan_id`; backward-compatible decode of `nip:`/`account:` cookies for one TTL
- `app/api/auth/login/route.js` + `app/api/auth/me/route.js`: aligned to karyawan_id subject; unified error strings; rate-limit hook
- `app/api/groups/route.js`: leader read+write on `tb_karyawan_roles`
- Migration SQL: drop `tb_karyawan_auth.nip` (H2), `tb_role_change_audit` table (M3)
- Env flag flips: `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=off` (Step 6), account-lane removal (Step 7), `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` lifecycle
- Break-glass DB seed/reset script (retained + QA-verified)

### Definition of Done
- [ ] NIP login (real + seed) returns 200 with numeric `karyawan_id` session subject; `/me` rebuilds correct context
- [ ] Legacy PIN login returns 401; `auth_accounts` account login returns 401 (after Step 7)
- [ ] Soft-deleted employee (`isDeleted=1`) → `/me` 401 within 1 request
- [ ] Groups leader list sourced from `tb_karyawan_roles`; removing a `tb_user_group_access.is_leader` row changes nothing
- [ ] `SELECT COUNT(*) FROM tb_karyawan_auth WHERE password_hash NOT LIKE '$2%'` = 0
- [ ] Break-glass script on fresh DB → admin login 200
- [ ] `npm run typecheck` + `npm run build` clean; all `node --test tests/*.test.js` auth suites pass

### Must Have
- Backward-compatible session decode across the full 12h TTL after Step 3
- Both account + PIN lanes alive through Step 5 (dual-run)
- Break-glass verified end-to-end (real NIP-admin login while both lanes live) BEFORE removing the account branch
- Parameterized SQL only

### Must NOT Have (Guardrails)
- NO hard cut of any lane (every removal = flag-off-soak-then-delete, reversible middle)
- NO disabling `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` before the 12h window closes
- NO `cs_*` table migration (roles stay on `tb_karyawan_roles`)
- NO full CSRF build (LAN-only — rate-limit IN, CSRF token OUT/documented per grill H5)
- NO cleanup of `tb_user_group_access` WRITES (machine keeps writing device column as dead data — Step 4 migrates READ+WRITE of the leader concept only)
- NO self-service / email password reset (admin-driven only — M4)
- NO `as any` / `@ts-ignore` / `@ts-expect-error`
- NO removing or skipping failing tests
- NO placeholder→real NIP backfill before Step 3 lands (would re-introduce H1 mutable-subject bug)
- NO commit/push unless the user explicitly asks

### Spec Framework Integration
- **Detected Framework**: None (no `openspec/` or `.specify/` in repo). Section omitted.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification agent-executed.

### Test Decision
- **Infrastructure exists**: YES — `tests/*.test.js` via Node built-in `node:test` runner. There is NO `npm test` script. Exact command: `node --test tests/<file>.test.js`.
- **Automated tests**: Tests-after per task (regression-critical migration) + per-step curl + Playwright e2e.
- **Gates (CONTEXT.md mandatory)**: `npm run typecheck` AND `npm run build` must pass before wrap.

### QA Policy
Every task includes agent-executed QA. Evidence → `.omo/evidence/auth-nip/task-{N}-{slug}.{ext}`.
- **API/lane**: Bash `curl` against dev server on :3000 (start via `npm run dev`, tmux session `elworkspace`, log `/tmp/el-workspace-dev.log`). Assert HTTP status + `jq` field values.
- **Browser/role-gated nav**: Playwright via `skill_mcp mcp_name="playwright"`. CRITICAL: trusted `.click()` is DEAD in this MCP browser — drive login with `page.fill('#login-id', ...)` + `page.fill('#login-password', ...)` then `page.evaluate(f => f.requestSubmit(), form)`. Clear cookies between accounts.
- **DB assertions**: `mysql --batch` with creds from `.env` (`set -a && source .env && set +a`).
- **Unit**: `node --test tests/<file>.test.js`.

### Test Accounts (live)
- account lane: `admin01` / `Admin@123`
- NIP lane: `admin001` / `leader001` / `employee001`, all pw `password` (bcrypt)

---

## Execution Strategy

### Parallel Execution Waves

> Strict ordering spine for the migration steps; side-tasks parallelize within each wave.

```
Wave 0 — PREFLIGHT GATES (run first, BLOCKING):
├── Task 1: Preflight SQL audit (admin01 tb_karyawan row, Yustisia kar29, placeholders, isDeleted/PK/nip-unique, bcrypt count) [quick]
├── Task 2: Confirm session payload shape + TTL + current NIP resolve query (grep/read) [quick]
└── Task 3: Build the curl+Playwright QA harness script + decision lock-in (M1 enum, placeholder policy) [quick]

Wave 1 — DECISIONS + INDEPENDENT SCAFFOLDING (parallel):
├── Task 4: M1 enum — BAN non-canonical keys + migrate rows to 3-role enum (admin/group_leader/employee) [unspecified-high]
├── Task 5: M3 role-change audit table migration SQL + writer helper [implementation]
├── Task 6: H5 rate-limit (per-IP+per-NIP) + unify login error strings [implementation]
└── Task 7: 44-placeholder login policy — BLOCK range 9990001-9990044 [implementation]

Wave 2 — STEP 3 CORE (subject → karyawan_id + JOIN resolver, H1+H2+H3) [SEQUENTIAL spine]:
├── Task 8: createAuthContextByKaryawanId + NIP resolve via tb_karyawan.nip JOIN + isDeleted=0 (H1/H3) [ultrabrain]
├── Task 9: Session subject = numeric karyawan_id; tri-format compat decode (nip:/account:/id) [ultrabrain]
└── Task 10: H2 — drop tb_karyawan_auth.nip migration AFTER grep proves no a.nip reads remain [implementation]

Wave 3 — STEP 4 GROUPS UI (H4) [after Wave 2]:
└── Task 11: groups route leader READ+WRITE → tb_karyawan_roles (together) [deep]

Wave 4 — STEP 5 DUAL-RUN + SOAK:
├── Task 12: Dual-run verification (NIP + account both 200 same window) [unspecified-high]
└── Task 13: 12h cookie-compat soak gate (explicit wait-then-flip PAYLOAD_COMPAT) [quick]

Wave 5 — STEP 6 PIN LANE REMOVAL (flag-off-soak-then-delete):
├── Task 14: EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=off + soak verify [implementation]
└── Task 15: Delete PIN path + tb_user_group_access auth READ (device writes intact) [implementation]

Wave 6 — STEP 7 ACCOUNT LANE REMOVAL (LAST, gated on break-glass) + M2/M4:
├── Task 16: Break-glass verify gate (real NIP-admin e2e login while lanes live) [unspecified-high] BLOCKING
├── Task 17: Remove auth_accounts branch + tag/branch rollback point [implementation]
├── Task 18: M2 bcrypt-only enforcement + M4 admin-driven password reset [implementation]
└── Task 19: Final isDeleted=0 + rate-limit wiring confirm + orphan leader sweep [deep]

Wave FINAL — 4 parallel reviews → user okay:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — all lanes/roles (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1→T2→T8→T9→T10→T11→T12→T13→T14→T15→T16→T17→F1-F4→user okay
```

### Dependency Matrix (full)

- **1,2,3**: Blocked by — none. Blocks → all.
- **4,5,6,7**: Blocked by 1,2,3. Blocks → (independent of spine; merge before Wave 6).
- **8**: Blocked by 1,2. Blocks → 9,10.
- **9**: Blocked by 8. Blocks → 10,11.
- **10 (H2 drop)**: Blocked by 8,9 (+ grep gate). Blocks → 11.
- **11**: Blocked by 9,10. Blocks → 12.
- **12**: Blocked by 11. Blocks → 13.
- **13 (12h soak)**: Blocked by 12. Blocks → 14.
- **14**: Blocked by 13. Blocks → 15.
- **15**: Blocked by 14. Blocks → 16.
- **16 (break-glass gate)**: Blocked by 15. Blocks → 17. BLOCKING.
- **17**: Blocked by 16. Blocks → 18,19.
- **18,19**: Blocked by 17. Blocks → F1-F4.

### Agent Dispatch Summary

- **Wave 0**: T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 1**: T4 `unspecified-high`, T5 `implementation`, T6 `implementation`, T7 `implementation`
- **Wave 2**: T8 `ultrabrain`, T9 `ultrabrain`, T10 `implementation`
- **Wave 3**: T11 `deep`
- **Wave 4**: T12 `unspecified-high`, T13 `quick`
- **Wave 5**: T14 `implementation`, T15 `implementation`
- **Wave 6**: T16 `unspecified-high`, T17 `implementation`, T18 `implementation`, T19 `deep`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> Implementation + verification = ONE task. EVERY task has Recommended Agent Profile + Parallelization + References + Acceptance Criteria + QA Scenarios.

- [x] 1. Preflight SQL audit — verify all migration assumptions

  **What to do**:
  - Run `mysql --batch` (creds via `set -a && source .env && set +a`) to confirm: (a) `admin01` has a `tb_karyawan` row (`SELECT k.id FROM auth_accounts a JOIN tb_karyawan k ON k.nip=a.login_id OR k.id=...` — determine the actual link; if account lane has no karyawan link, RECORD that admin01 break-glass needs a dedicated tb_karyawan_auth+role row before Step 7); (b) Yustisia kar29 has tb_karyawan_auth + tb_karyawan_roles rows; (c) placeholders 9990001–9990044 exist and which karyawan_ids; (d) `tb_karyawan` PK name, `isDeleted` column exists, `nip` is UNIQUE; (e) `SELECT COUNT(*) FROM tb_karyawan_auth WHERE password_hash NOT LIKE '$2%'` (bcrypt coverage).
  - Write findings to `.omo/evidence/auth-nip/task-1-preflight.txt`.

  **Must NOT do**: No mutations — read-only audit. No assumptions; every value comes from a query.

  **Recommended Agent Profile**:
  - **Category**: `quick` — deterministic read-only SQL audit.
  - **Skills**: none (plain mysql + bash).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 0** with Tasks 2, 3.
  - **Blocks**: ALL subsequent tasks (gates Step 7 break-glass especially).
  - **Blocked By**: None — start immediately.

  **References**:
  - `.env` — DB creds (`DB_HOST/DB_USER/DB_PASSWORD/DB_NAME=demo_easylinksdk`).
  - `docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md` B3/H3 — why admin01 tb_karyawan row + isDeleted matter.
  - `/tmp/nip_placeholder_report.tsv` — placeholder↔id↔name map (if still present; else re-derive `WHERE nip LIKE '9990%'`).

  **Acceptance Criteria**:
  - [ ] `.omo/evidence/auth-nip/task-1-preflight.txt` contains a YES/NO + value for each of (a)–(e).
  - [ ] If admin01 has NO tb_karyawan link → flagged explicitly as a Step-7 blocker with the remediation row to insert.

  **QA Scenarios**:
  ```
  Scenario: Preflight audit produces complete decision data
    Tool: Bash (mysql --batch)
    Preconditions: dev DB reachable, .env sourced
    Steps:
      1. Run the 5 audit queries (a)-(e), tee to evidence file
      2. Assert each query returned a row/count (no empty/error)
      3. grep the evidence file for "admin01" link result
    Expected Result: evidence file has 5 labeled answers; admin01 link status is explicit YES or NO
    Failure Indicators: any query errors, or admin01 link ambiguous
    Evidence: .omo/evidence/auth-nip/task-1-preflight.txt
  ```

  **Commit**: NO (audit only).

- [x] 2. Confirm session payload shape, TTL, and current NIP resolve query

  **What to do**:
  - Read `lib/auth-session.ts`: locate `createAuthContextByNip` (NIP resolve `WHERE a.nip=?`), the session token encode/decode (subject format `nip:`/`account:`, `v:2`, `exp`), `setAuthCookie` (maxAge 43200 = 12h), `getAuthContextFromCookies` decode waterfall, and `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` usage.
  - Document verbatim: current subject string format, TTL seconds, the exact resolve SQL, and every cookie-decode branch. Write to `.omo/evidence/auth-nip/task-2-payload-shape.md`.

  **Must NOT do**: No edits — read/document only. This is the gate that unblocks Task 8/9 design.

  **Recommended Agent Profile**:
  - **Category**: `quick` — targeted code read + documentation.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 0** with Tasks 1, 3.
  - **Blocks**: Tasks 8, 9 (must not design subject switch before payload shape confirmed).
  - **Blocked By**: None.

  **References**:
  - `lib/auth-session.ts` — `createAuthContextByNip` (~L487-568), token encode/decode, `setAuthCookie`, `getAuthContextFromCookies` (~L675).
  - `docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md` H1 — subject must become karyawan_id.

  **Acceptance Criteria**:
  - [ ] `.omo/evidence/auth-nip/task-2-payload-shape.md` records current subject format, TTL (expect 43200), resolve SQL, and all decode branches with line refs.

  **QA Scenarios**:
  ```
  Scenario: Payload shape fully documented with line refs
    Tool: Bash (grep) + Read
    Preconditions: repo checked out
    Steps:
      1. grep -n "nip:" "account:" maxAge PAYLOAD_COMPAT in lib/auth-session.ts
      2. Assert evidence doc cites each with a line number
      3. Assert TTL value recorded == 43200
    Expected Result: doc has subject format + TTL + resolve SQL + decode branches, all line-referenced
    Failure Indicators: any of the 4 items missing or unreferenced
    Evidence: .omo/evidence/auth-nip/task-2-payload-shape.md
  ```

  **Commit**: NO.

- [x] 3. Build QA harness + lock in M1 / placeholder decisions

  **What to do**:
  - Create `.omo/evidence/auth-nip/qa-harness.sh`: helper that starts dev server (if not running) on :3000, and runs a parameterized curl-login (`login_id`,`password`) printing status + `jq` of `subject_type`,`karyawan_id`,`is_admin`,`is_leader`,`groups`. Document the Playwright login recipe (`page.fill('#login-id')`+`page.fill('#login-password')`+`form.requestSubmit()`; trusted click dead) in `.omo/evidence/auth-nip/qa-playwright-recipe.md`.
  - Record the two user DECISIONS (RESOLVED 2026-06-12) to `.omo/evidence/auth-nip/decisions.md`: **M1 = BAN + migrate** (convert hr/scheduler/viewer rows to canonical admin/group_leader/employee, narrow enum); **placeholder = BLOCK range 9990001-9990044** from login.

  **Must NOT do**: Do not re-open the decisions — both are RESOLVED above. decisions.md just records them verbatim for the executor.

  **Recommended Agent Profile**:
  - **Category**: `quick` — scripting + documentation.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 0** with Tasks 1, 2.
  - **Blocks**: provides harness used by all QA scenarios.
  - **Blocked By**: None.

  **References**:
  - Prior verified login shape: `curl -X POST /api/auth/login -d '{"login_id":"...","password":"..."}'` returns `subject_type`,`karyawan_id`,`is_admin`,`is_leader`,`groups[]`.
  - Login form selectors: `#login-id`, `#login-password`, single `<form>`.

  **Acceptance Criteria**:
  - [ ] `qa-harness.sh` runs and prints a parsed login result for `employee001`/`password`.
  - [ ] `qa-playwright-recipe.md` + `decisions.md` exist.

  **QA Scenarios**:
  ```
  Scenario: Harness logs in a seed account and parses fields
    Tool: Bash (qa-harness.sh + curl + jq)
    Preconditions: dev server on :3000 (npm run dev, tmux elworkspace)
    Steps:
      1. bash .omo/evidence/auth-nip/qa-harness.sh employee001 password
      2. Assert printed status == 200
      3. Assert jq subject_type == "employee_nip" and karyawan_id == 10008
    Expected Result: harness prints 200 + employee_nip + 10008
    Failure Indicators: non-200, null fields, jq parse error
    Evidence: .omo/evidence/auth-nip/task-3-harness-run.txt
  ```

  **Commit**: NO.

- [~] 4. M1 — BAN non-canonical role keys + migrate rows to 3-role enum
  > **BLOCKED — awaiting user approval of preflight amendment.** Preflight (T1) found NO scheduler/hr rows; only off-canon row is `viewer` (kar10008). Oracle-directed rescope: shrink T4 to `viewer→employee` + enum-narrow only. Needs user OK before mutating role rows.

  **What to do** (DECISION LOCKED = BAN + migrate):
  - Write migration SQL that converts existing `tb_karyawan_roles` rows: `scheduler` → `group_leader`, `hr` → `admin` (hr was mapped to global/admin-equivalent in NIP lane), `viewer` → `employee`. Parameterized; back up affected rows first (`SELECT` snapshot) and emit a rollback SQL.
  - After rows are converted, narrow the ENUM to canonical `('admin','group_leader','employee')` via `ALTER TABLE tb_karyawan_roles MODIFY role_key ENUM('admin','group_leader','employee') NOT NULL`.
  - Update `createAuthContextByNip` mapping in `lib/auth-session.ts`: remove the `scheduler→leader` / `hr→global` special-cases; `is_leader` derives from `group_leader`, `is_admin` from `admin` global row (consistent with B1/B2 logic already shipped).
  - This is a DECISION application, not an open-ended refactor — touch only role-mapping code + one migration file.

  **Must NOT do**: Do NOT rewrite unrelated role logic. Do NOT migrate to `cs_*`. Do NOT narrow the enum BEFORE converting rows (FK/enum-truncation risk). Do NOT drop the rollback snapshot.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — decision-bound code/SQL change with correctness risk.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** with Tasks 5, 6, 7.
  - **Blocks**: clean role mapping consumed by Task 8.
  - **Blocked By**: Tasks 1-3 (decision must be locked in `decisions.md`).

  **References**:
  - `lib/auth-session.ts` `createAuthContextByNip` role mapping (`scheduler→leader` ~L514, `hr→global` ~L531).
  - `lib/domain/employee-auth-model.ts` — canonical 3-role types.
  - `docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md` M1.
  - CONTEXT.md — canonical roles = admin/group_leader/employee.

  **Acceptance Criteria**:
  - [ ] Migration converts rows: `SELECT DISTINCT role_key FROM tb_karyawan_roles` returns ONLY `{admin, group_leader, employee}` (zero hr/scheduler/viewer).
  - [ ] `SHOW COLUMNS FROM tb_karyawan_roles LIKE 'role_key'` shows enum narrowed to 3 values.
  - [ ] Mapping code special-cases removed; unit test asserts a `group_leader` row → is_leader, a global `admin` row → is_admin.
  - [ ] Rollback SQL snapshot exists. `npm run typecheck` clean.

  **QA Scenarios**:
  ```
  Scenario: Enum banned to 3-role + rows migrated
    Tool: Bash (node --test) + mysql
    Preconditions: decision BAN locked in decisions.md; row snapshot taken
    Steps:
      1. mysql SELECT DISTINCT role_key FROM tb_karyawan_roles
      2. Assert result subset of {admin,group_leader,employee} (zero hr/scheduler/viewer)
      3. mysql SHOW COLUMNS FROM tb_karyawan_roles LIKE 'role_key' -> assert 3-value enum
      4. node --test tests/auth-session-compat.test.js
    Expected Result: only canonical roles, 3-value enum, tests pass
    Failure Indicators: stray hr/scheduler/viewer row, enum still 5-value, test fail
    Evidence: .omo/evidence/auth-nip/task-4-enum.txt

  Scenario: Negative — narrowing enum before row-convert is rejected/ordered
    Tool: Bash (mysql dry-run)
    Preconditions: rows still contain a scheduler/hr/viewer value
    Steps:
      1. Attempt ALTER ... MODIFY role_key ENUM(3-value) while a viewer row exists
      2. Assert it errors or truncates (proving convert-MUST-precede-narrow ordering)
    Expected Result: ordering enforced; convert runs first in the migration
    Evidence: .omo/evidence/auth-nip/task-4-enum-ordering.txt
  ```

  **Commit**: groups with Wave 1 (`feat(auth): ...`) — only if user asks.

- [x] 5. M3 — role-change audit table + writer helper

  **What to do**:
  - Write migration SQL creating `tb_role_change_audit` (`id PK, actor_karyawan_id, target_karyawan_id, action ENUM('grant','revoke'), role_key, group_id NULL, created_at`) — `CREATE TABLE IF NOT EXISTS`, additive, parameterized.
  - Add a writer helper (e.g. `lib/auth-audit.ts` `recordRoleChange(...)`) and call it from the role/leader mutation paths in `app/api/groups/route.js` (assign_leader/remove_leader) and any admin role-grant route.

  **Must NOT do**: No mutation of existing tables. No `cs_*`. Keep SQL parameterized.

  **Recommended Agent Profile**:
  - **Category**: `implementation` — schema + helper + call-site wiring.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** with Tasks 4, 6, 7.
  - **Blocks**: none directly (audit is additive).
  - **Blocked By**: Tasks 1-3.

  **References**:
  - `app/api/groups/route.js` assign_leader/remove_leader write paths.
  - Existing migration file style under `scripts/` / `*.sql` (match additive `IF NOT EXISTS` convention).
  - Grill M3.

  **Acceptance Criteria**:
  - [ ] `tb_role_change_audit` exists after migration; a role change inserts exactly 1 row with actor+target+timestamp.
  - [ ] `npm run typecheck` + `npm run build` clean.

  **QA Scenarios**:
  ```
  Scenario: Role grant writes one audit row
    Tool: Bash (curl + mysql)
    Preconditions: dev server up, audit table migrated, admin session cookie
    Steps:
      1. curl assign_leader for a test karyawan/group via groups route
      2. mysql SELECT COUNT(*) FROM tb_role_change_audit WHERE target_karyawan_id=<X> AND created_at>NOW()-INTERVAL 1 MINUTE
      3. Assert count == 1 with non-null actor + role_key
    Expected Result: exactly one audit row with actor, target, role_key, ts
    Failure Indicators: 0 rows, or null actor
    Evidence: .omo/evidence/auth-nip/task-5-audit.txt
  ```

  **Commit**: Wave 1 group — only if user asks.

- [x] 6. H5 — login rate-limit (per-IP + per-NIP) + unify error strings

  **What to do**:
  - Add per-IP + per-NIP rate limiting to `app/api/auth/login/route.js` (in-memory store acceptable — LAN single-instance; document the limit, e.g. 10/min → 429). Unify the two divergent failure error strings (grill notes `login:97` vs `:105`) into one constant so invalid-id and invalid-password return the same message (no user enumeration).
  - CSRF is OUT (LAN-only) — add a one-line code/doc note referencing grill H5 rationale.

  **Must NOT do**: No CSRF token machinery. No DB/Redis store (in-memory only). Don't change success path.

  **Recommended Agent Profile**:
  - **Category**: `implementation`.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** with Tasks 4, 5, 7.
  - **Blocks**: rate-limit confirmed again in Task 19.
  - **Blocked By**: Tasks 1-3.

  **References**:
  - `app/api/auth/login/route.js` error returns (~L97, ~L105) + `middleware.ts` existing rate-limit store pattern (reuse if present).
  - Grill H5.

  **Acceptance Criteria**:
  - [ ] 11th rapid login attempt within the window → HTTP 429.
  - [ ] Invalid id and invalid password return identical error string.
  - [ ] `npm run typecheck` + `npm run build` clean.

  **QA Scenarios**:
  ```
  Scenario: Rapid logins trip 429; errors unified
    Tool: Bash (curl loop)
    Preconditions: dev server up
    Steps:
      1. Loop 11x POST /api/auth/login with bad creds from same IP
      2. Assert attempt #11 returns 429
      3. Compare error body of invalid-id vs invalid-password -> assert identical string
    Expected Result: 429 on 11th; identical error messages
    Failure Indicators: no 429, or distinguishable error strings (enumeration)
    Evidence: .omo/evidence/auth-nip/task-6-ratelimit.txt
  ```

  **Commit**: Wave 1 group — only if user asks.

- [x] 7. 44-placeholder login policy enforcement

  **What to do** (DECISION LOCKED = BLOCK range):
  - In the NIP login path, reject any login where the resolved NIP falls in the placeholder range `9990001–9990044` (numeric range check; the placeholders are exactly these 44 values). Return the SAME unified error string used for invalid creds — no special signal that distinguishes a placeholder.
  - Define the range as a named constant (e.g. `PLACEHOLDER_NIP_MIN=9990001`, `PLACEHOLDER_NIP_MAX=9990044`) with a comment pointing to `/tmp/nip_placeholder_report.tsv`; guard against the distinct shorter test rows `9999`/`99999` (kar10002/kar10004) NOT being caught by the range.

  **Must NOT do**: Do NOT backfill placeholder→real NIPs here (that's HR's task and must wait until after Step 3). Do NOT leak that an account is a placeholder. Do NOT accidentally block real NIPs that merely start with `999` but fall outside 9990001–9990044.

  **Recommended Agent Profile**:
  - **Category**: `implementation`.
  - **Skills**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Wave 1** with Tasks 4, 5, 6.
  - **Blocks**: none.
  - **Blocked By**: Tasks 1-3 (policy decision).

  **References**:
  - `lib/auth-session.ts` NIP login resolve path.
  - `/tmp/nip_placeholder_report.tsv` placeholder map; range 9990001–9990044.
  - Grill / Metis edge-case note on placeholders.

  **Acceptance Criteria**:
  - [ ] A placeholder NIP in 9990001–9990044 cannot obtain a 200 login (returns unified invalid-cred error).
  - [ ] A real NIP (employee001 / a backfilled real NIP) still logs in 200.
  - [ ] Denial error text for placeholder is byte-identical to the invalid-password error (no enumeration leak).

  **QA Scenarios**:
  ```
  Scenario: Placeholder NIP blocked, real NIP allowed
    Tool: Bash (curl)
    Preconditions: dev server up; give a placeholder karyawan (e.g. 9990001) an active auth row + password so the block (not a missing row) is what denies it
    Steps:
      1. curl login with placeholder NIP 9990001 + its password -> assert NOT 200 (401/blocked)
      2. curl login employee001/password -> assert 200
      3. diff the placeholder-denial body vs an invalid-password body -> assert identical
    Expected Result: placeholder denied by range-guard, real allowed, identical error text
    Failure Indicators: placeholder logs in, or real account broken, or distinguishable error
    Evidence: .omo/evidence/auth-nip/task-7-placeholder.txt

  Scenario: Negative — boundary NIPs outside range still allowed
    Tool: Bash (curl)
    Preconditions: a real NIP numerically near but outside 9990001-9990044 exists (or synth-test the guard)
    Steps:
      1. Assert NIP 9990045 / 9990000 (if present as real) are NOT blocked by the range guard
      2. Assert shorter test rows 9999/99999 are unaffected by the range check
    Expected Result: only 9990001-9990044 blocked; no over-broad 999* match
    Evidence: .omo/evidence/auth-nip/task-7-placeholder-boundary.txt
  ```

  **Commit**: Wave 1 group — only if user asks.

- [x] 8. lib/auth-session.ts: Add createAuthContextByKaryawanId() resolving identity by tb_karyawan.id — returns same AuthContext shape as createAuthContextByNip - expect karyawan_id-keyed context

  **What to do**:
  - Add `createAuthContextByKaryawanId(karyawanId)` in lib/auth-session.ts mirroring createAuthContextByNip (~L487-568) but keyed on `tb_karyawan.id`.
  - Resolve identity via JOIN: `SELECT ... FROM tb_karyawan k JOIN tb_karyawan_auth a ON a.karyawan_id = k.id WHERE k.id = ? AND a.is_active = 1 AND k.isDeleted = 0` (H2 single-source via JOIN + H3 isDeleted guard).
  - Reuse the SAME per-group role resolution already shipped in B1/B2 (do NOT re-implement; call the shared role-mapping path).
  - Parameterized SQL only.

  **Must NOT do**:
  - Do NOT change createAuthContextByNip's external behavior yet (T9 rewires callers).
  - Do NOT drop tb_karyawan_auth.nip column here (that JOIN-resolve lands first; column drop is T10).
  - No `as any` / `@ts-ignore`.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: identity-resolution core; subtle JOIN + flag-derivation correctness, regression-critical.
  - **Skills**: [] — domain is bespoke repo auth, no skill overlaps.

  **Parallelization**:
  - **Can Run In Parallel**: NO (core resolver other Step-3 tasks build on)
  - **Parallel Group**: Wave 2
  - **Blocks**: T9, T10
  - **Blocked By**: T1 (PK/isDeleted/nip-unique confirmed), T2 (payload shape)

  **References**:
  - `lib/auth-session.ts:487-568` createAuthContextByNip — the template; copy structure, change WHERE key to k.id, add k.isDeleted=0.
  - `lib/auth-session.ts` B1/B2 per-group role map (shipped a4aa214) — reuse, do not duplicate.
  - Grill H1/H2/H3 (docs/agent-context/oracle-auth-redesign-grill-2026-06-11.md) — why karyawan_id subject + JOIN single-source + isDeleted guard.
  - T1 preflight output (.omo/evidence/auth-nip/preflight.txt) — confirms PK=id, isDeleted exists, nip UNIQUE.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` clean; `npm run build` succeeds.
  - [ ] `node --test tests/auth-session-compat.test.js` — add case: createAuthContextByKaryawanId(10007) returns is_leader=true groups=[{group_id:32}] only (parity with NIP lane for leader001).

  **QA Scenarios**:
  ```
  Scenario: karyawan_id resolver parity with NIP lane (happy path)
    Tool: Bash (node:test)
    Preconditions: dev DB seeded (kar10007 leader001 active, role group_leader/grp32)
    Steps:
      1. node --test tests/auth-session-compat.test.js
      2. Assert new test "createAuthContextByKaryawanId leader scope" passes
    Expected Result: context.is_leader=true, groups length 1, groups[0].group_id=32, is_admin=false
    Failure Indicators: groups empty, is_admin true, or leader broadcast to other groups
    Evidence: .omo/evidence/auth-nip/t8-resolver-parity.txt

  Scenario: soft-deleted employee cannot resolve (negative)
    Tool: Bash (node:test or curl after temp UPDATE)
    Preconditions: pick a test kar id, UPDATE tb_karyawan SET isDeleted=1 WHERE id=? (revert after)
    Steps:
      1. Call createAuthContextByKaryawanId(thatId)
      2. Assert null/throws (no context)
      3. Revert isDeleted=0
    Expected Result: deleted employee yields no auth context (H3)
    Evidence: .omo/evidence/auth-nip/t8-isdeleted-guard.txt
  ```

  **Commit**: NO (groups with T9/T10 as Step-3 unit, only if user asks)

- [~] 9. lib/auth-session.ts + login route: Switch session SUBJECT to karyawan_id; keep nip:/account: cookie DECODE for one 12h TTL (PAYLOAD_COMPAT) - expect new logins store numeric karyawan_id, old cookies still resolve (BLOCKED: cascade on T10 Oracle amendment A/B/C; subject shape and resolver decoupling can't be finalized until user picks)

  **What to do**:
  - On successful login (both lanes), set cookie subject to `karyawan_id` (numeric), NOT `nip:` string (H1 immutable PK).
  - In getAuthContextFromCookies (~L675), keep decoding THREE in-flight formats while PAYLOAD_COMPAT on: numeric karyawan_id → createAuthContextByKaryawanId; legacy `nip:X` → resolve to karyawan_id then same; legacy `account:X` → existing account path. (Metis: handle all THREE or account lane mass-logout.)
  - Gate legacy decode behind EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT (keep ON; flip OFF only after 12h soak in T13).

  **Must NOT do**:
  - Do NOT disable PAYLOAD_COMPAT here (12h soak is a separate later step T13).
  - Do NOT drop nip column here (T10).
  - Do NOT re-resolve `nip:OLD` cookies by mutable nip beyond the compat window.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: cookie-format tri-compat + logout-wave risk; highest-blast-radius change.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T12
  - **Blocked By**: T8

  **References**:
  - `lib/auth-session.ts:675` getAuthContextFromCookies — the 4-path waterfall to extend with karyawan_id-numeric decode.
  - `lib/auth-session.ts` setAuthCookie (maxAge 43200 = 12h) — subject is what changes.
  - `app/api/auth/login/route.js` — where subject is written on both lanes.
  - Grill H1 + Metis edge #3 (12h hard gate) — why compat stays on one full TTL.
  - T2 evidence (.omo/evidence/auth-nip/payload-shape.txt) — exact token JSON {sub,st,exp,v:2}.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` + `npm run build` clean.
  - [ ] New login → decode cookie → `sub` is numeric karyawan_id (not `nip:`).
  - [ ] Old `nip:` cookie still resolves correct user (compat ON).
  - [ ] Old `account:` cookie still 200 on /api/auth/me.

  **QA Scenarios**:
  ```
  Scenario: new login stores numeric karyawan_id subject (happy path)
    Tool: Bash (curl + jq on cookie) via .omo/evidence/auth-nip/qa-harness.sh
    Preconditions: dev server :3000 (tmux elworkspace)
    Steps:
      1. curl -s -c /tmp/c.txt -X POST :3000/api/auth/login -d login_id=leader001 -d password=password
      2. Decode easylink_session payload segment; assert sub is integer 10007, not "nip:leader001"
      3. curl -s -b /tmp/c.txt :3000/api/auth/me ; assert 200 + karyawan_id=10007
    Expected Result: numeric subject, /me 200
    Evidence: .omo/evidence/auth-nip/t9-numeric-subject.txt

  Scenario: in-flight legacy nip: cookie still resolves (compat, negative-to-regression)
    Tool: Bash (curl with hand-crafted nip: cookie from T2 format)
    Preconditions: PAYLOAD_COMPAT on
    Steps:
      1. Forge a valid-signed nip:leader001 cookie per T2 token recipe (HMAC AUTH_SECRET)
      2. curl -b that cookie :3000/api/auth/me
      3. Assert 200 + correct user
    Expected Result: legacy cookie resolves during window
    Evidence: .omo/evidence/auth-nip/t9-legacy-compat.txt
  ```

  **Commit**: NO (Step-3 unit, only if user asks)

- [~] 10. lib/auth-session.ts + migration: H2 — rewrite remaining `WHERE a.nip=?` reads to k.nip JOIN, then drop tb_karyawan_auth.nip column (AFTER grep proves zero a.nip reads) - expect single-source nip via tb_karyawan, login still 200
  > **BLOCKED — awaiting user approval of preflight amendment.** Preflight + Oracle: `tb_karyawan.nip` is TEXT/no-index/NOT-unique; `tb_karyawan_auth.nip` (varchar UNIQUE) is the ONLY unique credential handle and carries username semantics DIVERGENT from k.nip (kar9999 auth.nip=ADMIN01 vs k.nip=9990044). Dropping it + flipping login to `WHERE k.nip=?` = unsafe (ambiguous/full-scan/silent re-key). Oracle verdict: CANCEL column drop + JOIN-resolver flip; reduce H2 to "subject=karyawan_id only" (T8/T9), keep auth.nip as login key. Needs user decision (amendment A vs keep-original-B).

  **What to do**:
  - Grep repo for every `a.nip` / `tb_karyawan_auth.nip` read. Rewrite NIP-login lookup to `JOIN tb_karyawan k ON a.karyawan_id=k.id WHERE k.nip=?` (single source = tb_karyawan.nip).
  - ONLY after grep shows zero remaining reads of the denormalized column: add migration SQL `ALTER TABLE tb_karyawan_auth DROP COLUMN nip;` (+ rollback re-add + repopulate-from-JOIN snippet in same file).
  - Keep migration SQL in repo migration location aligned with schema.

  **Must NOT do**:
  - Do NOT drop the column before the resolver rewrite + grep gate (Metis edge #1: breaks login for everyone).
  - Do NOT touch tb_user_group_access.
  - No unparameterized SQL.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: destructive schema change gated on exhaustive read-elimination.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (tail)
  - **Blocks**: T12
  - **Blocked By**: T9

  **References**:
  - Grill H2 — drop denormalized nip, resolve via JOIN.
  - Metis edge #1 + §6 ordering — H2 strictly after resolver; grep gate mandatory.
  - `lib/auth-session.ts:500-501` current `WHERE a.nip=?` site.

  **Acceptance Criteria**:
  - [ ] `grep -rn "a\.nip" lib/ app/` returns zero login-read matches before DROP.
  - [ ] Migration applies clean; `SELECT nip FROM tb_karyawan_auth` errors after (column gone).
  - [ ] Login still 200 via JOIN (leader001 + admin01).
  - [ ] Rollback snippet present (re-add column + repopulate from tb_karyawan.nip JOIN).

  **QA Scenarios**:
  ```
  Scenario: login resolves via JOIN after column drop (happy path)
    Tool: Bash (apply migration on dev DB, curl)
    Preconditions: T9 merged, dev DB, backup taken
    Steps:
      1. Apply ALTER ... DROP COLUMN nip on dev DB
      2. curl POST /api/auth/login leader001/password ; assert 200
      3. mysql: SELECT nip FROM tb_karyawan_auth ; assert ERROR unknown column
    Expected Result: login works, column gone
    Evidence: .omo/evidence/auth-nip/t10-drop-join.txt

  Scenario: rollback re-adds + repopulates (negative/recovery)
    Tool: Bash (run rollback snippet)
    Steps:
      1. Run rollback: ADD COLUMN nip + UPDATE from JOIN tb_karyawan.nip
      2. Assert tb_karyawan_auth.nip repopulated matching tb_karyawan.nip
    Expected Result: reversible
    Evidence: .omo/evidence/auth-nip/t10-rollback.txt
  ```

  **Commit**: NO (Step-3 unit, only if user asks)

- [x] 11. app/api/groups/route.js: H4 — migrate leader READ + WRITE together from tb_user_group_access(pin) to tb_karyawan_roles(karyawan_id); machine keeps writing device col as dead data - expect groups leader source = tb_karyawan_roles

  **What to do**:
  - GET: source leader list + is_leader from tb_karyawan_roles (group_leader rows, karyawan_id), replacing reads at L88-104; leader-candidate join uses tb_karyawan not tb_user-by-PIN (L73-86).
  - WRITE: assign_leader/remove_leader INSERT/DELETE tb_karyawan_roles(karyawan_id, 'group_leader', group_id) instead of tb_user_group_access.is_leader. Wire T5 recordRoleChange audit on both.
  - Migrate READ and WRITE in the SAME change (Metis lock: together, nothing more).

  **Must NOT do**:
  - Do NOT clean up / stop tb_user_group_access writes elsewhere (machine keeps writing dead data — explicit).
  - Do NOT refactor adjacent group CRUD.
  - No multi-leader regression — multiple group_leader rows per group must work.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: split-brain read+write migration with audit wiring, autonomous trace needed.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on audit + resolver)
  - **Parallel Group**: Wave 3
  - **Blocks**: T12
  - **Blocked By**: T5 (audit writer), T8 (role-map path)

  **References**:
  - Grill H4 — read L88-104 + candidate L73-86; write assign/remove leader.
  - `app/api/groups/route.js` current leader read+write sites.
  - T5 lib/auth-audit.ts recordRoleChange.
  - Metis scope-creep lock #3 — read+write together only.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck`+`build` clean.
  - [ ] groups GET leader list sourced from tb_karyawan_roles (seed a group_leader role row → appears; delete a tb_user_group_access.is_leader row → GET output UNCHANGED).
  - [ ] assign_leader writes tb_karyawan_roles row + 1 audit row; remove_leader deletes + 1 audit row.
  - [ ] Multiple leaders per group render (group 9 / group 32 two-leader case).

  **QA Scenarios**:
  ```
  Scenario: leader list reads from tb_karyawan_roles, ignores device table (happy + proof)
    Tool: Bash (mysql + curl) / Playwright
    Preconditions: dev :3000, admin session
    Steps:
      1. INSERT tb_karyawan_roles (karyawan_id, 'group_leader', 32) for a test employee
      2. curl groups GET ; assert that employee shows as leader of 32
      3. DELETE a tb_user_group_access row WHERE is_leader=1 for same group
      4. curl groups GET again ; assert leader list UNCHANGED (device table not the source)
    Expected Result: tb_karyawan_roles is sole source
    Evidence: .omo/evidence/auth-nip/t11-read-source.txt

  Scenario: assign/remove leader writes roles + audit (happy + negative)
    Tool: Bash (curl admin POST + mysql)
    Steps:
      1. POST groups assign_leader for test emp/group ; assert tb_karyawan_roles row created + tb_role_change_audit +1 (actor,target,grant)
      2. POST remove_leader ; assert role row gone + audit +1 (revoke)
      3. Attempt assign as non-admin/non-leader ; assert 403, no row, no audit
    Expected Result: writes land in roles+audit; unauthorized blocked
    Evidence: .omo/evidence/auth-nip/t11-write-audit.txt
  ```

  **Commit**: NO (only if user asks)

- [~] 12. Dual-run verification: both NIP lane (employee001/leader001) AND account lane (admin01) return 200 in same window; confirm 0 NULL nips - expect both lanes live, backfill complete (BLOCKED: requires T9 subject switch to verify; cascade on T10 amendment)

  **What to do**:
  - With Step-3 + H2 + H4 merged and PAYLOAD_COMPAT on, verify BOTH lanes authenticate simultaneously (Metis: keep both lanes through Step 5).
  - Assert NIP backfill state: `SELECT COUNT(*) FROM tb_karyawan WHERE nip IS NULL` = 0 (already 0/138, re-confirm).
  - This is a verification/gate task — no production code change.

  **Must NOT do**:
  - Do NOT disable any lane here.
  - Do NOT flip PAYLOAD_COMPAT off (that is T13 after 12h).
  - Do NOT backfill placeholders to real NIPs (HR human task; and must not precede Step 3 anyway).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: pure curl/SQL verification gate.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate before soak)
  - **Parallel Group**: Wave 4
  - **Blocks**: T13
  - **Blocked By**: T9, T10, T11

  **References**:
  - Grill Step 5 dual-run; Metis acceptance Step 5.
  - .omo/evidence/auth-nip/qa-harness.sh.

  **Acceptance Criteria**:
  - [ ] curl login+/me 200 for employee001 (NIP), leader001 (NIP), admin01 (account) within same run.
  - [ ] `SELECT COUNT(*) FROM tb_karyawan WHERE nip IS NULL` = 0.

  **QA Scenarios**:
  ```
  Scenario: three-account dual-lane smoke (happy path)
    Tool: Bash (qa-harness.sh)
    Preconditions: dev :3000, all merges applied
    Steps:
      1. Loop login+me for employee001/password, leader001/password, admin01/Admin@123
      2. Assert all three 200 with correct role flags (employee: no leader; leader: grp32 only; admin: groups=[])
      3. mysql COUNT nip NULL = 0
    Expected Result: all lanes green, backfill complete
    Evidence: .omo/evidence/auth-nip/t12-dual-run.txt
  ```

  **Commit**: NO

- [~] 13. 12h soak gate then flip EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT=off — explicit wait-one-TTL step, do NOT collapse - expect no legacy nip:/account: cookies remain, then compat disabled (BLOCKED: 12h wall-clock park measured from T9 deploy; T9 itself is amendment-blocked)

  **What to do**:
  - HARD GATE: wait one full cookie TTL (12h, maxAge 43200) after T9 deploy so all in-flight `nip:`/`account:` cookies expire (Metis edge #3, off-hours).
  - After window: set EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT=off. Now only numeric karyawan_id subjects decode.
  - This is an ops/sequence step — keep as first-class plan step, not a footnote.

  **Must NOT do**:
  - Do NOT flip the flag before the full 12h elapses (premature = fleet re-login).
  - Do NOT delete the legacy decode CODE here (flag-off-soak first; code removal can follow later if desired, out of this plan's required scope).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: env flag flip + post-flip smoke; the wait is wall-clock.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (gated, time-delayed)
  - **Blocks**: T14
  - **Blocked By**: T12

  **References**:
  - Grill "watch out" 12h; Metis guardrail + edge #3.

  **Acceptance Criteria**:
  - [ ] ≥12h elapsed since T9 deploy (state deploy timestamp + flip timestamp).
  - [ ] After flip: new login still 200 (numeric subject path); a forged legacy `nip:` cookie now REJECTED (401).

  **QA Scenarios**:
  ```
  Scenario: post-soak legacy cookie rejected, fresh login works (happy + negative)
    Tool: Bash (curl)
    Preconditions: 12h passed, flag off
    Steps:
      1. curl login leader001/password ; assert 200 (numeric subject)
      2. Present forged legacy nip:leader001 cookie ; assert 401 (compat off)
    Expected Result: only numeric subjects valid
    Evidence: .omo/evidence/auth-nip/t13-postsoak.txt
  ```

  **Commit**: NO

- [~] 14. lib/auth-session.ts + env: Step 6a — set EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=off and SOAK (do not delete PIN code yet) - expect PIN login 401, NIP/account still 200, reversible by flag (BLOCKED: plan spec "Blocked By: T13"; T13 amendment-blocked)

  **What to do**:
  - Flip EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=off (Metis: flag-off-soak BEFORE deleting PIN code — reversible middle state).
  - Verify PIN-only logins now fail; NIP + account lanes unaffected.
  - Keep createAuthContextByPin code in place (deletion is T15).

  **Must NOT do**:
  - Do NOT delete PIN path code in this task (next task).
  - Do NOT remove tb_user_group_access auth READ yet (bundled with code delete in T15).

  **Recommended Agent Profile**:
  - **Category**: `implementation` — Reason: env flip + targeted regression checks.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: T15
  - **Blocked By**: T13

  **References**:
  - Grill Step 6 + Metis rollback §6 (Step 6 = flag-off-soak then delete, two sub-steps).
  - `lib/auth-session.ts:593` createAuthContextByPin (legacy PIN lane).

  **Acceptance Criteria**:
  - [ ] PIN-only login (a tb_user PIN with no NIP auth row) → 401.
  - [ ] NIP (leader001) + account (admin01) → 200.
  - [ ] Re-enabling flag restores PIN login (reversibility proven once).

  **QA Scenarios**:
  ```
  Scenario: PIN fallback disabled, canonical lanes intact (happy + negative)
    Tool: Bash (curl)
    Preconditions: flag off
    Steps:
      1. curl login with a known legacy PIN only ; assert 401
      2. curl login leader001/password ; assert 200
      3. (reversibility) set flag on, retry PIN ; assert 200 ; set flag off again
    Expected Result: PIN blocked, NIP works, reversible
    Evidence: .omo/evidence/auth-nip/t14-pin-soak.txt
  ```

  **Commit**: NO

- [~] 15. lib/auth-session.ts: Step 6b — delete createAuthContextByPin + tb_user_group_access auth READ + assert zero orphaned is_leader rows - expect PIN auth code gone, device writes untouched (BLOCKED: plan spec "Blocked By: T14"; T14 cascade-blocked)

  **What to do**:
  - Remove createAuthContextByPin and the NIP-lane tb_user_group_access fallback READ (the auth-privilege read path only).
  - Remove the getAuthContextFromCookies legacy_pin branch + normalizeSubjectType 'legacy_pin'.
  - Leave tb_user_group_access TABLE + machine WRITES intact (device dead data).
  - Assert no orphaned `is_leader=1` rows are consulted for auth anymore.

  **Must NOT do**:
  - Do NOT drop tb_user_group_access table or stop machine writes.
  - Do NOT remove account lane (that is T16, last).

  **Recommended Agent Profile**:
  - **Category**: `implementation` — Reason: dead-code removal with careful read-path scoping.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: T16
  - **Blocked By**: T14

  **References**:
  - Grill Step 6 + H4 (machine keeps writing dead data).
  - `lib/auth-session.ts:593-640` PIN path + tb_user_group_access read.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck`+`build` clean after removal.
  - [ ] `grep -rn "tb_user_group_access" lib/ app/api/auth` returns zero AUTH reads (device-sync usages elsewhere may remain).
  - [ ] NIP + account login still 200.
  - [ ] Auth unit tests pass (`node --test tests/auth-*.test.js`).

  **QA Scenarios**:
  ```
  Scenario: PIN code removed, canonical auth unaffected (happy path)
    Tool: Bash (grep + curl + node:test)
    Steps:
      1. grep tb_user_group_access in auth read path → 0 auth reads
      2. curl leader001/password + admin01/Admin@123 → 200
      3. node --test tests/auth-session-compat.test.js tests/auth-hardening.test.js → pass
    Expected Result: clean removal, no regression
    Evidence: .omo/evidence/auth-nip/t15-pin-removed.txt

  Scenario: device writes still work (negative-side proof)
    Tool: Bash (mysql)
    Steps:
      1. Confirm tb_user_group_access table still exists and is writable (machine path unaffected)
    Expected Result: device table intact
    Evidence: .omo/evidence/auth-nip/t15-device-intact.txt
  ```

  **Commit**: NO

- [~] 16. BLOCKING break-glass gate: verify a real NIP-admin logs in end-to-end (admin01 has tb_karyawan row + auth + admin/NULL role) BEFORE any account-lane removal - expect NIP-admin 200, break-glass script proven
  > **BLOCKED — awaiting user approval of preflight amendment.** Plan assumed admin01/kar9999 as break-glass, but T1 found kar9999 is_active=0 AND its k.nip=9990044 is INSIDE the placeholder BLOCK range (T7) → self-lockout. Real working global NIP-admin = kar10006 `admin001` (active, role admin/NULL, alpha-nip → unaffected by numeric block). Oracle-directed: reassign break-glass to admin001/kar10006, treat kar9999 as decommissioned (do NOT reactivate). Also: audit isDeleted values for the 6 auth rows before enforcing H3 (T17). Needs user OK.

  **What to do**:
  - BLOCKING GATE (Metis edge #4): confirm admin01 has a tb_karyawan row (from T1). If yes, ensure a NIP-admin login exists (admin01's karyawan_id has tb_karyawan_auth active + tb_karyawan_roles admin/group_id NULL).
  - Complete a real NIP-admin login end-to-end (200) while account lane STILL live.
  - Verify the documented DB seed/reset break-glass script produces a working admin on a fresh/scratch DB (run → admin login 200).

  **Must NOT do**:
  - Do NOT remove the account branch until this gate passes (a wrong backfill locks out all admins, no UI recovery).
  - Do NOT skip the scratch-DB break-glass run ("documented but untested = false safety").

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: gating verification spanning DB + script + e2e login.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (hard gate)
  - **Parallel Group**: Wave 6 (head)
  - **Blocks**: T17
  - **Blocked By**: T1 (admin01 tb_karyawan row), T15

  **References**:
  - Grill B3 + Metis edge #4 break-glass blocking gate.
  - T1 preflight (admin01 tb_karyawan row result).
  - scripts/seed-v3-role-fixtures.mjs (break-glass seed path) + DB reset script.

  **Acceptance Criteria**:
  - [ ] admin01 (or designated NIP-admin) logs in via NIP lane → 200, is_admin=true, groups=[].
  - [ ] Break-glass script on scratch DB → admin login 200.
  - [ ] Gate explicitly recorded PASS before T17 starts.

  **QA Scenarios**:
  ```
  Scenario: NIP-admin works before account removal (BLOCKING happy path)
    Tool: Bash (curl)
    Preconditions: account lane still live, admin01 NIP auth+role rows present
    Steps:
      1. curl login admin01 via NIP lane ; assert 200 is_admin=true groups=[]
    Expected Result: a canonical NIP admin exists independent of account_accounts
    Evidence: .omo/evidence/auth-nip/t16-nip-admin.txt

  Scenario: break-glass script recreates admin on fresh DB (recovery proof)
    Tool: Bash (scratch DB + script + curl)
    Steps:
      1. Provision scratch DB, run break-glass seed/reset script
      2. curl admin login ; assert 200
    Expected Result: total-lockout recovery proven
    Evidence: .omo/evidence/auth-nip/t16-breakglass.txt
  ```

  **Commit**: NO

- [~] 17. lib/auth-session.ts + login route: Step 7 — remove auth_accounts account lane LAST; add k.isDeleted=0 to all NIP resolves; rate-limit live - expect account login 401, NIP-only auth, soft-delete logs out in 1 req (BLOCKED: gated by T16 break-glass which is amendment-blocked)

  **What to do**:
  - Remove the account lane: findAuthAccountByLoginId path, ACCOUNT_ROLE_COMPAT, createAuthContextByLoginId, account branch in getAuthContextFromCookies, account: cookie decode (Step 7, LAST — Metis: hardest rollback, tag/branch before).
  - Ensure ALL NIP resolves include `AND k.isDeleted=0` (H3) — soft-deleted employee → /me 401 within 1 request.
  - Confirm T6 rate-limit active (11th rapid login → 429). CSRF remains OUT (LAN, documented).

  **Must NOT do**:
  - Do NOT remove account lane before T16 break-glass gate PASS.
  - Do NOT add full CSRF token flow (LAN-scoped per grill H5; document only).
  - No `as any`/`@ts-ignore`.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: last-lane removal, hardest rollback, security-finalizing.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6
  - **Blocks**: T18, T19
  - **Blocked By**: T16

  **References**:
  - Grill Step 7 + H3 + H5; Metis acceptance Step 7 + rollback (tag/branch before; break-glass IS rollback).
  - `lib/auth-session.ts` account-lane functions (findAuthAccountByLoginId:363, createAuthContextByLoginId:401, ACCOUNT_ROLE_COMPAT:130).

  **Acceptance Criteria**:
  - [ ] `npm run typecheck`+`build` clean.
  - [ ] account-lane login (admin01/Admin@123 via auth_accounts) → 401/removed.
  - [ ] NIP-admin login → 200 (verified BEFORE commit, from T16).
  - [ ] Soft-delete test: UPDATE isDeleted=1 → /api/auth/me 401 within 1 request (revert after).
  - [ ] 11th rapid login attempt → 429.
  - [ ] Git tag/branch created before this change (rollback anchor).

  **QA Scenarios**:
  ```
  Scenario: account lane gone, NIP-only auth (happy + negative)
    Tool: Bash (curl)
    Steps:
      1. curl account-lane login admin01 ; assert 401 (lane removed)
      2. curl NIP-admin login ; assert 200
    Expected Result: single NIP-anchored lane
    Evidence: .omo/evidence/auth-nip/t17-account-removed.txt

  Scenario: soft-delete + rate-limit enforcement (negative/security)
    Tool: Bash (curl + mysql)
    Steps:
      1. UPDATE tb_karyawan SET isDeleted=1 WHERE id=<test> ; curl /me with that session ; assert 401 in 1 req ; revert
      2. Fire 11 rapid logins same IP/nip ; assert 11th → 429
    Expected Result: H3 + rate-limit enforced
    Evidence: .omo/evidence/auth-nip/t17-softdelete-ratelimit.txt
  ```

  **Commit**: NO (tag/branch yes if user asks; this is the rollback anchor)

- [x] 18. M2: ensure all tb_karyawan_auth.password_hash are bcrypt; assert zero plaintext remain - expect COUNT(password_hash NOT LIKE '$2%')=0

  **What to do**:
  - Verify backfill/seed left bcrypt, not plaintext (verifyPassword rehashes on login but rows not-yet-logged-in may still be plaintext).
  - For any plaintext rows: trigger rehash (admin-driven password set) or document which accounts are pending first-login rehash.
  - Read-mostly + targeted fix; no schema change.

  **Must NOT do**:
  - Do NOT introduce self-service password reset (M4 is admin-driven only).
  - Do NOT weaken verifyPassword.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: SQL audit + small remediation.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (parallel with T19)
  - **Blocks**: —
  - **Blocked By**: T17

  **References**:
  - Grill M2; password.ts:34-36 (plaintext+rehash path).

  **Acceptance Criteria**:
  - [ ] `SELECT COUNT(*) FROM tb_karyawan_auth WHERE password_hash NOT LIKE '$2%'` = 0 (or documented pending-first-login list).

  **QA Scenarios**:
  ```
  Scenario: no plaintext password hashes (security audit)
    Tool: Bash (mysql)
    Steps:
      1. SELECT COUNT(*) WHERE password_hash NOT LIKE '$2%'
      2. Assert 0 (or list + documented remediation)
    Expected Result: all bcrypt
    Evidence: .omo/evidence/auth-nip/t18-bcrypt-audit.txt
  ```

  **Commit**: NO

- [x] 19. M4: admin-driven password reset path for NIP lane (no self-service) - expect admin can set an employee's password, employee logs in with new one

  **What to do**:
  - Provide an admin-only password reset (set tb_karyawan_auth.password_hash for a target karyawan_id, bcrypt). Reuse existing users/admin surface if present (per T2/users route findings); else minimal admin action.
  - Wire T5 audit (password reset event) if the audit action enum covers it; otherwise note out-of-scope.

  **Must NOT do**:
  - NO self-service / email reset flow (Metis lock M4).
  - No unparameterized SQL; store bcrypt only.

  **Recommended Agent Profile**:
  - **Category**: `implementation` — Reason: scoped admin action.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 6 (parallel with T18)
  - **Blocks**: —
  - **Blocked By**: T17

  **References**:
  - Grill M4 (admin-driven only); existing users/admin route (T2 notes).

  **Acceptance Criteria**:
  - [ ] Admin resets employee password → stored bcrypt → employee logs in with new password (200), old fails (401).
  - [ ] Non-admin cannot invoke reset (403).

  **QA Scenarios**:
  ```
  Scenario: admin resets password, employee uses new (happy + negative)
    Tool: Bash (curl admin action + login)
    Steps:
      1. As admin, reset employee001 password to "newpass123"
      2. curl login employee001/newpass123 ; assert 200
      3. curl login employee001/password (old) ; assert 401
      4. As non-admin, attempt reset ; assert 403
    Expected Result: admin-driven reset works, self-service blocked
    Evidence: .omo/evidence/auth-nip/t19-admin-reset.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Do NOT auto-proceed.

- [x] F1. **Plan Compliance Audit** — `oracle` — APPROVED-FOR-COMPLETED-SCOPE (user okay 2026-06-13; C1+C2 conditions cleared via shared row types + DB-backed parity test)
  Read this plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run SQL). For each "Must NOT Have": search codebase for forbidden patterns (hard-cut, cs_* migration, `as any`, self-service reset, placeholder backfill before step 3) — reject with file:line if found. Check evidence files exist in `.omo/evidence/auth-nip/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` — APPROVED (user okay 2026-06-13; C1 cleared: `as any` 5→1 in auth-session.ts, L809 PIN-fallback pre-existing remains out of scope)
  Run `npm run typecheck` + `npm run build` + all `node --test tests/*.test.js` auth suites. Review changed files for `as any`/`@ts-ignore`, unparameterized SQL, empty catches, leftover `a.nip` reads, console.log, dead imports.
  Output: `Typecheck [PASS/FAIL] | Build [PASS/FAIL] | Tests [N pass/N fail] | SQL params [clean/issues] | VERDICT`

- [x] F3. **Real Manual QA — all lanes/roles** — `unspecified-high` (+ `playwright` skill) — APPROVED-FOR-COMPLETED-SCOPE (user okay 2026-06-13; 14/14 testable PASS, 5 deferred remain behind Amendment A spine T9-T17)
  From clean cookies, execute EVERY task QA scenario: NIP login (admin001/leader001/employee001) role-gated nav via Playwright (`page.fill`+`requestSubmit`), account login admin01, PIN login 401, soft-delete 401, rate-limit 429, break-glass on fresh DB. Save evidence to `.omo/evidence/auth-nip/final-qa/`.
  Output: `NIP lanes [N/N] | Account [P/F] | PIN-blocked [P/F] | soft-delete [P/F] | rate-limit [P/F] | break-glass [P/F] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep` — APPROVED-FOR-COMPLETED-SCOPE (user okay 2026-06-13; 5/5 invariants PASS)
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond. Confirm B1/B2 NOT re-touched, `tb_user_group_access` writes NOT cleaned, no `cs_*` migration, ordering spine respected (H2 after step 3 resolver; account removed LAST).
  Output: `Tasks [N/N compliant] | Ordering [OK/violated] | Scope-creep [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

> NO commits unless the user explicitly asks (CONTEXT.md + user guardrail). When asked, group per wave:
- Wave 1: `feat(auth): role-change audit + login rate-limit + placeholder policy`
- Wave 2: `refactor(auth): karyawan_id session subject + NIP-JOIN resolver (H1/H2/H3)`
- Wave 3: `refactor(groups): leader read+write on tb_karyawan_roles (H4)`
- Wave 5: `chore(auth): remove legacy PIN lane`
- Wave 6: `refactor(auth): remove account lane + bcrypt-only + admin reset (M2/M4)`
- Pre-commit gate each: `npm run typecheck && npm run build`

## Success Criteria

### Verification Commands
```bash
# NIP lane login (numeric subject)
curl -s -c /tmp/c.txt -X POST localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"login_id":"employee001","password":"password"}' | jq '.subject_type, .karyawan_id'  # employee_nip, 10008
# soft-delete enforcement
# (set isDeleted=1) curl -s -b /tmp/c.txt localhost:3000/api/auth/me  # expect 401
# bcrypt-only
mysql --batch -e "SELECT COUNT(*) FROM tb_karyawan_auth WHERE password_hash NOT LIKE '\$2%'"  # expect 0
# gates
npm run typecheck && npm run build
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All auth `node --test` suites pass
- [ ] Break-glass verified before account-lane removal
