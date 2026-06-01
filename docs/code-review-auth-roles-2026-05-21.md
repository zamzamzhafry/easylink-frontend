# Deep Code Review: User & Elevated User Auth Architecture

**Date**: 2026-05-21  
**Scope**: Ambiguous approaches in "user" and "elevated user" role implementations  
**Files Reviewed**: `lib/auth-session.ts`, `lib/domain/employee-auth-model.ts`, `lib/authz/authorization-adapter.ts`, `app/api/auth/login/route.js`, `hooks/use-auth-session.js`, `components/app-shell.jsx`, `components/sidebar.jsx`

---

## Architecture Overview

### Three Parallel Identity Systems

| System | Table | Subject Format | Auth Builder |
|--------|-------|----------------|--------------|
| Account | `auth_accounts` | `account:${loginId}` | `createAuthContextByLoginId()` |
| Employee NIP | `tb_karyawan_auth` + `tb_karyawan_roles` | raw NIP string | `createAuthContextByNip()` |
| Legacy PIN | `tb_user` | raw PIN string | `createAuthContextByPin()` |

### Session Resolution Order (`getAuthContextFromCookies`)

1. If subject starts with `account:` → `createAuthContextByLoginId`
2. Try `createAuthContextByLoginId(subject)` (without prefix)
3. Try `createAuthContextByNip(subject)`
4. If `LEGACY_PIN_FALLBACK_ENABLED` → `createAuthContextByPin(subject)`

### Role Taxonomy

| Layer | Roles |
|-------|-------|
| `auth_accounts.role_key` | `admin`, `hr`, `scheduler`, `viewer` |
| Canonical (employee-auth-model) | `admin`, `group_leader`, `employee` |
| Legacy aliases | `admin`, `leader`, `scheduler`, `viewer`, `group_leader`, `employee`, `hr` |

### ACCOUNT_ROLE_COMPAT Mapping

| role_key | privilege | is_admin | is_hr | is_leader | can_schedule | can_dashboard | canonical |
|----------|-----------|----------|-------|-----------|--------------|---------------|-----------|
| admin | 4 | true | true | true | true | true | `['admin']` |
| hr | 3 | false | true | false | true | true | `['group_leader']` |
| scheduler | 2 | false | false | true | true | true | `['group_leader']` |
| viewer | 1 | false | false | false | true | true | `['employee']` |

### Global vs Scoped Roles

- **Global** (skip group scoping): `admin`, `hr`
- **Scoped** (require `auth_account_group_scope`): `scheduler`, `viewer`

---

## Findings

### 1. Subject Collision Risk (Medium Severity)

**Problem**: The waterfall resolution in `getAuthContextFromCookies` probes databases sequentially. If a `login_id` in `auth_accounts` matches an existing NIP in `tb_karyawan_auth`, the account path wins silently.

**Scenario**: 
1. Employee "12345" authenticates via NIP path → gets NIP-derived permissions
2. Admin later creates an account with `login_id = "12345"` 
3. On next session resolution, subject "12345" now resolves as account (step 2 in waterfall) instead of NIP (step 3)
4. Employee's permissions change without any visible action

**Root Cause**: Legacy sessions (`payload_format: 'legacy'`) don't store `subjectType`. The system guesses identity type by probing.

**Recommendation**: Always persist `subjectType` in session payload. On resolution, use it to dispatch directly instead of waterfall probing.

---

### 2. NIP Users Missing Group Scoping (High Severity)

**Problem**: 
- Account-based users get groups from `auth_account_group_scope` table
- NIP-based users: `createAuthContextByNip()` returns `groups: []` unless role derivation populates it
- Login response for NIP path explicitly has **NO groups** in the response body

**Impact**: A NIP-authenticated scheduler/leader has `can_schedule=true` but potentially empty `groups[]`. When `getAllowedGroupIds` runs:
1. User is not admin/hr (not global) → enters group filtering
2. Filters empty `groups[]` by capability → returns `[]`
3. User sees no data

**Question**: Is this intentional (NIP users are global-only by design) or a bug? If intentional, it's undocumented and the `getAllowedGroupIds` function doesn't handle this case explicitly.

**Recommendation**: Either:
- Populate groups in NIP auth path (from employee-group assignments)
- Or add explicit "NIP users are unscoped" logic in `getAllowedGroupIds` with documentation

---

