# HRD01 Auth Elevation Hardening Review

**Date**: 2026-05-22  
**Scenario**: `HRD01` was changed in SQL from usual user to admin, then app behavior changed in unexpected ways.  
**Purpose**: Capture repo-specific failure analysis, glossary terms, hardening risks, and batch grilling questions for later review.

---

## Executive Summary

Most likely root cause is **not one bug**, but interaction between:

1. **live DB-backed auth context rebuilds** on each cookie read
2. **multiple identity lanes** (`account`, `employee_nip`, `legacy_pin`)
3. **broad admin-only UI/API surface expansion** when `is_admin` flips
4. **direct SQL edits** that can change one role source without aligning other linked identity records

So `HRD01` can appear as normal user first, then admin later, while same session cookie remains valid.

That is possible because role/privilege is **not stored in cookie**; it is reconstructed from DB repeatedly.

---

## What Happened Mechanically

### Core finding

`easylink_session` cookie identifies subject, but does **not** freeze role flags.

Auth is rebuilt from DB through `getAuthContextFromCookies()` and then returned by `/api/auth/me`.
That means a direct SQL role change can alter effective behavior **mid-session**.

### Repo-specific mechanism

- `app/api/auth/me/route.js`
  - calls `getAuthContextFromCookies()` on every request
  - returns normalized `user` shape from freshly rebuilt auth context
- `components/app-shell.jsx`
  - fetches `/api/auth/me` on mount / shell refresh path
  - stores result in `authUser`
  - derives admin shell behavior from `authUser.is_admin`
- `lib/auth-session.ts`
  - resolves auth from cookie subject into one of several identity builders
  - recomputes flags like `is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`

### Why `HRD01` could look normal first, then admin

Likely sequence:

1. `HRD01` already had valid session cookie.
2. SQL changed one backing role source to admin.
3. Existing client state still showed older fetched auth result.
4. Next `/api/auth/me` call rebuilt auth from DB.
5. `authUser.is_admin` flipped true.
6. New admin-only UI and API surfaces appeared.

So behavior can change on:
- reload
- route change
- login redirect cycle
- any path that re-fetches `/api/auth/me`

---

## Glossary Terms Needed

These should be defined in glossary-style docs before hardening work.

### Subject
Identity token carried by session cookie and used to rebuild auth context.
Examples: account login ID, employee NIP, or legacy PIN reference.

### Subject Type
Explicit identity lane for a subject. In this repo, effective lanes are:
- `account`
- `employee_nip`
- `legacy_pin`

### Identity Lane
Specific lookup path used to rebuild auth context from cookie subject.
Different lanes read different tables and derive roles differently.

### Auth Context
Normalized server-side object returned from `getAuthContextFromCookies()` and exposed through `/api/auth/me`. Includes flags, groups, canonical roles, and subject metadata.

### Canonical Role
Coarse policy role used as stable authorization language.
Current canonical set:
- `admin`
- `group_leader`
- `employee`

### Capability
Behavioral permission flag used alongside canonical roles.
Examples:
- `can_schedule`
- `can_dashboard`
- group-scoped access entries

### Global Role
Role that bypasses group scoping. Current examples in account path:
- `admin`
- `hr`

### Scoped Role
Role that must carry explicit group access instead of global access.
Current examples in account path:
- `scheduler`
- `viewer`

### Elevation
Change that increases effective access, especially changing a user into `is_admin=true` or equivalent broad capability state.

### Hardening
Changes that reduce ambiguity, prevent unsafe elevation, and make role changes predictable and reviewable.

---

## Identity Lanes and Why Direct SQL Edits Are Risky

### Lane 1 — Account path
Source pattern:
- `auth_accounts`
- optional `auth_account_group_scope`

Behavior:
- role comes from `role_key`
- `createAuthContextByLoginId()` maps role through `ACCOUNT_ROLE_COMPAT`
- `admin` and `hr` are global
- `scheduler` and `viewer` are scoped

### Lane 2 — NIP path
Source pattern:
- `tb_karyawan_auth`
- `tb_karyawan_roles`

Behavior:
- derives `is_admin`, `is_hr`, `is_leader`
- derives `can_schedule`, `can_dashboard`
- derives canonical roles from role rows
- group metadata should be loaded for non-global elevated roles

### Lane 3 — Legacy PIN path
Source pattern:
- `tb_user`
- `tb_user_group_access`

