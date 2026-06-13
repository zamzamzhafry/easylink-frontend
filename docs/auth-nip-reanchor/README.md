# Auth NIP Re-Anchor Migration — Session Grill Docs

**Branch:** `sync/ai-knowledge-2026-06-07`
**Plan:** `.omo/plans/auth-nip-reanchor-migration.md`
**Status:** 10/19 implementation tasks shipped (uncommitted), 9 blocked on one user decision.
**Date:** 2026-06-13

---

## What this migration does

Collapse three parallel auth lanes (legacy PIN, standalone `auth_accounts`, employee NIP)
into **one NIP-anchored lane** where:

- Session subject becomes the numeric `karyawan_id` (immutable PK), not a string.
- Login + `/me` resolve the employee via `tb_karyawan JOIN tb_karyawan_auth`.
- Group-leader authority reads/writes from `tb_karyawan_roles` (not the device table).
- Login is rate-limited and returns a single unified invalid-credential error (no user enumeration).
- The 44 placeholder NIPs (`9990001`–`9990044`) are blocked from login.
- Role keys narrow to a 3-role enum; passwords are bcrypt-only; role changes are audited;
  password reset is admin-driven only.
- Legacy PIN lane is removed first, then the `auth_accounts` lane last — each
  flag-off → soak → delete, never a hard cut.

## The headline finding

Preflight (Task 1) **invalidated the plan's central assumption (H2)**. The plan wanted to
drop `tb_karyawan_auth.nip` and resolve logins on `tb_karyawan.nip` instead. But:

- `tb_karyawan_auth.nip` is `varchar(50) UNIQUE` — the **only** unique credential handle.
- `tb_karyawan.nip` is `TEXT`, nullable, **no index, not unique**.
- The two diverge: user `kar9999` has `auth.nip = 'ADMIN01'` but `k.nip = '9990044'`.

Dropping the unique handle to resolve on non-unique TEXT would cause ambiguous lookups,
full table scans, and silent re-keying of divergent rows. **Oracle's verdict: do not
proceed with the column drop.** Four amendments follow (see `02-oracle-amendments.md`).

This is the single decision blocking the remaining 9 tasks. **Awaiting user choice A / B / C.**

---

## Doc index

| File | Contents |
|---|---|
| `README.md` | This overview |
| `01-completed-work.md` | The 10 shipped tasks: files, behavior, evidence |
| `02-oracle-amendments.md` | The H2 contradiction + 4 Oracle amendments + A/B/C decision |
| `03-final-wave-verdicts.md` | F1–F4 reviewer verdicts + 2 pre-commit conditions |
| `04-db-ground-truth.md` | Live DB schema, the 6 auth rows, placeholders, roles |

## Quick status

**Shipped (uncommitted, verified):** T1, T2, T3, T5, T6, T7, T8, T11, T18, T19
**Blocked on user A/B/C:** T4, T9, T10, T12, T13, T14, T15, T16, T17
**Final reviewers:** F1–F4 all APPROVE-for-completed-scope (await explicit user okay)

No code has been committed this session. No DB destructive changes. Dev DB has additive
audit tables + leader-role backfill applied.
