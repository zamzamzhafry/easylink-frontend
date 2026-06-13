# F1 — Plan Compliance Audit (auth-nip-reanchor-migration)

**Scope**: COMPLETED PORTION ONLY. DONE [x]: T1,T2,T3,T5,T6,T7,T8,T11,T18,T19 (10/19).
DEFERRED [~] pending user A/B/C on Oracle amendment: T4,T9,T10,T12,T13,T14,T15,T16,T17 (9/19).
Reviewer: F1 (oracle). Date: 2026-06-13. No code modified.

---

## MUST HAVE (plan §73-78)

| # | Must Have | Status | Evidence |
|---|-----------|--------|----------|
| MH1 | Backward-compatible session decode across full 12h TTL after Step 3 | **DEFERRED-BLOCKED** | Tri-format decode is T9 deliverable (`getAuthContextFromCookies` rewire). T9 is [~] gated on amendment A/B/C (plan §575). Current decode waterfall lib/auth-session.ts L51/L55 flags present (PIN_FALLBACK + PAYLOAD_COMPAT default true); subject-switch not yet landed. Gate: **T9**. |
| MH2 | Both account + PIN lanes alive through Step 5 (dual-run) | **SATISFIED (partial-by-design)** | Account lane intact: app/api/auth/login/route.js L93-119 `findAuthAccountByLoginId`+`createAuthContextByLoginId`. NIP lane L120-154. PIN lane untouched (createAuthContextByPin still present, T15 not run). Dual-run *verification* (T12) is [~] deferred, but the *requirement* (lanes alive) holds: no lane removed. |
| MH3 | Break-glass verified end-to-end BEFORE removing account branch | **DEFERRED-BLOCKED** | T16 break-glass gate is [~] (plan §936); reassigned admin001/kar10006 per Oracle. Account branch NOT removed (T17 [~]) so the "before" ordering constraint is not yet violable. Gate: **T16**. |
| MH4 | Parameterized SQL only | **SATISFIED** | All new SQL parameterized: auth-audit.ts L54-59 & L96-101 (`?` placeholders); admin-password-reset.js L33-36 (`UPDATE ... WHERE karyawan_id = ?`); login route.js L106/L121-129/L147/L150 all `?`; groups route INSERT/DELETE param (git diff L106/L175). createAuthContextByKaryawanId L652-655 single `?`. Zero string-concatenated user input found. |

**Must Have tally: 2 SATISFIED + 2 DEFERRED-BLOCKED / 4** (0 MISSING for completed scope).

---

## MUST NOT HAVE (plan §79-89) — full grep audit regardless of task status

| # | Guardrail | Status | Evidence |
|---|-----------|--------|----------|
| MN1 | NO hard cut of any lane (flag-off-soak-then-delete) | **ABSENT** | `grep -rniE "DROP COLUMN\|DROP TABLE auth_accounts\|DROP TABLE tb_user_group_access" scripts/ lib/ app/` → 0 hits. No lane removed. Flags EASYLINK_ENABLE_LEGACY_PIN_FALLBACK / PAYLOAD_COMPAT present (auth-session.ts L51/L55). |
| MN2 | NO disabling PAYLOAD_COMPAT before 12h window | **ABSENT** | T13 not run; flag default true (auth-session.ts L55). No flip code in changed files. |
| MN3 | NO `cs_*` table MIGRATION (roles stay on tb_karyawan_roles) | **ABSENT** | `cs_*` matches exist ONLY in app/api/users/route.js (21 reads) — TRACKED-AT-HEAD, `git status` clean, NOT modified by this work and they are READS not a migration. No new `cs_*` write/migration in scripts/ or changed files. Roles stay on tb_karyawan_roles (groups route diff L64/L106/L175). |
| MN4 | NO full CSRF build (rate-limit IN, CSRF OUT) | **ABSENT** | No CSRF token machinery added. Rate-limit IN: lib/auth-login-rate-limit.js. CSRF-OUT rationale documented login route.js L21 + admin route L10-15. |
| MN5 | NO cleanup of tb_user_group_access WRITES (device dead data kept) | **ABSENT (correctly preserved)** | groups route diff L125-133/L181-187: device writes RETAINED, column-gated `if (await hasGroupAccessColumn('is_leader'))`, still fire as dead data, never READ by GET. Per plan §84. |
| MN6 | NO self-service / email password reset (admin-driven only) | **ABSENT** | `grep -rni "forgot.?password\|reset.?token\|self.?service\|email.*reset"` app/ lib/ → 0 hits. Only reset path = app/api/admin/password-reset/route.js, admin-gated (admin-password-reset.js L21 `auth.is_admin !== true → 403`). |
| MN7 | NO `as any` / `@ts-ignore` / `@ts-expect-error` | **PRESENT — FAILURE (scoped, low-sev)** | 2 NEW `as any` introduced by T8 in lib/auth-session.ts **L658** (`const user = users[0] as any;`) and **L666** (`(roles as any[])`). Confirmed NEW via `git diff HEAD` (both on `+` lines). NOTE: they verbatim-copy the pre-existing pattern in createAuthContextByNip (HEAD L522/L530), but the guardrail is absolute. `@ts-ignore`/`@ts-expect-error`: 0 hits. |
| MN8 | NO removing/skipping failing tests | **ABSENT** | No test files deleted (git status). New tests added (rate-limit 5/5, admin-reset 5/5 PASS). No `.skip`/`.only` in new tests. |
| MN9 | NO placeholder→real NIP backfill before Step 3 | **ABSENT** | `grep -rni "UPDATE tb_karyawan SET nip"` lib/ app/ scripts/ → 0 hits. T7 enforces BLOCK (not backfill): isPlaceholderEmployeeNip guard, not a NIP mutation. |
| MN10 | NO commit/push unless user asks | **ABSENT** | All work uncommitted (`git status`: 3 modified + untracked, no new commits). |