Behavior:
- still supported through fallback flag
- privilege-based admin derivation remains possible
- legacy rows can still influence effective auth

### Risk
If `HRD01` exists across multiple tables/layers, changing one row in SQL may not align:
- account role
- employee role rows
- legacy PIN privilege
- scoped group rows

This can create inconsistent behavior depending on which identity lane the cookie subject resolves through.

---

## Key Failure Modes for HRD01 Scenario

### 1. Mid-session privilege change
**Severity**: High

Because role is rebuilt from DB instead of stored in cookie, direct SQL role edits can change effective privileges without logout.

**Observed symptom**:
- same session later behaves differently
- user seems “normal” first, “admin” later

### 2. Mixed identity-source mismatch
**Severity**: High

`HRD01` may exist in multiple identity lanes. One lane may become admin while another still resolves as ordinary user or scoped elevated user.

**Observed symptom**:
- UI inconsistent with expectations
- some APIs still 403
- some pages suddenly unlock broadly

### 3. Admin-surface explosion
**Severity**: High

`is_admin` unlocks many routes/components at once. Elevating to admin to bypass one lock can expose much wider behavior than intended.

### 4. Scoped-vs-global confusion
**Severity**: Medium

If user CRUD was blocked only because scoped elevated role lacked proper capability model, promoting user to admin is over-correction.

### 5. Legacy fallback ambiguity
**Severity**: Medium

Legacy PIN fallback can still influence role derivation and complicate understanding of effective auth state.

### 6. Role language drift
**Severity**: Medium

UI labels, boolean flags, account `role_key`, and canonical roles do not fully speak one language. That makes debugging elevation behavior harder.

---

## What Admin Flip Unlocks in This Repo

### UI / shell changes
- `components/app-shell.jsx`
  - `showRightSidebar = Boolean(authUser?.is_admin)`
- `components/right-ops-sidebar.jsx`
  - admin-only ops queue / refresh surface
- `components/sidebar.jsx`
  - admin label and admin nav visibility

### Hard admin API surfaces found
Examples include:
- `app/api/users/route.js`
- `app/api/employees/route.js`
- `app/api/employees/[id]/route.js`
- `app/api/employees/users/route.js`
- `app/api/shifts/route.js`
- `app/api/shifts/[id]/route.js`
- `app/api/holidays/route.js`
- machine / scanlog / report / other admin operational routes

### Important interpretation
If `HRD01` was elevated just to get through one “user CRUD” lock, that admin flip likely unlocked many unrelated operational surfaces too.

That means current role model probably needs **better scoped elevated permissions**, not repeated manual admin promotion.

---

## Current Architecture Signals from Docs

### Existing policy anchors
`docs/learning/role-capability-matrix.md` already frames canonical policy as:
- `admin`
- `group_leader`
- `employee`

It also states:
- Users/Groups/Shifts admin CRUD = admin only
- elevated non-admin flows should rely on capability + scope model

### Existing handoff note
`docs/agent-context/session-handoff-2026-04-19-machine-role-elevation.md` already says:
- canonical roles are policy layer
- legacy labels are compatibility inputs
- mixed legacy/canonical checks still exist

This supports hardening direction:
- keep canonical roles coarse
- use explicit capabilities for behavior
- reduce identity ambiguity

---

## Hardening Recommendations

### Stage 1 — Stop unsafe operator workflow
**Goal**: Remove direct-SQL role flips as normal operational process.

Actions:
1. Define one approved writer path for auth role changes.
2. Require linked identity records to be updated consistently.
3. Force session refresh or logout after privilege change.
4. Add audit log for role/elevation changes.

### Stage 2 — Make subject typing explicit
**Goal**: Remove ambiguous subject resolution.

Actions:
1. Require explicit `subject_type` semantics in active session handling.
2. Prefer typed subject resolution over fallback probing.
3. Detect and flag collisions between `login_id`, NIP, and PIN-like identifiers.

### Stage 3 — Harden identity alignment
**Goal**: Ensure one human cannot silently resolve through conflicting authority sources.

Actions:
1. Audit whether `HRD01` exists in account, NIP, and legacy PIN paths.
2. Define source-of-truth relationship between these records.
3. Add mismatch detection/reporting for multi-lane inconsistencies.

