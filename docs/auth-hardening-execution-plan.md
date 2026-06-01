# Auth Hardening Execution Plan

**Date**: 2026-05-22  
**Scope**: Staged implementation plan for auth identity hardening, capability cleanup, and safer role-elevation behavior.  
**Primary trigger**: `HRD01` SQL elevation incident and related auth review findings.

---

## Objective

Harden EasyLink auth so that:

- identity resolution is explicit
- role changes are predictable and auditable
- scoped elevated users do not need admin promotion as workaround
- mixed identity lanes do not silently disagree
- legacy compatibility can be reduced safely over time

---

## Non-Goals

This plan does **not** aim to:

- rewrite the whole auth system in one release
- remove all legacy compatibility immediately
- redesign every permission surface before stabilizing incident-prone flows
- change production behavior without staging verification and rollback clarity

---

## Working Principles

1. **Stage changes** — do not ship one-shot auth rewrite.
2. **Prefer safe restriction over silent broadening** when identity sources disagree.
3. **Use controlled mutation** for privilege changes instead of raw SQL whenever possible.
4. **Keep canonical roles coarse** and use capabilities for behavior.
5. **Preserve group scope** for elevated non-admin workflows.
6. **Add visibility before removal** when tightening legacy paths.

---

## Phase 0 — Incident Audit and Baseline Capture

### Goal
Understand current behavior before changing code.

### Tasks

1. Audit `HRD01` across all identity tables.
   - `auth_accounts`
   - `tb_karyawan_auth`
   - `tb_karyawan_roles`
   - `tb_user`
   - any group-scope or compatibility tables tied to same human

2. Record which session lane `HRD01` resolved through during incident.
   - account
   - employee NIP
   - legacy PIN

3. Record exact surfaces unlocked when `is_admin` became true.
   - user CRUD
   - employee CRUD
   - groups/shifts/holidays
   - machine/scanlog/report/admin widgets

4. Capture any existing operator workflow that currently relies on direct SQL privilege changes.

### Evidence required

- documented row-level audit for `HRD01`
- documented lane-resolution explanation
- incident notes attached to auth hardening docs

---

## Phase 1 — Documentation First

### Goal
Make auth language and architectural direction explicit before code movement.

### Tasks

1. Adopt `docs/auth-domain-glossary.md` as terminology source.
2. Adopt `docs/adr/0001-auth-identity-resolution-and-capability-model.md` as architecture anchor.
3. Cross-link docs from `docs/README.md` and relevant handoff docs if desired.
4. Ensure engineers use glossary terms consistently:
   - subject
   - subject type
   - identity lane
   - canonical role
   - capability
   - group scope
   - controlled role mutation

### Evidence required

- docs readable and internally consistent
- review team agrees on terminology and ADR direction

---

## Phase 2 — Operator Workflow Hardening

### Goal
Reduce unsafe privilege changes immediately.

### Tasks

1. Define direct SQL auth updates as break-glass only.
2. Create or designate one controlled role-mutation path.
3. Require audit logging for:
   - actor
   - target identity
   - before role state
   - after role state
   - timestamp
   - source path used
4. Define post-change session policy.
   - forced logout
   - forced cookie replacement
   - guaranteed `/api/auth/me` refresh plus route refresh

### Evidence required

- written operator procedure
- auditable change path
- explicit session-refresh rule after privilege change

---

## Phase 3 — Identity Resolution Hardening

### Goal
Reduce ambiguity in auth context reconstruction.

### Tasks

1. Prefer explicit `subject_type` handling in active session resolution.
2. Tighten or phase down fallback probing behavior where safe.
3. Add collision checks for identifiers that can match more than one lane.
4. Add mismatch detection when linked identity records disagree on effective privilege.
5. Decide fail-safe behavior for disagreement.
   - recommended: fail closed or restrict, plus log for operator review

### Evidence required

- code path inventory shows typed resolution is used first
- test scenarios cover account vs NIP vs legacy PIN ambiguity
- mismatch logs or diagnostics visible to operators

