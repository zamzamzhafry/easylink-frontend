# Oracle Grill — NIP-Anchored Auth Redesign (2026-06-11)

Adversarial review of the proposed single-lane NIP login redesign for EasyLink (Next.js + MySQL). Source: Oracle consultation, verified against live code + DB.

## Bottom line

The single-lane NIP redesign correctly kills the 409 collision **by construction**, but as specified it ships three real defects:

1. Login keyed on a **mutable NIP string** with a stateless session subject → silent logouts and mis-binds when HR edits a NIP.
2. The existing per-group `is_leader` derivation in `createAuthContextByNip` is **already a privilege-escalation bug** that the redesign carries forward unchanged.
3. **No admin break-glass** — one bad backfill row locks every admin out permanently.

Fix login key → `karyawan_id`, fix per-group leader scoping, keep a bootstrap escape hatch before removing any lane.

---

## BLOCKERS

### B1 — Per-group `is_leader` broadcast across all of a user's groups (escalation, exists today)
`createAuthContextByNip` (auth-session.ts:530-545) computes a single **global** `is_leader` (line 514), then calls `buildScopedGroupAccess(..., roleKey)` where `roleKey` is `'scheduler'` if the user has *any* leader/scheduler role (line 541-543). `ACCOUNT_ROLE_COMPAT.scheduler.is_leader = true`, so **every** group in `scopedGroupIds` — including `viewer` groups — gets `is_leader: true`.

A leader of group A who is also a viewer of group B becomes leader of B. `isAllowedGroup(auth, B, 'leader')` (line 791) then returns true, and `bulk_group` in schedule/route.js:226 lets them rewrite B's schedule. Redesign keeps this function "as-is" (§5) → ships the bug.

**Fix:** build each `GroupAccess.is_leader` from that group's own role row (`role_key='group_leader' && group_id===X`), never a blanket roleKey.

### B2 — Admin can be group-scoped → global admin (escalation)
`is_admin = roleRows.some(r => r.role_key==='admin')` (line 513) ignores `group_id`. A `tb_karyawan_roles` row `(admin, group_id=7)` yields global `is_admin=true`; `isAllowedGroup`/`getAllowedGroupIds` short-circuit to full access (lines 788, 809). The CHECK preventing this lives **only on `cs_employee_role_bindings`, not `tb_karyawan_roles`**.

**Fix:** enforce "admin row must have NULL group_id" in app code (reject/ignore admin rows with non-null group_id) or via trigger.

### B3 — No admin break-glass after lane removal
Dropping the account lane makes `admin01` depend entirely on a correct `tb_karyawan_auth` + `tb_karyawan_roles(admin)` pair. Two hard failures:
- (a) `admin01` came from an SDK account dump — **verify it even has a `tb_karyawan` row / `karyawan_id` to bind to**; if not, nothing to attach auth to.
- (b) Stateless sessions, no seed path → a wrong backfill = total admin lockout, no UI recovery.

**Fix:** do not remove the account branch until a real NIP-admin login is verified end-to-end. Keep a flag-gated single bootstrap account OR a documented DB seed/reset script as break-glass.

### B4 — Migration hard-cut locks out 73% of staff + 3/4 leaders
If nip-only lane is enabled before manual backfill completes, NULL-nip staff cannot authenticate (`tb_karyawan_auth.nip NOT NULL`). Must be dual-run, not a switch.

---

## HIGH

### H1 — Session subject on mutable NIP → silent logout / mis-bind. Recommend subject = `karyawan_id`
Today subject is `nip:X`, `createAuthContextByNip` resolves `WHERE a.nip=?` (line 501). When HR corrects a NIP:
- Updates `tb_karyawan_auth.nip` too → every live session `nip:OLD` stops resolving → **silent mass logout**.
- Updates only `tb_karyawan.nip`, not the denormalized auth copy → login still works on **stale** auth.nip; displayed nip (line 571) is wrong. If new nip later reused for another hire → **mis-bind risk**.

**Fix:** session subject = `karyawan_id` (immutable PK). Add `createAuthContextByKaryawanId(id)`; keep NIP only as login-form lookup key.

### H2 — Drop the denormalized `tb_karyawan_auth.nip`
It's a copy of `tb_karyawan.nip` and will drift. Make login resolve `tb_karyawan k JOIN tb_karyawan_auth a ON a.karyawan_id=k.id WHERE k.nip=?`, so NIP lives in exactly one place. Auth row keys only on `karyawan_id`. Removes a whole class of drift bugs + a redundant UNIQUE.

### H3 — Soft-deleted employees still log in via NIP lane (revocation gap)
Good: `/api/auth/me` → `createAuthContextByNip` re-queries `is_active=1` live every request (line 501), so `is_active=0` revokes ~immediately. **But** the NIP lane never checks `tb_karyawan.isDeleted` (only the PIN lane does, lines 609-619). A soft-deleted employee with `is_active=1` keeps full access.

**Fix:** add `AND k.isDeleted=0` to the NIP context query. Note: no per-session revocation lever (no jti/version); `AUTH_SECRET` rotation is the only global kill switch. Acceptable for LAN-only; document it.