### 3. Role Semantics Diverge Across Layers (Medium Severity)

**Problem**: The same "elevated user" concept means different things at different layers:

| Check Point | What "elevated" means |
|-------------|----------------------|
| `ACCOUNT_ROLE_COMPAT` | Boolean flags (`is_admin`, `is_hr`, `is_leader`) |
| `employee-auth-model.ts` | Canonical role membership (`admin`, `group_leader`) |
| `authorization-adapter.ts` | Capability flags (`can_schedule`, `can_dashboard`) |
| `sidebar.jsx` | Mix of `role_key` string checks AND boolean flags |
| `app-shell.jsx` | Only checks `is_admin` for ops sidebar |

**Specific Confusion**: HR and Scheduler both map to canonical `group_leader`, but:
- HR gets `is_hr=true`, `is_leader=false`
- Scheduler gets `is_hr=false`, `is_leader=true`

The `getAttendanceScope` function checks `can_schedule || is_leader` for 'leader' scope. HR passes via `can_schedule=true`, but the semantic is wrong — HR isn't managing schedules in the domain sense, they're doing HR operations.

**Recommendation**: Separate `can_schedule` into `can_manage_schedule` (write) and `can_view_schedule` (read). Map HR to view-only.

---

### 4. Viewer Role Permissions Don't Match Name (Low Severity)

**Problem**: `ACCOUNT_ROLE_COMPAT` gives viewer:
- `can_schedule: true`
- `can_dashboard: true`
- canonical: `['employee']`

A "viewer" with `can_schedule=true` passes the `canSeeNavItem` check for `'schedule'` requirement. The nav shows schedule management UI to viewers.

**Nuance**: These flags only gate navigation visibility, not write operations. But the naming creates false confidence — developers might assume `can_schedule=true` means "can modify schedules" and skip server-side write checks.

**Recommendation**: Rename to `can_view_schedule` / `can_edit_schedule` split, or document clearly that these are visibility flags only.

---

### 5. Client-Side Role Display Fragility (Low Severity)

**Problem**: `sidebar.jsx` roleLabel logic:
```javascript
is_admin → 'Admin'
is_hr → 'HR'
role_key === 'scheduler' || is_leader → 'Group Leader'
role_key === 'viewer' → 'Viewer'
else → 'Member'
```

Issues:
- `role_key` only exists for account-type users
- NIP users rely on boolean flags only
- Priority order matters: an HR user who is also a leader shows "HR" (first match wins)
- No single source of truth for display labels

**Recommendation**: Centralize role label derivation in `authorization-adapter.ts` alongside other authz logic. Export a `getRoleDisplayLabel(auth)` function.

---

### 6. Legacy PIN Fallback — Silent Privilege Escalation (Medium Severity)

**Problem**: When `LEGACY_PIN_FALLBACK_ENABLED=true`:
- `createAuthContextByPin` uses `tb_user.privilege >= 4` for admin detection
- No audit trail distinguishes "admin via modern account" from "admin via legacy PIN"
- Legacy `tb_user` table may have stale privilege values from before the migration

**Scenario**: A deactivated employee's legacy PIN record still has `privilege=4`. If their PIN happens to not match any account or NIP, the fallback grants them full admin access.

**Recommendation**: 
1. Add audit logging when PIN fallback path is used
2. Cross-reference PIN users against an active-employee check
3. Set deprecation timeline for `LEGACY_PIN_FALLBACK_ENABLED`

---

### 7. Login Response Shape Inconsistency (Low Severity)

**Problem**: Login API returns different shapes for account vs NIP:

| Field | Account Path | NIP Path |
|-------|-------------|----------|
| `account_id` | Yes | No |
| `login_id` | Yes | Yes |
| `role_key` | Yes | No |
| `nip` | No | Yes |
| `groups` | Yes (array) | No |

Client code (`use-auth-session.js`, `app-shell.jsx`) must handle both shapes. Any new field added to one path but not the other creates silent undefined access.

**Recommendation**: Normalize the `/api/auth/me` response to a single canonical shape regardless of auth path. The auth path is a server concern, not a client concern.

---

## Priority Matrix