---

## Phase 4 — Scoped Elevated Authorization Cleanup

### Goal
Stop using admin promotion to solve missing scoped permissions.

### Tasks

1. Split “user CRUD” into actual policy buckets.
   - true system account management
   - employee/user-directory operations
   - scoped elevated management if business requires it

2. Keep admin-only surfaces reserved for true system-wide control.
3. Expand capability model where needed instead of adding ad hoc role exceptions.
4. Review current capability names for ambiguity.
   - especially where read vs manage authority is blurred
5. Preserve or improve group-scope enforcement for elevated non-admin flows.

### Evidence required

- route matrix that clearly separates admin-only from scoped elevated actions
- no need to promote users to admin just to perform scoped business tasks

---

## Phase 5 — Legacy Fallback Tightening

### Goal
Lower ambiguity from legacy PIN compatibility path.

### Tasks

1. Add visibility when legacy fallback path is used.
2. Identify remaining operational dependencies on legacy PIN path.
3. Restrict privileged behavior derived from fallback unless explicitly justified.
4. Define deprecation or containment milestone.

### Evidence required

- fallback usage report or confirmed dependency list
- written exit or containment criteria

---

## Phase 6 — Verification and Rollout Safety

### Goal
Prove hardening changes do not create silent lockouts or privilege leaks.

### Tasks

1. Build test matrix for:
   - account admin
   - account scoped elevated
   - NIP-based elevated
   - employee baseline
   - legacy PIN fallback user
   - multi-lane conflict case

2. Verify:
   - `/api/auth/me` normalized output
   - route-level authorization behavior
   - nav visibility
   - admin widget exposure
   - session-change behavior after privilege mutation

3. Document rollback strategy for each auth hardening stage.

### Evidence required

- passing verification checklist for each stage
- explicit note of any pre-existing auth inconsistencies discovered during rollout

---

## Suggested Delivery Order

1. Incident audit for `HRD01`
2. Documentation adoption
3. Controlled role-mutation workflow + session policy
4. Subject-type hardening and collision detection
5. Scoped elevated authorization cleanup
6. Legacy fallback tightening
7. Rollout verification and cleanup

---

## Risks to Watch

### Risk 1 — False confidence from one-lane testing
A fix may work for account login but still fail for NIP or legacy PIN path.

### Risk 2 — Over-broad admin preservation
If team avoids capability cleanup, admin will keep being used as workaround.

### Risk 3 — Silent lockout after fail-closed changes
Mismatch detection must be observable, or users may lose access without clear operator diagnosis.

### Risk 4 — Legacy data drift
Old tables may continue to contradict new intent unless linked records are reviewed together.

---

## Completion Criteria

This auth hardening effort is considered complete only when:

- auth terminology is standardized in docs
- identity resolution path is explicitly defined and reviewed
- privilege-changing workflow is controlled and auditable
- scoped elevated flows no longer require routine admin promotion
- multi-lane conflicts are detected and handled safely
- legacy fallback is constrained with clear policy
- verification matrix passes for all major auth personas

---

## Related Documents

- `docs/hrd01-auth-elevation-hardening-review-2026-05-22.md`
- `docs/auth-domain-glossary.md`
- `docs/adr/0001-auth-identity-resolution-and-capability-model.md`
- `docs/learning/role-capability-matrix.md`
- `docs/agent-context/session-handoff-2026-04-19-machine-role-elevation.md`

---

## Opinionated Guidance

This plan is good. My opinion: it should be executed as a **staged hardening program**, not as a broad auth rewrite. The repo already shows three identity lanes and multiple compatibility seams, so correctness and observability matter more than elegance in first pass.

### What I would optimize for

1. **Deterministic identity resolution first**
   - Remove guesswork before changing role semantics.
   - If subject identity is ambiguous, every later capability decision is suspect.

2. **Scoped elevated workflow before role cleanup**
   - Team should stop using admin promotion as workaround.
   - This is product and operator pain, not only architecture pain.