### H4 — Groups UI split-brain if you migrate writes but not reads
§4 moves `assign_leader`/`remove_leader` writes to `tb_karyawan_roles`, but `groups/route.js` GET still **reads** leaders from `tb_user_group_access` (lines 88-104) and leader-candidate list joins `tb_user` by PIN (lines 73-86). Migrate **read + write together**; stop reading `is_leader` from the device table for any auth/display. Machine can keep writing the column as dead data. Plan cleanup to zero orphaned `tb_user_group_access.is_leader` rows.

### H5 — Login CSRF + NIP enumeration + brute force
`sameSite=lax` blocks cookie theft but login has no CSRF token and **no rate limiting** → NIP enumeration + password brute force. Minor: NIP lane returns `'Invalid credentials or inactive account'` (login:97) vs `'Invalid credentials'` (line 105) — unify. Add rate limiting (per-IP + per-nip) minimum; CSRF token if reachable beyond trusted LAN.

---

## MEDIUM

- **M1 — 3-role model vs 5-value enum mismatch.** Design says `admin/group_leader/employee`, but `tb_karyawan_roles.role_key` ENUM still has `hr`, `scheduler`, `viewer`; `createAuthContextByNip` maps `scheduler→leader` (line 514) and `hr→global access` (line 531). Decide explicitly: keep or migrate/ban them. Don't leave code mapping roles the design says don't exist.
- **M2 — `verifyPassword` accepts legacy plaintext + rehashes (password.ts:34-36).** Useful for migration but a backfilled plaintext password is accepted. Flag it so backfill doesn't leave plaintext in `password_hash`. Empty/empty `valid:true` path (line 26) is zod-guarded by `password.min(1)` — low risk, don't remove the guard.
- **M3 — No audit log on role/leader changes.** Add minimal append-only log of who changed whose role/group.
- **M4 — No password reset flow for NIP lane.** Once account lane gone, no reset path. Provide at least admin-driven reset.

---

## Recommended final design

- **Login key:** form posts **NIP**, resolve via `tb_karyawan.nip` (single source), not the denormalized auth copy. **Session subject = `karyawan_id`** (immutable). Most important change vs the draft.
- **Roles target:** **stay on `tb_karyawan_roles` for now** — already wired into `createAuthContextByNip`; migrating to `cs_*` is strictly more work. BUT replicate in app code the two guards only `cs_*` enforce: (a) admin rows must have NULL `group_id`; (b) `is_leader` per-group from that row's `group_id`. *Escalation trigger to move to `cs_employee_role_bindings`/`cs_group_ownership`:* when you need time-bounded roles, multi-owner semantics, or DB-enforced CHECK. Don't pay the migrate-twice cost until those needs are real.
- **Leader = `tb_karyawan_roles(group_leader, group_id=X)`**, multiple per group OK, scoped strictly to X. `canManageSchedule`/`getAllowedGroupIds(auth,'leader')` stay as-is **only after** B1 fixes per-group source data.
- **admin01:** make it `tb_karyawan` + `tb_karyawan_auth` + `tb_karyawan_roles(admin, NULL)`, but keep break-glass.

## Safe migration sequence

1. **Verify `admin01` has a `tb_karyawan` row**; if not, create one first. Backfill auth + admin role and **log in successfully via NIP while both lanes still live.** No removal until this passes.
2. **Fix B1+B2 in `createAuthContextByNip`** (per-group `is_leader`, reject group-scoped admin). Ship independently — live escalation bug regardless of redesign.
3. **Switch session subject to `karyawan_id`** + add `createAuthContextByKaryawanId`; keep NIP-subject decoding for in-flight cookies one TTL window (12h), then drop.
4. **Migrate groups UI read+write together** to `tb_karyawan_roles` (H4); leave device-table writes untouched but unread.
5. **Dual-run:** keep account + PIN lanes alive (existing env flags) while HR backfills NIPs. Add "NIP login available" check; don't flip off old lanes globally.
6. **Backfill completes → verify** 3 nip-null leaders + required staff can log in. Then `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=off`, remove PIN path + `tb_user_group_access` auth read.
7. **Remove account branch last**, keep documented DB-level admin seed/reset script as permanent break-glass. Then add `k.isDeleted=0` (H3), rate limiting (H5), zero orphaned device-table leader rows.

**Effort: Large (3d+).** Steps 1-2 alone are Short and worth shipping immediately — B1/B2 are exploitable today, independent of the redesign.

## Watch out for

- `tb_employee_group` appears single-group-per-employee (ON DUPLICATE KEY UPDATE on `karyawan_id`, groups:135). Confirm — narrows B1's blast radius, but multi-group *leader* case still applies via role rows.
- Don't disable `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` until all `nip:`/`account:` cookies expire (12h), or you force fleet-wide re-login.
- Steps 3 and 6 each cause a logout wave; schedule off-hours.

## Optional future

- Move to `cs_*` with DB-enforced CHECK once time-bounded roles needed.
- Add a real revocation store (session version bump) if LAN-only assumption relaxes.