| # | Issue | Severity | Effort | Recommendation |
|---|-------|----------|--------|----------------|
| 2 | NIP users missing group scoping | **High** | Medium | Populate groups or document global-only constraint |
| 1 | Subject collision risk | Medium | Low | Store `subjectType` in all session payloads |
| 6 | PIN fallback escalation | Medium | Low | Audit logging + active-employee check |
| 3 | Role semantics divergence | Medium | High | Unify around capability flags with clear naming |
| 4 | Viewer `can_schedule` naming | Low | Low | Rename or document as visibility-only |
| 5 | Role display fragility | Low | Low | Centralize in authorization-adapter |
| 7 | Login response inconsistency | Low | Medium | Normalize `/api/auth/me` response shape |

---

## Questions for Team Discussion

1. **NIP group scoping**: Is the empty-groups behavior for NIP users intentional? If so, what data do they see?
2. **HR vs Scheduler distinction**: Should HR have schedule management access, or only view access?
3. **PIN deprecation timeline**: When can `LEGACY_PIN_FALLBACK_ENABLED` be turned off?
4. **Viewer write access**: Do viewers need to be blocked from write operations at the API level, or is nav-hiding sufficient?
5. **Subject type migration**: Can we backfill `subjectType` into existing sessions, or do we need a grace period?

---

## Batch Review Questions

Use this section to answer in batch during review.

### Review Mode and Outcome

1. Should this review remain **assessment-only**, or should it become **decision-ready** with chosen fix directions for each medium/high issue?
   - **Recommended answer**: Decision-ready
   - **Reason**: Makes review actionable and reduces follow-up ambiguity.

### Identity Model and Session Resolution

2. Should session payloads always store and enforce an explicit `subjectType` instead of relying on waterfall probing?
   - **Recommended answer**: Yes
   - **Reason**: Removes identity collision ambiguity between `login_id`, NIP, and legacy PIN values.

3. If `subjectType` becomes mandatory, should existing sessions be invalidated immediately, or should there be a migration grace period?
   - **Recommended answer**: Grace period if operationally safe; immediate invalidation if security risk is high
   - **Reason**: Grace period reduces user disruption, but security-sensitive environments may prefer forced re-login.

4. Should the system continue supporting three auth identities (`account`, `employee_nip`, `legacy_pin`) long-term, or should one or more be deprecated?
   - **Recommended answer**: Keep `account` as primary, treat `employee_nip` as transitional, deprecate `legacy_pin`
   - **Reason**: Simplifies auth model and reduces privilege ambiguity.

5. Should `login_id` values be prevented from colliding with NIP values at data-entry time?
   - **Recommended answer**: Yes
   - **Reason**: Preventive validation is safer than relying only on runtime resolution rules.

### Group Scope and Data Access

6. Are NIP-authenticated users supposed to have group-scoped access, global access, or no group-bound access by design?
   - **Recommended answer**: Explicitly define one of these in code and docs; likely group-scoped if they can schedule
   - **Reason**: Current behavior appears ambiguous and may produce empty data results.

7. If NIP users are group-scoped, what is the source of truth for their allowed groups?
   - **Recommended answer**: Derive from employee-to-group assignment data, not ad hoc booleans
   - **Reason**: Keeps authz aligned with domain relationships.

8. If NIP users are not group-scoped, should `getAllowedGroupIds` return `null` for them like global roles, or should the login path be blocked from scoped features?
   - **Recommended answer**: Block scoped capabilities unless explicit scope exists
   - **Reason**: Returning global access by default is riskier than restricting access.

### Role Semantics and Capability Model

9. Should `hr` and `scheduler` remain separate business roles even though both map to canonical `group_leader` today?
   - **Recommended answer**: Yes
   - **Reason**: Their responsibilities appear different even if current capability flags overlap.

10. Should canonical roles remain coarse (`admin`, `group_leader`, `employee`) while capabilities drive behavior, or should canonical role set expand?
   - **Recommended answer**: Keep canonical roles coarse, use explicit capabilities for behavior
   - **Reason**: Reduces role explosion and keeps permission logic clearer.

11. Should `hr` keep `can_schedule=true`, or should HR be split into view-only vs manage capabilities?
   - **Recommended answer**: Split into view vs manage capabilities
   - **Reason**: Current naming blurs read/write authority.

12. Should `viewer` continue to receive `can_schedule=true`?
   - **Recommended answer**: No, not unless `can_schedule` is renamed to clearly mean visibility-only
   - **Reason**: Current naming suggests write authority and is misleading.

