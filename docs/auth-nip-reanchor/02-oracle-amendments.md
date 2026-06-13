# Oracle Amendments — The Blocker & The Decision

This is the single decision gating the remaining 9 tasks (T4, T9, T10, T12–T17).

---

## The contradiction (H2)

The plan's hypothesis **H2** assumed `tb_karyawan.nip` was a UNIQUE column it could
re-anchor logins onto, then **drop** `tb_karyawan_auth.nip`. Preflight proved otherwise:

| Column | Type | Unique? | Role |
|---|---|---|---|
| `tb_karyawan_auth.nip` | varchar(50) | **UNIQUE** | The only unique credential handle (login key) |
| `tb_karyawan.nip` | TEXT | no index, not unique | Display/HR field, can diverge |

**Divergence proof:** `kar9999` has `auth.nip = 'ADMIN01'` (alpha username) but
`k.nip = '9990044'` (a numeric placeholder). The two are not the same string.

Flipping the resolver to `WHERE k.nip = ?` and dropping `auth.nip` would:

1. Remove the only unique credential handle.
2. Force login resolution onto non-unique TEXT → ambiguous lookups (>1 row possible), full scans.
3. Silently re-key divergent rows like `kar9999` to a different login string.

## Oracle verdict

> Decouple **subject identity** (`karyawan_id`, the immutable int PK — already unique) from
> the **credential lookup key** (`auth.nip`, the unique handle). They need not be the same column.
> Reduce H2 to "session subject becomes `karyawan_id`"; keep `auth.nip` as the login key.
> **Cancel the column drop.**

---

## The 4 amendments

| # | Task | Original plan | Amendment |
|---|---|---|---|
| 1 | **T10 / H2** | Drop `auth.nip`, resolve on `k.nip` | **CANCEL the column drop.** Subject becomes `karyawan_id` (T8/T9 still do this); login keeps resolving via UNIQUE `auth.nip`. |
| 2 | **T4 / M1** | Migrate scheduler→group_leader, hr→admin, viewer→employee | **Shrink to `viewer→employee` only.** No scheduler/hr rows exist in the DB. Keep the BAN guard for future surprise rows. |
| 3 | **T16** | Break-glass = `admin01`/`kar9999` | **Reassign to `admin001`/`kar10006`** (active, alpha-nip → unaffected by the numeric placeholder block). `kar9999` is inactive AND its `k.nip=9990044` sits inside the placeholder block range (self-lockout if reactivated) → treat as decommissioned. |
| 4 | **H3** | Add `k.isDeleted=0` to NIP resolvers | **Audit the `isDeleted` values of the 6 auth rows first** (before enforcing), to avoid accidentally locking out an admin whose row was soft-deleted. Slot into T17. |

### Latent traps Oracle flagged

- `kar10004` empty-hash row (`is_active=0`): keep the `is_active=1` filter mandatory; no
  migration step should ever flip `is_active`.
- Future numeric-NIP admin inside `9990001–9990044` would be silently blocked → self-inflicted
  lockout that looks like a credential bug. Add a CI/seed assertion: no `role_key='admin'` row
  may map to a karyawan whose `k.nip` parses into the placeholder range.
- The placeholder matcher must guard against `parseInt('admin001') → NaN` coercion (alpha NIPs must pass). **Already done in T7.**

---

## The decision — A / B / C

**A — Accept all 4 Oracle amendments** *(recommended; safer, smaller diff, same end goal)*
Keep `auth.nip` as the unique login key, cancel the T10 column drop, reassign break-glass to
`admin001`, shrink T4 to `viewer→employee`, audit `isDeleted` before H3. Unblocks the full
spine T9 → T12 → T13 → T14 → T15 → T16 → T17.

**B — Override Oracle, keep the original H2 column drop**
Requires a separate prerequisite migration: `ALTER tb_karyawan.nip TEXT→VARCHAR`, backfill +
reconcile the divergent `kar9999` row, dedupe, add a UNIQUE index, *then* flip the resolver and
drop `auth.nip`. Larger blast radius; Oracle advises against.

**C — Ship the 10 completed as a partial milestone, defer the 9**
Commit/merge what is verified now; revisit the re-anchor spine in a later session.

> **No DB-destructive or auth-lockout-bearing change will be made until the user picks A, B, or C.**
> The amendment touches account-lane removal, break-glass identity, and the placeholder-block
> interaction — i.e. admin-lockout blast radius — so it is a user-only call.