**Must NOT Have tally: 9 ABSENT / 10. ONE PRESENT (MN7, `as any` ×2 at L658/L666).**

---

## PER-TASK ACCEPTANCE (implemented T1-T19)

### DONE [x]
- **T1 preflight** — SATISFIED. task-1-preflight.txt (9.6K) present; (a)-(e) answered; admin01/kar9999 break-glass blocker flagged (drove Oracle amendment). notepad L5-32.
- **T2 payload shape** — SATISFIED. task-2-payload-shape.md (8.1K); subject fmt, TTL=43200, resolve SQL L500-503, decode waterfall L701-742 line-referenced. notepad L24-28.
- **T3 harness+decisions** — SATISFIED. qa-harness.sh (1.7K), qa-playwright-recipe.md, decisions.md present; task-3-harness-run.txt employee001→200/employee_nip/10008.
- **T5 M3 audit** — SATISFIED. tb_role_change_audit EXISTS (mysql verified, 6 rows). scripts/migration-task-5-*.sql additive. lib/auth-audit.ts recordRoleChange param INSERT. Wired groups route (diff L141/L195). task-5-audit.txt. AC: ✓table ✓1-row-per-change.
- **T6 H5 rate-limit** — SATISFIED. lib/auth-login-rate-limit.js 10/60s per (ip+login_id). Unified `INVALID_CREDENTIALS_MESSAGE` route.js L24 across all 4 401 lanes (L102/L132/L138/L143). 429 w/ Retry-After L82-85. **tests 5/5 PASS**. task-6-ratelimit.txt.
- **T7 placeholder block** — SATISFIED. isPlaceholderEmployeeNip guard route.js L137 + auth-session.ts L524. Range 9990001-9990044 const. Byte-identical 401. Boundary evidence task-7-placeholder-boundary.txt (alpha/short-seed/suffix cases). notepad L41-52.
- **T8 ByKaryawanId resolver** — **SATISFIED w/ 1 AC MISS**. createAuthContextByKaryawanId present auth-session.ts L639; JOIN + `a.is_active=1 AND k.isDeleted=0` L653; mirrors ByNip role/group derivation; placeholder guard reused. typecheck clean (notepad L141). **AC-MISS**: required unit test in tests/auth-session-compat.test.js (`ByKaryawanId(10007)` parity) was NOT added — `grep ByKaryawanId tests/` = 0 hits; verified only via ad-hoc tsx snippet (notepad L142). **Also: 2 `as any` introduced here (MN7).**
- **T11 H4 groups leader** — SATISFIED. GET reads tb_karyawan_roles (diff L64); assign/remove WRITE tb_karyawan_roles (L106/L175) + recordRoleChange (L141/L195); device writes column-gated dead data (L125/L181). Multi-leader-safe INSERT...NOT EXISTS. task-11-groups-leader.txt (5.4K). notepad L147-154.
- **T18 M2 bcrypt** — SATISFIED. `COUNT(password_hash NOT LIKE '$2%' AND is_active=1) = 0` (mysql verified). kar10004 empty-hash documented inactive exception. task-18-bcrypt-audit.txt. notepad L127-134.
- **T19 M4 admin reset** — SATISFIED. tb_password_reset_audit EXISTS (cols verified). app/api/admin/password-reset/route.js admin-gated; lib/admin-password-reset.js 401/403/400/200; bcrypt UPDATE param; recordPasswordReset no plaintext. **tests 5/5 PASS**. task-19-password-reset.txt. notepad L156-177.