13. Should schedule permissions be split into separate capabilities such as `can_view_schedule` and `can_manage_schedule`?
   - **Recommended answer**: Yes
   - **Reason**: Avoids overloading one boolean for multiple meanings.

14. Should dashboard permissions also be split into finer-grained capabilities if dashboard contains admin-sensitive data?
   - **Recommended answer**: Only if dashboard access already mixes low-privilege and high-privilege data
   - **Reason**: Add granularity only where domain boundaries demand it.

### UI Labels and Client Contract

15. Should role display labels be derived from one centralized server-side/helper function instead of repeated client conditionals?
   - **Recommended answer**: Yes
   - **Reason**: Prevents label drift between auth paths and components.

16. Should `/api/auth/me` and login responses be normalized to one canonical user shape regardless of auth path?
   - **Recommended answer**: Yes
   - **Reason**: Client should not care whether user came from account or NIP path.

17. Which fields are part of the long-term canonical auth user contract?
   - **Recommended answer**: Stable identity field, canonical roles, explicit capabilities, group scopes, display label
   - **Reason**: Makes downstream UI logic simpler and safer.

### Legacy PIN Fallback

18. Should `LEGACY_PIN_FALLBACK_ENABLED` stay enabled in production?
   - **Recommended answer**: No, unless there is confirmed operational dependency
   - **Reason**: Legacy fallback increases privilege ambiguity and attack surface.

19. If PIN fallback must remain temporarily, should it require extra audit logging and active-user validation?
   - **Recommended answer**: Yes
   - **Reason**: Legacy admin paths need stronger observability and safety checks.

20. Is there an agreed deprecation date or exit criterion for legacy PIN auth?
   - **Recommended answer**: Define one now
   - **Reason**: Temporary fallbacks tend to become permanent without an explicit exit plan.

### Documentation and Domain Language

21. Should terms like `subjectType`, `global role`, `scoped role`, `canonical role`, and `capability` be added or clarified in project glossary/docs?
   - **Recommended answer**: Yes
   - **Reason**: Current review surfaced domain language that should become explicit.

22. Does current architecture need ADR coverage for auth identity resolution and capability-based authorization?
   - **Recommended answer**: Yes
   - **Reason**: These are cross-cutting decisions with long-term consequences.

### Implementation Sequencing

23. If fixes are approved, what should happen first: subject-type hardening, group-scope correction, capability renaming, or legacy PIN deprecation?
   - **Recommended answer**: Start with subject-type hardening and group-scope correction
   - **Reason**: They carry highest correctness/security impact.

24. Should these changes ship as one coordinated auth refactor or as staged, low-risk increments?
   - **Recommended answer**: Staged increments
   - **Reason**: Easier to verify and safer for auth systems.

25. What evidence will count as complete for each stage: tests, migration notes, user-session invalidation plan, and docs updates?
   - **Recommended answer**: Require all four where applicable
   - **Reason**: Auth changes need both technical proof and rollout clarity.

---

## Batch Review Answers and Decisions

This section converts the batch questions into concrete working decisions for this repo as of 2026-05-22. These are implementation-guiding decisions, not just discussion prompts.

### 1. Should session payloads always encode subject type explicitly instead of relying on lookup order?
- **Decision**: Yes.
- **Explanation**: Auth identity must not depend on database probe order because `login_id`, `nip`, and `pin` can collide. Explicit prefixes such as `account:`, `nip:`, and `pin:` remove ambiguity and make session resolution deterministic.
- **Status**: Implemented in current code direction.

### 2. Should ambiguous legacy sessions without subject type continue to be supported indefinitely?
- **Decision**: No.
- **Explanation**: Legacy sessions are acceptable only as short-term compatibility. Keeping them forever preserves collision risk and makes behavior harder to reason about.
- **Action**: Support only during migration window, then remove waterfall fallback for legacy session payloads.

### 3. If a `login_id` collides with an employee `nip`, should system reject account creation rather than rely on resolution precedence?
- **Decision**: Yes.
- **Explanation**: Preventing collisions at write time is safer than trying to resolve them later at read time. Identity namespaces should be enforced, not guessed.
- **Action**: Add uniqueness checks across `auth_accounts.login_id`, `tb_karyawan_auth.nip`, and any managed login identifier source.

### 4. Should account identifiers and employee identifiers live in one global namespace?
- **Decision**: Yes, for interactive login identifiers.
- **Explanation**: Users type one identifier into one login form. That means practical namespace is global whether schema says so or not.
- **Action**: Document and enforce this as business rule.