3. **Visibility before deprecation**
   - Legacy PIN fallback should be instrumented before removal.
   - If removed too early, operators will blame later fixes for older hidden dependencies.

4. **Route matrix before UI cleanup**
   - Do not start from sidebar labels or nav polish.
   - First prove server authorization boundaries are correct.

### Things I would not do yet

- Do **not** expand canonical roles first.
- Do **not** remove all legacy tables in this effort.
- Do **not** merge all role/capability changes into one release.
- Do **not** assume HR semantics can be finalized without route-by-route review.

### Most important short-term outcomes

1. Session lane is explicit and stable.
2. Scoped users can do scoped work without admin elevation.
3. Auth conflicts fail safe and are visible.
4. Operators have one approved mutation path.

---

## Recommended Engineering Decisions

### Decision A — Identity resolution
- Keep canonical roles coarse.
- Treat `subject_type` and identity lane as first-class auth data.
- Dispatch from typed subject first.
- Treat waterfall probing as compatibility-only.

### Decision B — Scoped authorization
- Non-admin non-HR users must always carry explicit scope.
- Missing scope means restricted access, not implicit global access.
- NIP users should resolve scope from employee/group domain data, with compatibility fallback only where still needed.

### Decision C — Role mutation
- Admin promotion should not be normal business workflow.
- Use controlled mutation path with audit trail.
- Force session refresh after privilege mutation.

### Decision D — Capability model
- Keep `admin`, `group_leader`, `employee` as canonical role set.
- Drive behavior from explicit capabilities.
- Split ambiguous flags like `can_schedule` later into view/manage variants.

---

## AI Coding Agent Handoff

This section is written to be passed directly to a coding agent that will orchestrate and execute the hardening work.

### Mission
Implement auth hardening in staged, low-risk increments. Prioritize correctness, restriction on ambiguity, and operator observability over broad refactor ambition.

### Operating rules

1. Do **not** rewrite whole auth system in one pass.
2. Ship in reviewable phases with verification after each phase.
3. Prefer fail-closed behavior when identity sources disagree.
4. Preserve compatibility unless a stage explicitly removes it.
5. Update docs alongside behavior changes.
6. Add diagnostics/logging where hidden compatibility behavior exists.

### Execution order for coding agent

#### Stage 1 — Identity resolution hardening
**Goal**: Make auth context reconstruction deterministic.

**Primary files**:
- `lib/auth-session.ts`
- `app/api/auth/login/route.js`
- `app/api/auth/me/route.js`
- `hooks/use-auth-session.js`

**Tasks**:
- Ensure all newly issued sessions encode typed subject lane.
- Ensure cookie/session resolution dispatches by typed lane first.
- Limit fallback waterfall to compatibility path only.
- Add collision checks between `auth_accounts.login_id` and `tb_karyawan_auth.nip`.
- Normalize `/api/auth/me` contract for all lanes.

**Done means**:
- No new ambiguous sessions.
- Same user shape from account and NIP auth paths.
- Tests cover account/NIP/PIN collision scenarios.

#### Stage 2 — Group scope correction
**Goal**: Scoped users actually receive and enforce scope.

**Primary files**:
- `lib/auth-session.ts`
- `lib/authz/authorization-adapter.ts`
- `app/api/schedule/route.js`
- `app/api/report/route.js`
- `app/api/analytics/route.js`
- `app/api/performance/route.js`

**Tasks**:
- Populate NIP-user `groups[]` from domain assignment source.
- Keep compatibility fallback only where needed.
- Ensure `getAllowedGroupIds()` does not silently broaden access.
- Add mismatch diagnostics when role/capability exists without scope.

**Done means**:
- NIP scheduler/leader users can see only their allowed scoped data.
- Missing scope yields restricted access, not global access.

#### Stage 3 — Controlled role mutation path
**Goal**: Stop raw SQL admin elevation as normal workflow.

**Primary files**:
- likely new API route under `app/api/` for role mutation
- `lib/auth-session.ts`
- any current admin/settings surfaces that mutate roles
- docs under `docs/`