### DEFERRED [~] — gated on user decision A/B/C (Oracle amendment)
- **T4** (M1 enum viewer→employee) — DEFERRED. DB still shows `viewer` role_key (mysql DISTINCT: admin/group_leader/viewer). Gate: amendment (rescope to viewer→employee only). plan §323-324.
- **T9** (subject=karyawan_id + tri-compat) — DEFERRED. Gate: A/B/C cascade. plan §575.
- **T10** (H2 drop auth.nip) — DEFERRED. Oracle verdict: **CANCEL** drop. No DROP COLUMN present (✓ absent). Gate: amendment. plan §636.
- **T12** dual-run verify — DEFERRED (needs T9). plan §751.
- **T13** 12h soak flip — DEFERRED (needs T9 deploy clock). plan §796.
- **T14** PIN flag-off soak — DEFERRED (needs T13). plan §838.
- **T15** delete PIN code — DEFERRED (needs T14). plan §883.
- **T16** break-glass gate — DEFERRED (reassign admin001/kar10006). plan §936.
- **T17** remove account lane + H3 enforce — DEFERRED (needs T16). plan §989.

---

## EVIDENCE INVENTORY (.omo/evidence/auth-nip/) — 15 files

decisions.md, qa-harness.sh, qa-playwright-recipe.md, task-1-preflight.txt, task-2-payload-shape.md,
task-3-harness-run.txt, task-5-audit.txt, task-6-ratelimit.txt(+runner.sh), task-7-placeholder.txt(+boundary.txt),
task-8-resolver-by-id.txt, task-11-groups-leader.txt, task-18-bcrypt-audit.txt, task-19-password-reset.txt.

Coverage: every DONE task (T1,2,3,5,6,7,8,11,18,19) has ≥1 evidence file. ✓ Complete for completed scope.
GAP: no evidence files for deferred T4/T9/T10/T12-T17 (expected — not yet executed).

---

## DB VERIFICATION (mysql demo_easylinksdk, user easylink)
- tb_role_change_audit → EXISTS (6 rows)
- tb_password_reset_audit → EXISTS (cols: id,actor_karyawan_id NULL,target_karyawan_id NOT NULL,created_at)
- COUNT bcrypt-violations (active) = 0
- DISTINCT role_key = {admin, group_leader, viewer}  ← viewer present (T4 deferred, expected)
- COUNT tb_karyawan WHERE nip IS NULL = 0

## NEW-FILE TEST RUNS
- tests/auth-login-rate-limit.test.js → 5 pass / 0 fail
- tests/admin-password-reset.test.js → 5 pass / 0 fail

---

## FINDINGS REQUIRING DISPOSITION
1. **MN7 FAILURE (low-sev, scoped)**: 2 `as any` at lib/auth-session.ts L658 & L666, introduced by T8. Guardrail is absolute ("NO `as any`"). They copy the pre-existing ByNip pattern (HEAD L522/L530), so consistency-justified but still a literal breach. **Recommend**: type the row shape (e.g. a `KaryawanAuthRow` interface or `RowDataPacket[]` cast) in BOTH ByNip and ByKaryawanId before commit. Quick(<1h).
2. **T8 AC partial miss**: required parity unit test absent from tests/auth-session-compat.test.js (only ad-hoc tsx). **Recommend**: add the `ByKaryawanId(10007)` leader-parity + isDeleted-guard cases the AC named. Quick(<1h).

Neither blocks the deferred-spine work; both are within the COMPLETED scope and should land before a Wave-2 commit.

---

## VERDICT
Must Have [2 satisfied + 2 deferred / 4] | Must NOT Have [9/10 ABSENT, MN7 PRESENT] | Tasks [10 done + 9 deferred / 19] | VERDICT: APPROVE-FOR-COMPLETED-SCOPE (conditional)

Conditions before any commit of completed scope:
- (C1) Remove/replace the 2 `as any` at auth-session.ts L658/L666 (MN7).
- (C2) Add the T8 parity unit test the acceptance criteria mandated.

Deferred spine (T4,T9,T10,T12-T17) remains correctly BLOCKED on user A/B/C — NOT a failure. No hard-cut, no cs_* migration, no self-service reset, no placeholder backfill, no premature flag flips, no lane removed. Core guardrails intact.