### 5. Should NIP-authenticated users get explicit `groups[]` populated the same way account-authenticated scoped users do?
- **Decision**: Yes.
- **Explanation**: Scoped capabilities without populated groups create broken access behavior. Client and server should not care whether scope came from account login path or employee login path.
- **Status**: Implemented with fallback sourcing from `tb_user_group_access` when role rows do not provide scoped groups.

### 6. What should be canonical source of scope for NIP users: `tb_karyawan_roles`, employee-group membership tables, or `tb_user_group_access`?
- **Decision**: Derive from employee-to-group assignment data first; use `tb_karyawan_roles.group_id` where present; use `tb_user_group_access` only as transitional compatibility source.
- **Explanation**: Group scope belongs to employee-domain relationships, not legacy UI permission mirrors. `tb_user_group_access` is useful for migration and backward compatibility but should not remain ultimate source of truth.
- **Action**: Move toward explicit employee-group scope model and mark `tb_user_group_access` as compatibility-only.

### 7. If role rows and group rows disagree, which source wins?
- **Decision**: Domain assignment source wins; legacy compatibility rows are fallback only.
- **Explanation**: Role rows describe authorization intent; group assignment describes organizational scope. When conflict exists, explicitly modeled domain relationships are more trustworthy than ad hoc legacy mirrors.
- **Action**: Add reconciliation rules and diagnostics if disagreement is detected.

### 8. If NIP users are not group-scoped, should `getAllowedGroupIds` return `null` for them like global roles, or should login path be blocked from scoped features?
- **Decision**: Block scoped capabilities unless explicit scope exists.
- **Explanation**: Defaulting to global access is riskier than returning no scope. Missing scope should degrade to restricted access, not broad access.
- **Action**: Keep non-admin/non-HR users scoped; require explicit group population.

### 9. Should `hr` and `scheduler` remain separate business roles even though both map to canonical `group_leader` today?
- **Decision**: Yes.
- **Explanation**: Business responsibilities are distinct even if current implementation overlaps. Canonical roles can stay coarse while capabilities preserve business differences.
- **Action**: Preserve separate business role labels and capability mapping.

### 10. Should canonical roles remain coarse (`admin`, `group_leader`, `employee`) while capabilities drive behavior, or should canonical role set expand?
- **Decision**: Keep canonical roles coarse; use capabilities for behavior.
- **Explanation**: Coarse canonical roles are useful for broad policy grouping. Fine-grained behavior belongs in explicit capability flags.
- **Action**: Avoid role explosion; expand capabilities instead.

### 11. Should `hr` keep `can_schedule=true`, or should HR be split into view-only vs manage capabilities?
- **Decision**: Split into view vs manage capabilities.
- **Explanation**: Current `can_schedule` name blurs read and write authority. HR often needs visibility but not always mutation rights.
- **Action**: Introduce `can_view_schedule` and `can_manage_schedule` in staged refactor.
- **Status**: Not yet implemented; design follow-up needed.

### 12. Should `viewer` continue to receive `can_schedule=true`?
- **Decision**: No.
- **Explanation**: Current name implies authority it should not have. Until capability split exists, this flag is misleading and increases accidental misuse risk.
- **Action**: Remove schedule-management implication from viewer role or rename the flag first.
- **Status**: Not yet implemented; tied to capability split.

### 13. Should schedule permissions be split into separate capabilities such as `can_view_schedule` and `can_manage_schedule`?
- **Decision**: Yes.
- **Explanation**: One boolean currently mixes navigation visibility and write authority. Separate capabilities are clearer and safer.
- **Action**: Stage after subject-type and scope corrections.

### 14. Should dashboard permissions also be split into finer-grained capabilities if dashboard contains admin-sensitive data?
- **Decision**: Only where dashboard mixes materially different sensitivity levels.
- **Explanation**: Extra capability granularity is useful only when it enforces real domain boundaries. Avoid premature fragmentation.
- **Action**: Audit dashboard surfaces before splitting.

### 15. Should role display labels be derived from one centralized server-side/helper function instead of repeated client conditionals?
- **Decision**: Yes.
- **Explanation**: Labels should not drift across components or auth paths. One helper keeps naming consistent.
- **Status**: Implemented via centralized helper direction.