**Tasks**:
- Define one approved role-mutation path.
- Log actor, target, before state, after state, and timestamp.
- Force session refresh/invalidation after changes.
- Document break-glass SQL as emergency-only.

**Done means**:
- Operators have one documented path.
- Elevation changes are auditable.
- Session behavior after mutation is explicit.

#### Stage 4 — Scoped elevated cleanup
**Goal**: Remove need for admin workaround for scoped business operations.

**Primary files**:
- `components/sidebar.jsx`
- `components/app-shell.jsx`
- `lib/authz/authorization-adapter.ts`
- all admin/scoped route handlers discovered in route matrix

**Tasks**:
- Produce route matrix separating true admin-only vs scoped elevated actions.
- Move scoped business actions out of admin-only bucket where product requires it.
- Keep machine/system-wide/destructive controls admin-only.
- Centralize display label and capability derivation.

**Done means**:
- Scoped elevated persona can perform scoped workflow without full admin.
- Admin-only surfaces remain narrow and explicit.

#### Stage 5 — Legacy fallback tightening
**Goal**: Contain or deprecate legacy PIN behavior.

**Primary files**:
- `lib/auth-session.ts`
- any env/doc surfaces for `LEGACY_PIN_FALLBACK_ENABLED`
- rollout docs

**Tasks**:
- Log when PIN fallback is used.
- Block deleted/inactive users from fallback auth.
- Define deprecation criteria and operator report.

**Done means**:
- Team can quantify fallback usage.
- Fallback risk is reduced and visible.

---

## Concrete File-Level Notes for Agent

### `lib/auth-session.ts`
Treat this as primary hardening seam.

Expected responsibilities here:
- typed subject dispatch
- auth context normalization
- fallback safety rules
- group scope derivation
- centralized role label helper
- safe allowed-group resolution

### `lib/authz/authorization-adapter.ts`
Treat this as primary capability-policy seam.

Expected responsibilities here:
- capability naming cleanup
- role-to-capability mapping
- separation of view vs manage semantics
- shared policy helpers consumed by routes and UI

### `app/api/auth/login/route.js`
Keep response and cookie issuance aligned with typed identity lane and normalized contract.

### `hooks/use-auth-session.js`
Client should consume canonical shape only. Remove assumptions about account-only fields.

### `components/sidebar.jsx` and `components/app-shell.jsx`
Do not invent auth semantics here. Consume centralized helpers.

---

## Verification Requirements for Coding Agent

Each stage should include:

1. **Behavior verification**
   - typed session path
   - NIP scoped user path
   - account scoped user path
   - admin path
   - legacy PIN path if still enabled

2. **Conflict verification**
   - account login ID collides with NIP
   - scoped capability without scope
   - deleted user with stale legacy PIN

3. **UI verification**
   - nav visibility
   - `/api/auth/me` contract consumption
   - post-role-change refresh behavior

4. **Docs verification**
   - glossary updated if terms evolve
   - ADR updated if decision changes
   - execution plan updated with actual rollout progress

---

## Delivery Advice to Orchestrator Agent

If using multiple agents:

- **Explorer agent**: map route matrix and auth consumers first.
- **Worker agent 1**: `lib/auth-session.ts` hardening.
- **Worker agent 2**: route-level authz cleanup.
- **Worker agent 3**: client normalization (`use-auth-session`, shell, sidebar).
- Keep write scopes separate.
- Integrate only after typecheck/build and persona verification pass.

If using one agent:
- Do stages in order.
- Commit after each stable stage.
- Do not mix capability rename with fallback deprecation in same patch.

---

## Recommended Next Commit Set

If starting now, first implementation PR should contain only:

1. typed subject hardening
2. NIP group-scope correction
3. normalized `/api/auth/me`
4. compatibility-safe logging for PIN fallback

That PR should **not** yet include:
- full capability rename
- HR semantic redesign
- legacy PIN removal
- broad admin/scoped route migration

This keeps first rollout high-value and low-risk.
