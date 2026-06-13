# Final Verification Wave — F1–F4 Verdicts

Four reviewers ran in parallel against the completed 10-task scope, each told the 9 remaining
tasks are amendment-deferred (not failures). **All four APPROVE for the completed scope.**

---

## F1 — Plan Compliance (oracle)

`Must Have [2 satisfied + 2 deferred / 4] | Must NOT Have [9/10 ABSENT] | Tasks [10 done + 9 deferred / 19] | VERDICT: APPROVE-FOR-COMPLETED-SCOPE (conditional)`

- Clean: no hard-cut / DROP COLUMN, no `cs_*` migration, no self-service reset, no NIP backfill,
  no flag flips, no commits.
- DB live: `tb_role_change_audit` 6 rows, `tb_password_reset_audit` 2 rows, bcrypt-violations
  (active) = 0, NIP NULL = 0.
- **Two advisory pre-commit conditions** (not approval blockers) — see below.
- Evidence: `.omo/evidence/auth-nip/F1-plan-compliance.md`

## F2 — Code Quality (unspecified-high)

`Typecheck [PASS] | Build [env-baseline fail: Google-Fonts ETIMEDOUT offline] | Tests [37 pass / 1 pre-existing env fail] | SQL params [clean] | VERDICT: APPROVE`

- 12 changed files: `@ts-ignore` 0, `console.log` 0, TODO/FIXME 0, empty catch 0, SQL string-interpolation 0.
- `as any`: 5 total in `lib/auth-session.ts` (L522/530/658/666/794); L658/666 are new (condition C1).
- The 1 test failure is the pre-existing `.env ALLOW_INSECURE_COOKIES=true` dev knob, not a regression.
- Evidence: `.omo/evidence/auth-nip/F2-code-quality.md`

## F3 — Manual QA (unspecified-high + playwright)

`NIP lanes 3/3 | placeholder-block P | rate-limit P | admin-reset P | groups-API P | UI role-nav 3/3 | VERDICT: APPROVE-FOR-COMPLETED-SCOPE`

- 14/14 testable scenarios pass. 5 scenarios correctly deferred behind amendment-blocked tasks.
- DB cleanup verified, `employee001` pw restored to `password`, hashes `$2b$` preserved.
- Evidence: `.omo/evidence/auth-nip/F3-manual-qa.md` + raw curl/UI traces in `.omo/evidence/auth-nip/final-qa/`

## F4 — Scope Fidelity (deep)

`Tasks [10 COMPLIANT + 9 CORRECTLY-DEFERRED / 19] | Ordering [OK] | Scope-creep [CLEAN] | Invariants [5/5 PASS] | VERDICT: APPROVE-FOR-COMPLETED-SCOPE`

- Deferred-untouched proven via DB+code: `auth.nip` column still EXISTS; `auth_accounts` lane
  intact; T4 enum still 5-value; legacy PIN resolver still live; subject still string loginId.
- Invariants: B1/B2 unchanged, device-table writes retained, no `cs_*`, ordering spine intact, no commits.
- Evidence: `.omo/evidence/auth-nip/F4-scope-fidelity.md`

---

## Two pre-commit conditions (from F1, advisory)

| # | Issue | Fix | Effort |
|---|---|---|---|
| **C1** | 2 new `as any` at `lib/auth-session.ts:658` (`users[0] as any`) and `:666` (`roles as any[]`), introduced by T8. They mirror pre-existing slop in `createAuthContextByNip` (HEAD L522/L530). | Introduce a shared `KaryawanAuthRow` interface and type both `ByNip` and `ByKaryawanId`. | < 1h |
| **C2** | T8 parity unit test (`ByKaryawanId(10007)`) missing from `tests/auth-session-compat.test.js` — only ad-hoc `tsx` verification was done. | Add the parity unit test. | < 1h |

Neither blocks approval. Recommended to fold into whichever wave the user chooses (A/B/C),
or knock out before the first commit.

---

## Approval status

All reviewers approve. **F1–F4 checked off 2026-06-13** after explicit user okay.
C1 cleared (shared `KaryawanAuthRow`/`KaryawanRoleRow` types; `as any` 5→1 in `auth-session.ts`).
C2 cleared (`tests/auth-session-by-karyawan-id.test.js`: 4 subtests, DB-skip-guarded, all pass against live `demo_easylinksdk`).