### Stage 4 — Reduce forced admin promotion
**Goal**: Prevent “admin as workaround.”

Actions:
1. Separate true system-admin actions from scoped elevated actions.
2. Keep canonical roles coarse.
3. Expand capability model where real business need exists.
4. Preserve group scoping for elevated non-admin users.

### Stage 5 — Tighten legacy fallback
**Goal**: Reduce ambiguity from legacy PIN path.

Actions:
1. Add stronger audit visibility when fallback path is used.
2. Restrict or deprecate fallback over time.
3. Avoid letting fallback silently determine modern privileged state.

---

## Grilling Questions for Review

Use these for batch review.

### A. HRD01 incident understanding

1. Which exact SQL row(s) were changed for `HRD01`?
   - `auth_accounts.role_key`?
   - `tb_karyawan_roles.role_key`?
   - legacy `tb_user.privilege`?
   - more than one?

2. At time of incident, what was `HRD01` session subject likely resolving through?
   - account
   - employee NIP
   - legacy PIN

3. Did unexpected behavior happen immediately, after refresh, or after route change?

4. Was the first goal to unlock **system account/user administration**, or to unblock **employee/user-like scoped operations**?

### B. Role model questions

5. Is current “user CRUD” actually one mixed surface containing both admin-only and scoped elevated operations?

6. Which parts of user-related flows must remain admin-only?

7. Which parts should be delegated to elevated non-admin roles with scope?

8. Should `hr` remain separate from `scheduler` even if both map to `group_leader` canonically?

9. Which capability names need splitting because they currently blur read vs manage authority?

### C. Identity-hardening questions

10. Should active sessions always be invalidated after privilege-changing writes?

11. Should direct SQL updates for auth roles be treated as break-glass only?

12. Should collision checks be added for `login_id` vs NIP vs PIN-like values?

13. Should the system fail closed when identity lanes disagree for same user?

14. What should happen if account path says admin but NIP path says scoped elevated user?

### D. Legacy questions

15. Is legacy PIN fallback still operationally required?

16. If yes, what exact use cases still depend on it?

17. What is exit criterion for removing or sharply constraining it?

### E. Documentation questions

18. Which glossary terms should become official before code hardening starts?

19. Does auth identity resolution need ADR coverage?

20. Does capability model need separate ADR coverage, or should both live in one auth ADR?

---

## Recommended Answers / Direction

### Recommended direction on incident
Treat this as **architecture-hardening signal**, not isolated operator mistake.

Reason:
- direct SQL edit exposed existing ambiguity
- current system lets privilege state change mid-session
- broad admin flip hides missing scoped permission design

### Recommended direction on roles
Use:
- coarse canonical roles
- explicit capability model
- scoped elevated access where domain requires it
- admin reserved for true system-wide operational control

### Recommended direction on process
Do not normalize direct SQL elevation as fix path.
Use controlled role mutation path plus forced session refresh/invalidation.

### Recommended direction on docs
Write glossary-style auth terms first, then ADR for:
- identity resolution
- capability model
- legacy fallback policy

---

## Proposed Review Outcome

If this review is accepted, next documents should be:

1. **Glossary doc**
   - auth domain terms above

2. **ADR**
   - identity resolution rules
   - subject typing
   - multi-lane conflict handling
   - capability-driven authorization

3. **Execution plan**
   - staged hardening
   - no one-shot rewrite
   - session invalidation policy
   - operator-safe role change workflow

---

## Concrete Next Moves

1. Audit `HRD01` across all identity tables.
2. Record which lane current session used during incident.
3. Split “user CRUD” into:
   - true admin account-management actions
   - scoped elevated employee/user operations if needed
4. Draft glossary-style auth terminology doc.
5. Draft ADR for auth identity resolution + capability model.
6. Define session invalidation rule after privilege writes.

---

## File Anchors Used

- `lib/auth-session.ts`
- `app/api/auth/login/route.js`
- `app/api/auth/me/route.js`
- `app/api/auth/logout/route.js`
- `hooks/use-auth-session.js`
- `components/app-shell.jsx`
- `components/sidebar.jsx`
- `components/right-ops-sidebar.jsx`
- `app/api/users/route.js`
- `app/api/employees/users/route.js`
- `docs/learning/role-capability-matrix.md`
- `docs/agent-context/session-handoff-2026-04-19-machine-role-elevation.md`