### 16. Should `/api/auth/me` and login responses be normalized to one canonical user shape regardless of auth path?
- **Decision**: Yes.
- **Explanation**: Client code should consume one stable user contract. Auth path differences are server concerns.
- **Status**: `/api/auth/me` normalized. Login route should continue moving toward same shape.

### 17. Which fields are part of the long-term canonical auth user contract?
- **Decision**: Stable identity, canonical roles, explicit capabilities, group scopes, display label, subject type, and optional source-specific metadata.
- **Explanation**: Clients need predictable fields for rendering and capability gating. Source-specific fields may exist, but only as optional metadata.
- **Canonical fields**:
  - `pin`
  - `nama`
  - `privilege`
  - `is_admin`
  - `is_hr`
  - `is_leader`
  - `can_schedule`
  - `can_dashboard`
  - `groups[]`
  - `canonical_roles[]`
  - `subject_type`
  - `role_label`
- **Optional metadata**:
  - `account_id`
  - `login_id`
  - `role_key`
  - `nip`
  - `karyawan_id`

### 18. Should `LEGACY_PIN_FALLBACK_ENABLED` stay enabled in production?
- **Decision**: No, unless there is confirmed operational dependency.
- **Explanation**: PIN fallback is highest-ambiguity auth path and weakest policy anchor. It should be transitional only.
- **Status**: Still configurable today; deprecation should be planned.

### 19. If PIN fallback must remain temporarily, should it require extra audit logging and active-user validation?
- **Decision**: Yes.
- **Explanation**: Legacy admin-capable paths require stronger observability and safety checks.
- **Status**: Implemented warning logging and deleted-employee guard.

### 20. Is there an agreed deprecation date or exit criterion for legacy PIN auth?
- **Decision**: Define one now.
- **Explanation**: Temporary compatibility paths become permanent without explicit removal criteria.
- **Proposed exit criteria**:
  1. All active users have account or NIP auth path.
  2. No production audit events for PIN fallback for 30 consecutive days.
  3. Ops confirms no machine-only workflow depends on PIN login.

### 21. Should terms like `subjectType`, `global role`, `scoped role`, `canonical role`, and `capability` be added or clarified in project glossary/docs?
- **Decision**: Yes.
- **Explanation**: Review surfaced domain language that should become explicit shared vocabulary.
- **Action**: Add glossary/ADR follow-up.

### 22. Does current architecture need ADR coverage for auth identity resolution and capability-based authorization?
- **Decision**: Yes.
- **Explanation**: These are cross-cutting decisions with durable effects on security, UX, and data visibility.
- **Action**: Write ADR for identity resolution order, subject encoding, and scope/capability model.

### 23. If fixes are approved, what should happen first: subject-type hardening, group-scope correction, capability renaming, or legacy PIN deprecation?
- **Decision**: Start with subject-type hardening and group-scope correction.
- **Explanation**: They have highest correctness and security impact and lowest conceptual ambiguity.
- **Status**: Started/implemented.

### 24. Should these changes ship as one coordinated auth refactor or as staged, low-risk increments?
- **Decision**: Staged increments.
- **Explanation**: Auth systems are safer to evolve in observable, reversible slices.
- **Recommended stages**:
  1. Subject-type hardening
  2. Group-scope correction
  3. Normalized client contract
  4. PIN fallback hardening/deprecation
  5. Capability rename/split

### 25. What evidence will count as complete for each stage: tests, migration notes, user-session invalidation plan, and docs updates?
- **Decision**: Require all four where applicable.
- **Explanation**: Auth changes need proof, migration clarity, and operator guidance.
- **Completion evidence**:
  - Automated tests for affected auth path
  - Migration or compatibility note for schema/behavior changes
  - Session invalidation or compatibility plan when token format changes
  - Docs updates in auth/context/ADR surfaces

## Recommended Execution Order

1. **Done / In progress**
   - Subject-type hardening
   - NIP group-scope correction
   - PIN fallback observability/safety
   - `/api/auth/me` normalization

2. **Next**
   - Centralize client role label usage in UI components
   - Add cross-namespace uniqueness checks for login identifiers
   - Add ADR/glossary for auth concepts

3. **Later refactor**
   - Split schedule capability into view/manage
   - Revisit HR vs Scheduler semantics
   - Remove legacy PIN fallback after exit criteria met
