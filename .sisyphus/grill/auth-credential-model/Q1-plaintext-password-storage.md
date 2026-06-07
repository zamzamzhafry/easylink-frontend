# Q1 — Plaintext password storage on `/api/users`

**Severity**: 🔴 Security (credentials at rest)
**Status**: OPEN

---

## The finding

`hashPassword()` exists (`lib/password.ts:10`, bcrypt rounds 12) but **no credential-write path calls it**. The only place hashing ever happens is `/api/auth/login`, which lazily re-hashes a legacy plaintext value *after* a successful login (`verifyPassword` returns `needsRehash: true` on a plaintext match).

Every write surface stores the password **raw**:

- `app/api/users/route.js:238` — `upsertLegacyEmployeeAuth` does `setClauses.push('password_hash = ?'); params.push(String(password))` — raw string into `tb_karyawan_auth.password_hash`.
- `app/api/users/route.js:565` — same raw value written into `cs_employee_auth_identity.password_hash` (the canonical clean-slate table).
- `scripts/seed-v3-role-fixtures.mjs` — seeds the literal `password` as plaintext into both tables.

`verifyPassword` (`lib/password.ts:19-36`) accepts this by design: bcrypt branch for `$2a$/$2b$/$2y$` prefixes, **plaintext string-compare** otherwise.

## Observed live state

- `tb_karyawan_auth` active rows: bcrypt (`$2b$12$…`, length 60) — these got re-hashed on a prior login.
- `cs_employee_auth_identity`: **plaintext** `password` — never re-hashed because login only re-hashes the legacy table, not the canonical one.

So the canonical identity table is the *less* protected one.

## Challenge against docs

- `CONTEXT.md` declares EasyLink "private-network attendance" with auth anchored in `lib/auth-session.ts`, but says nothing about credential-at-rest policy. **Gap.**
- `ADR-0001` formalizes identity resolution and capability model but is silent on password storage. **No documented decision exists** — this is undocumented behavior, not a violated rule.

## My recommendation

**Hash on every write; keep plaintext-verify only as a read-time migration fallback.**

1. `upsertLegacyEmployeeAuth` and the `cs_employee_auth_identity` upsert call `await hashPassword(password)` before storing.
2. Keep `verifyPassword`'s plaintext branch so existing seeded/legacy rows still log in, then get re-hashed.
3. Add a one-time backfill (or rely on lazy re-hash) to migrate the plaintext `cs_employee_auth_identity` rows.
4. Record the decision as a new ADR ("Passwords hashed at rest with bcrypt; plaintext compare is migration-only") and add a `CONTEXT.md` line under Auth.

Reasoning: private-network scope lowers but does not remove risk (DB dumps, backups, insider read, the `users` page exposing `auth.password_hash` in a SELECT at line 212). Hashing on write is cheap and the verify path already tolerates mixed state, so rollout is non-breaking.

**Alternative if you reject**: explicitly document "plaintext at rest is accepted on private network" as an ADR so it's a *decision*, not an accident. I do not recommend this.

---

## Agent-Proposed Assessment (PROPOSED — pending human ratification)

**Status**: PROPOSED (engineering best-practice, high confidence).
**Source**: Oracle consult (`ses_15f4b3a55ffeFQOp7WCYQAiFmX`) + direct code re-verification (2026-06-07).

### ⚠️ Correction to the original finding
The original draft claimed the users-page SELECT at "line 212" exposes `password_hash` to the browser. **That is FALSE — retracted.** Direct read shows `app/api/users/route.js:212` is `auth.is_active`, and `resolveEmployeeAuthByLoginId` (lines 208-219) selects `employee_id, nip, is_active, karyawan_pin, nama` — **no `password_hash`**. A repo grep confirms `password_hash` appears in `app/api/users/route.js` only in **write** paths (lines 237, 251, 565, 729), never in a SELECT returned to a client. **No hash leaks to the browser.** The plaintext-at-rest risk below stands on its own (DB dumps, backups, insider read); the client-exposure angle does not.

### Confirmed evidence
- `hashPassword()` (`lib/password.ts:10`, bcrypt rounds 12) has exactly **two callers, both in `/api/auth/login`** (lines 69, 108) — lazy re-hash on successful login. **No write path and no backfill script calls it.** (grep: only `lib/password.ts` + `app/api/auth/login/route.js` reference `hashPassword`.)
- Login re-hashes `auth_accounts` (line 70) and `tb_karyawan_auth` (line 109) only — **never `cs_employee_auth_identity`**. The canonical table is never lazily upgraded, so it stays plaintext indefinitely.

**Proposed decision**: **Hash on every credential write; keep `verifyPassword`'s plaintext branch as a read-time migration fallback only; add an active backfill for the canonical table.**

**Reasoning (Oracle)**:
- Hash-on-write is non-negotiable best practice; private-network scope lowers but does not remove at-rest risk.
- `hashPassword` already exists (rounds 12) — no new dependency; just wire it into the two write paths (`upsertLegacyEmployeeAuth` + the `cs_employee_auth_identity` upsert).
- **Dual-table asymmetry is the trap**: login re-hashes legacy but not canonical, so the two tables can hold *different representations of the same secret* → violates ADR-0001 §4 ("must not silently disagree"). Lazy migration alone is insufficient for the canonical table; pair it with a one-time backfill.

**🟢 NOT business judgment — clear engineering call.** Safe to ratify as-is.

**Proposed doc action**: New ADR — "Passwords hashed at rest with bcrypt; plaintext-compare is migration-only; canonical table backfilled." Add a CONTEXT.md line under Auth. Not written yet.

---

## Human Final Verdict

> Decision:
>
> Reasoning:
>
> Doc action (ADR / CONTEXT entry / none):
