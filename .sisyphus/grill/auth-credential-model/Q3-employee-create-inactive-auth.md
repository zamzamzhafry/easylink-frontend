# Q3 — Employee create leaves auth row empty + inactive

**Severity**: 🟡 Functional (new employees cannot log in)
**Status**: OPEN

---

## The finding

`app/api/employees/route.js` POST creates the employee in one transaction:

1. `INSERT INTO tb_karyawan (...)` → real employee identity (line 138).
2. `INSERT INTO tb_karyawan_auth (karyawan_id, nip, password_hash, is_active) VALUES (?, ?, '', 0)` (lines 144-156).

The auth row is created with **empty `password_hash`** and **`is_active = 0`**. There is no password field on the create path. Result: a freshly created employee **cannot authenticate** until someone goes to the users page and runs `upsertLegacyEmployeeAuth` (which sets `is_active = 1` + a password).

The `ON DUPLICATE KEY UPDATE` even guards the empty case — `password_hash = CASE WHEN VALUES(password_hash) = '' THEN password_hash ELSE ... END` — confirming "empty hash on create" is intentional current behavior, not a bug slip.

## Challenge against docs

- `CONTEXT.md` Auth section: no statement about employee provisioning state. **Gap.**
- `ADR-0001`: covers resolution/capabilities, not provisioning defaults. **Not covered.**

## My recommendation

**Add an explicit credential step to employee create/edit and activate on set.** (This is the concrete mechanics of Q2.)

Option A (recommended) — *set password at create*:
- Add optional `password` to the employees create payload.
- If provided: `password_hash = await hashPassword(password)`, `is_active = 1`.
- If omitted: keep current dormant row, but return a clear `requiresCredential: true` flag so the UI prompts to set one.

Option B — *invite/activation flow*:
- Create dormant, then a dedicated "activate credential" action sets+hashes+activates. More moving parts; only worth it if you want an explicit onboarding step.

Either way: hashing comes from Q1, ownership from Q2. Record as part of the Q2 ADR's consequences.

Reasoning: Option A is the smallest change that makes the NIP surface a complete credential owner and removes the "create an employee who silently can't log in" trap. Option B is better only if HR onboarding wants a separate activation gate.

**Dependency**: blocked by Q2 (ownership) and Q1 (hashing). Decide those first.

---

## Agent-Proposed Assessment (PROPOSED — pending human ratification)

**Status**: PROPOSED, **dependent on Q2** being ratified first.
**Source**: Oracle consult (`ses_15f4b3a55ffeFQOp7WCYQAiFmX`, 2026-06-07).

**Proposed decision**: **Option A — set + hash + activate the NIP password inline at employee create/edit.**

**Reasoning**:
- For a small HR-operated, private-network app, an invite/activation flow (Option B) adds onboarding machinery with little payoff. Inline set is the smallest change that makes the NIP surface a complete credential owner (the mechanics of Q2).
- Hashing comes from Q1 (`await hashPassword(password)` before store); activation = `is_active = 1` when a password is provided.
- If password omitted at create: keep the dormant row but return `requiresCredential: true` so the UI prompts — avoids the current silent "employee who can't log in" trap.

**🟡 DEFERRED — light business judgment**:
> Does HR want a password mandatory at create, or is "create now, set credential later" an acceptable workflow? PROPOSED assumes optional-at-create with an explicit `requiresCredential` flag. Confirm.

**Dependency**: Do NOT action until Q2 ownership is ratified and Q1 hashing is decided. This question is the concrete implementation of both.

**Proposed doc action**: Record as a consequence in the Q2 ADR (no separate ADR needed). Not written yet.

---

## Human Final Verdict

> Decision (A / B / keep current):
>
> Reasoning:
>
> Doc action (ADR consequence / CONTEXT entry / none):
