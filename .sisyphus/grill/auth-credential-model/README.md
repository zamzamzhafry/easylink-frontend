# Grill Session — Auth Credential Model

**Date**: 2026-06-07
**Scope**: How employee credentials are created, stored, and verified across the `employees` (NIP) and `users` (PIN/machine) surfaces.
**Grounding docs**: `docs/CONTEXT.md`, `docs/adr/0001-auth-identity-resolution-and-capability-model.md`

Each question below is a standalone file for separate assessment, ordered most-critical first.
Answer them in any order. Each file has a **Your Assessment** slot at the bottom.

When a question's decision crystallizes, it becomes either:
- a new CONTEXT.md glossary entry, or
- a new/amended ADR.

## Questions

| # | File | Severity | Topic | Agent status |
|---|------|----------|-------|--------------|
| 1 | `Q1-plaintext-password-storage.md` | 🔴 Security | `/api/users` writes raw plaintext passwords to DB | PROPOSED 🟢 clear engineering call |
| 2 | `Q2-credential-lifecycle-owner.md` | 🟠 Architecture | Which surface owns the credential lifecycle: employees (NIP) or users (PIN/machine)? | PROPOSED + 1 DEFERRED 🟠 business call |
| 3 | `Q3-employee-create-inactive-auth.md` | 🟡 Functional | Employee create leaves auth row empty + inactive | PROPOSED (depends on Q2) + 1 DEFERRED 🟡 |
| 4 | `Q4-hop-b-stage-b-unwired.md` | 🟡 Sync | HOP B canonical push (Stage B) is never triggered by the UI | PROPOSED + 1 DEFERRED 🟡 ops cadence |

## Agent pre-fill summary (2026-06-07)

Each question now has an **Agent-Proposed Assessment** (evidence-backed, via Oracle consult `ses_15f4b3a55ffeFQOp7WCYQAiFmX` + direct code verification) and a blank **Human Final Verdict** slot for ratification.

- **Q1** — Hash on every write; keep plaintext-verify as migration-only; backfill canonical table. 🟢 Clear engineering call, safe to ratify. *Note: original "hash leaks to browser" claim was FALSE and is retracted in-doc — no client exposure; at-rest risk stands.*
- **Q2** — NIP/employees surface owns credentials; `cs_employee_auth_identity` canonical, `tb_karyawan_auth` projection; device sync write-boundaried. 🟠 DEFERRED: couple vs decouple device-enrollment from login (business/process call).
- **Q3** — Set+hash+activate NIP password inline at create (Option A). Depends on Q2+Q1. 🟡 DEFERRED: is password mandatory at create?
- **Q4** — Scheduled Windows Task Scheduler worker runs `php hop-b-batch-selector.php --worker-run` (Option A). Independent of Q1-Q3. 🟡 DEFERRED: interval + box ownership. Confirmed: Stage B currently has NO automated trigger.

**Sequencing**: ratify Q1 + Q2 first → Q3 follows → Q4 anytime (independent).
**No code or ADR/CONTEXT files written yet** — all await human verdicts.

## Status legend (fill per question)
- `OPEN` — not yet assessed
- `DECIDED` — you've chosen a path
- `DEFERRED` — acknowledged, not now
