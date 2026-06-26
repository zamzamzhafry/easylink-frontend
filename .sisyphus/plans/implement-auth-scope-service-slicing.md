# Implement Auth Scope, Service Boundaries, and Component Slicing

## TL;DR

> **Quick Summary**: Implement staged fixes from architecture guidance by stabilizing auth/authorization semantics, adding canonical auth migration artifacts, modularizing backend boundaries, and slicing frontend monoliths without extracting microservices yet.
>
> **Deliverables**:
> - canonical role/scope constants and compatibility policy
> - migration SQL + rollback + audit/backfill scripts for canonical auth tables
> - scope-based authorization engine with legacy boolean compatibility
> - domain service/repository boundaries for Identity, Workforce, Scheduling, Scanlog, Machine, Attendance, Reporting
> - sliced frontend containers/hooks/mappers/sections for app shell, schedule, machine, attendance, users
> - updated docs, Obsidian/Mermaid architecture artifacts, and agent-executed QA evidence
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 5 waves + final review
> **Critical Path**: Prep → Auth vocabulary → Schema migrations → Policy engine → Route guards → Frontend/API refactors → Integration QA

---

## Context

### Original Request
User asked: `do plan for implementation of fixes` after architecture/code review docs were created for component slicing, auth role/scope redesign, canonical schema, route ownership, and service extraction.

### Interview Summary
**Key Discussions**:
- User wants implementation plan, not more review prose.
- Existing guidance docs are source of truth for planned fixes.
- Broad microservices are deferred; modular monolith comes first.
- Auth compatibility must be preserved while canonical roles/scopes are introduced.

**Research / Guidance References**:
- `docs/implementation-guidance-component-auth-service-slicing.md` - staged implementation guide and non-negotiable constraints.
- `docs/role-scope-matrix.md` - target roles, scopes, compatibility mapping, open role decisions.
- `docs/route-ownership-matrix.md` - API route ownership and extraction phase matrix.
- `docs/auth-canonical-schema-ddl.md` - canonical auth DDL guidance.
- `docs/service-extraction-roadmap.md` - modular monolith first, future service extraction order.
- `.multibrain/session.md` and `.multibrain/indexes/agents.md` - shared agent memory workflow.

### Metis Review
**Identified Gaps** (addressed):
- Need explicit canonical authority sequencing: apply hybrid mode first; no auth lane removed.
- Need rollback/audit gates for any schema work.
- Need exact compatibility contract for legacy booleans and login response shapes.
- Need fixtures and seed users for role/scope QA.
- Need no-microservice guardrail to prevent premature network/service split.
- Need stop conditions for `/api/users` refactor to avoid transactional drift.

---

## Work Objectives

### Source-of-Truth Decision

For this implementation plan, canonical authorization vocabulary follows `docs/role-scope-matrix.md`.

Exact canonical enum set for this plan:
- Global roles: `super_admin`, `hr_admin`, `scheduler_admin`, `viewer`, `employee`, `service_account`.
- Group roles: `group_leader`, `group_scheduler`, `group_viewer`, `group_member`.
- Deferred role: `group_owner` is not implemented in v1; collapse to `group_leader` as explicit product deferral. Contract artifact must state no current workflow depends on stronger owner semantics such as approval delegation, escalation, or ownership transfer.
- Resolver schema ceiling: full scope catalog from `docs/role-scope-matrix.md` must be declared in constants/types and must not be narrowed by wave-1 route choices.
- Wave-1 enforced scopes: `auth.session.read`, `auth.session.manage`, `employee.read.any`, `employee.write.any`, `group.read.any`, `group.write.any`, `schedule.read.any`, `schedule.write.any`, `attendance.read.any`, `machine.read.any`, `scanlog.read.any`, `report.read.any`, plus group/self read/write equivalents used by converted routes.

Source precedence for implementation:
1. `docs/role-scope-matrix.md` - target roles/scopes and compatibility mapping.
2. `docs/auth-canonical-schema-ddl.md` - target table design.
3. `docs/implementation-guidance-component-auth-service-slicing.md` - staged order and guardrails.
4. `docs/route-ownership-matrix.md` - backend ownership/extraction sequence.
5. `docs/service-extraction-roadmap.md` - modular-monolith and anti-microservice guardrail.
6. `docs/adr/0001-auth-identity-resolution-and-capability-model.md` - rationale/history only, not final enum ceiling.

`docs/adr/0001-auth-identity-resolution-and-capability-model.md` remains historical/architectural rationale for coarse concepts (`admin`, `group_leader`, `employee`) but is not the literal enum constraint for implementation. Executors must implement the richer role/scope matrix unless a later ADR supersedes it.

### Core Objective
Move EasyLink toward a safer modular-monolith architecture by implementing auth role/scope foundations, canonical auth schema migration artifacts, route ownership boundaries, and frontend component slicing while preserving current runtime behavior.

### Concrete Deliverables
- New internal auth role/scope vocabulary and policy modules.
- Canonical auth schema migrations, rollback, backfill, audit, and fixture docs/scripts.
- Scope resolver that can project legacy compatibility booleans.
- Route guard migration plan and first-pass guarded route conversions.
- Modular service/repository layers for route ownership domains.
- Refactored frontend monoliths into containers, hooks, mappers, and presentational sections.
- Docs and graph artifacts updated to match implementation.

### Definition of Done
- [ ] Existing login paths still work: `auth_accounts`, `tb_karyawan_auth`, `tb_user` legacy PIN fallback.
- [ ] Existing compatibility booleans still present until explicit future sunset: `is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`.
- [ ] Canonical scopes exist and are test-covered.
- [ ] Migration SQL has rollback + audit/backfill + dry-run proof.
- [ ] Route ownership boundaries compile and pass API tests.
- [ ] Frontend sliced pages have same visible behavior as before.
- [ ] `npm run typecheck`, `npm run lint`, relevant `node --test --import tsx ...`, and `npm run build` pass or document pre-existing infra blockers.
- [ ] `/review-work` final review passes.

### Must Have
- Hybrid compatibility mode first.
- No secret/raw identifier logging.
- Agent-executed QA evidence for every task.
- `.multibrain/` read before work and updated after work.
- Migration rollback/audit for schema work.
- Route authorization only redirects on confirmed 401/403, never transient API/network failure.

### Must NOT Have (Guardrails)
- No microservice extraction or new deploy unit in this plan.
- No removal of `auth_accounts`, `tb_karyawan_auth`, or `tb_user` login paths.
- No broad rewrite of `/api/users` into separate service first.
- No public-network assumptions; deployed app remains private LAN/VPN scope.
- No human-only acceptance criteria.
- No schema mutation without migration + rollback + audit.
- No scope creep into unrelated UI redesign.

---

## Hybrid Auth Authority Contract

### Runtime authority precedence (frozen for this plan)

1. **Session cookie identifies subject only**; cookie never stores final authorization.
2. **Identity lane resolves principal** by typed subject prefix where available: `account:`, `nip:`, `pin:`.
3. **Canonical role/scope resolver computes effective authorization** from canonical assignments when present.
4. **Compatibility booleans derive from canonical snapshot** during hybrid mode.
5. **Legacy raw fields are migration input/fallback only**, not final target policy source.

### Lane fallback rules

- `auth_accounts.role_key` maps to canonical global role during hybrid mode.
- `tb_karyawan_roles` and `tb_user_group_access` map to canonical group roles/scopes during hybrid mode.
- `tb_user.privilege` is temporary fallback only when no canonical assignment exists.
- `tb_user.is_admin`, `is_leader`, `can_schedule`, and similar booleans must never become final authority after resolver lands.

### Policy defaults applied

- `scheduler_admin` and `group_scheduler` are both kept:
  - `scheduler_admin` = global schedule authority.
  - `group_scheduler` = assigned-group schedule authority.
- Preflight scheduler checkpoint required before code constants/migrations/tests:
  - Inspect current scheduler usage.
  - If current scheduler users have global schedule authority, keep default mapping: `auth_accounts.role_key='scheduler'` → `scheduler_admin`.
  - If current scheduler users are scoped by group in actual usage, map to `group_scheduler` with bound groups and record override in compatibility contract.
  - Until checkpoint evidence exists, do not migrate scheduler mutations, do not convert scheduler write routes, and do not auto-backfill final scheduler role rows.
  - Evidence source must include current role rows, route usage, and UI affordances or explicit fixture substitute if DB unavailable.
- Default assumption for this plan: `auth_accounts.role_key='scheduler'` maps to `scheduler_admin` because account roles are global account-level roles today.
- Group-scoped scheduling authority maps from group-role rows or `tb_user_group_access.can_schedule=1` to `group_scheduler`.
- `group_owner` is collapsed into `group_leader` for v1 unless a real governance workflow is later added.
- `viewer` is read-only in target model.

### V1 minimal executable scope set

Implement full catalog constants from docs, but only these scopes are required to drive first route conversions:
- `auth.session.read`
- `auth.session.manage`
- `employee.read.any`
- `employee.write.any`
- `group.read.any`
- `group.write.any`
- `schedule.read.any`
- `schedule.write.any`
- `attendance.read.any`
- `machine.read.any`
- `scanlog.read.any`
- `report.read.any`
- group/self read/write equivalents actually used by converted routes

Declare but keep inactive in v1 unless route fixtures exist:
- `auth.identity.read.any`
- `auth.identity.write.any`
- `schedule.approve.any`
- `schedule.approve.group`
- `attendance.review.any`
- `attendance.review.group`
- `machine.write.any`
- `scanlog.sync.any`
- `report.export.any`
- `profile.read.self`
- `attendance.read.self`
- `schedule.read.self`
- group read/write scopes from matrix not used by converted route families
- group approve/review/export equivalents

Do not invent ad hoc booleans for these. Either use declared inactive scopes with tests, or leave route family unconverted.

Defer `approve`, `export`, and `review` enforcement until route conversion reaches those families unless implementation already has safe fixtures.

### Exact compatibility projection table

| Canonical role/scope state | `role` | `privilege` | `is_admin` | `is_hr` | `is_leader` | `can_schedule` | `can_dashboard` |
|---|---|---:|---|---|---|---|---|
| `super_admin` | `admin` | 4 | true | true | true | true | true |
| `hr_admin` | `hr` | 3 | false | true | false | true | true |
| `scheduler_admin` | `scheduler` | 2 | false | false | true | true | true |
| `viewer` | `viewer` | 1 | false | false | false | false | true |
| `employee` only | `employee` | 0 | false | false | false | false | false |
| `group_leader` only | `employee` | 0 | false | false | true | false | true |
| `group_scheduler` only | `employee` | 0 | false | false | false | true | true |

Rules:
- Group-scoped roles must not inflate to global admin/hr.
- If multiple roles apply, highest global role determines legacy `role`/`privilege`; group booleans may add `is_leader` or `can_schedule` only within scoped UI/route context.
- `viewer` never receives mutation booleans in target projection.

### `/api/auth/me` hybrid response contract

During migration, `/api/auth/me` and equivalent session user payloads must preserve compatibility fields and add canonical fields additively.

Frozen session subject wire contract:
- Cookie subject is typed string payload source, e.g. `account:<login_id>`, `nip:<nip>`, `pin:<pin>`.
- Existing session payload fields `subject`, `subject_type`, and `payload_format` must remain compatible.
- Session token version and expiration semantics must remain compatible with current `easylink_session` behavior.
- Untyped legacy subject payload remains fallback-only and must not be converted to canonical subject link automatically.
- Cookie does not store scopes/roles; DB resolver rebuilds authority.

Mandatory identity fields:
- `subject`
- `subjectType`
- `subject_type`
- `loginId`
- `login_id`
- `account_id`
- `nip`
- `pin`
- `karyawan_id`
- `nama`
- Fields may be `null`/absent only when current lane does not already expose them; do not remove fields already emitted by `app/api/auth/login/route.js` or `app/api/auth/me/route.js`.

Mandatory canonical fields:
- `globalRoles`
- `groupRoles`
- `scopes`
- `groupIds`
- `canonical_roles` remains present as backward-compatible legacy/canonical bridge until explicit sunset.

Mandatory compatibility fields:
- `role`
- `role_key`
- `is_admin`
- `is_hr`
- `is_leader`
- `can_schedule`
- `can_dashboard`
- `privilege`
- `groups`

Rules:
- Cookie subject typing behavior must remain compatible with `account:`, `nip:`, `pin:`, and documented legacy untyped fallback.
- All 3 login lanes remain accepted: `auth_accounts`, `tb_karyawan_auth`, `tb_user` legacy PIN fallback.
- `/api/auth/me` shape must remain backward-compatible; canonical fields are additive.
- Legacy booleans remain present: `is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`.
- Group filtering semantics remain unchanged unless a route is explicitly migrated and tested.
- UI may read compatibility fields during migration.
- Backend route guards must migrate toward scope checks first.
- Canonical fields are additive; no rename/removal of current fields without explicit later sunset plan.

### Required compatibility contract artifact

Task 3 must create `.sisyphus/evidence/implement-auth-scope-service-slicing/task-3-compat-contract.md` with:
- exact `/api/auth/me` hybrid response schema.
- exact compatibility projection table.
- scheduler checkpoint result and evidence.
- group filtering no-change statement.
- list of converted route families and unconverted route families.

This artifact is executor-facing contract. Later tasks must reference it before changing auth or route behavior.

### No-change zones during this plan

- No auth lane removal.
- No legacy table destructive change.
- No `/api/users` standalone extraction.
- Before touching `/api/users` handlers, classify internals into: identity linkage read/write, employee directory mapping, machine mirror projection from `tb_user`, role/group assignment orchestration, response DTO composer.
- No broad `/api/users` transactional rewrite; only assessment, policy seam extraction, mapping helpers, read-model adapters, or guard seam work with snapshot tests.
- No `/api/users` transaction reshaping in same wave as auth migration.
- No new deploy unit or internal network service call.
- No UI redesign beyond component slicing.
- No route family conversion without fixture/test proof.
- No auto-backfill for ambiguous subject collisions.

### First-pass route conversion scope

Minimum route families for first pass if fixtures exist:
- `/api/auth/me` or shared auth session guard seam.
- one safe Workforce/Users read guard seam.
- one Scheduling read/write guard seam.
- one Machine or Scanlog read/sync guard seam.
- one Attendance or Reporting read guard seam.

Explicitly out of first-pass unless fixtures exist:
- full `/api/users` transactional rewrite.
- broad schedule approval migration.
- report export permission migration.
- attendance review mutation migration.

Converted route families must be pure read/write seams unless approval/export/review fixtures already exist. Hard fail: do not convert any route family whose primary action maps to an inactive scope (`auth.identity.*`, `schedule.approve.*`, `attendance.review.*`, `machine.write.*`, `scanlog.sync.*`, `report.export.*`) unless that scope is activated, fixture-backed, and tested first. Do not choose a route whose current behavior implies `approve`, `export`, or `review` scopes unless that scope and fixture are implemented first.

### Frontend slicing invariants

Each sliced page must preserve:
- existing fetch timing and request count shape unless explicitly optimized with proof.
- existing refresh triggers and manual refresh fallback.
- no new blind interval polling.
- auth cache invalidation behavior from `hooks/use-auth-session.js`.
- no redirect to login on transient API/network/5xx failures.
- existing adapter-based authz calls in `app/schedule/page.jsx` and `app/attendance/page.jsx`; migrate through shared adapter seams instead of replacing page checks directly.
- `components/app-shell.jsx` right-sidebar/admin gating currently reads `authUser?.is_admin`; keep compatibility bridge active until shell/nav uses shared route-visibility adapter with equivalent behavior evidence.
- `app/users/page.jsx` remains privilege/PIN-language heavy; slicing must not rename/remove visible privilege semantics until `/api/users` compatibility snapshots prove safe.

### Fixture strategy gate

Before any route conversion, Task 2 must produce fixtures or explicit blockers for:
- account login admin/hr/scheduler/viewer.
- NIP employee and NIP role/group variants.
- legacy PIN fallback admin/leader/scheduler variants.
- group boundary A/B fixture.
- malformed/expired session fixture.
- transient DB/API failure fixture or mock.
- subject collision fixtures listed in collision policy.

If fixture is missing, executor must not convert route family needing that fixture.

### Concrete QA matrix

Executor must prove at least these persona/domain combinations:

| Persona | Auth lane | Must allow | Must deny |
|---|---|---|---|
| `super_admin` | `auth_accounts` | all converted route actions | none in converted set |
| `hr_admin` | `auth_accounts` or NIP | employee/group/attendance read-write | machine write unless explicit scope |
| `scheduler_admin` | `auth_accounts` | schedule read/write any | auth identity management |
| `viewer` | any supported lane | read/dashboard/report view | all mutations |
| `employee` | NIP | self profile/attendance/schedule where implemented | any/group/global mutation |
| `group_leader` | legacy/NIP fixture | assigned group reads | other group access |
| `legacy_pin` admin fallback | `tb_user` | compatibility-permitted action | raw canonical widening beyond fallback |

### Migration mode phases

Resolver/migration must progress only through these modes:
1. **legacy-projected mode**: no canonical DB reads; canonical snapshot computed from legacy sources.
2. **dual-write/audit-only mode**: canonical tables may be backfilled/audited but not used for effective authorization.
3. **canonical-preferred per-subject mode**: only subjects with valid canonical subject link and passing integrity audit use canonical whole snapshot.
4. **legacy fallback mode**: subjects without valid canonical integrity continue legacy projection.
5. **future legacy sunset mode**: outside this plan; requires separate plan and user approval.

### Implementation milestones and hard stop gates

Executor must treat this as one plan with gated milestones, not one uncontrolled rewrite.

Each milestone gate must produce:
- checklist status
- exact commands run
- expected vs actual output
- changed files list
- unresolved risks
- rollback note
- evidence paths

### Risk register required before code changes

Task 4 checklist must include risk register entries for:
- auth contract drift
- scheduler mapping ambiguity
- subject collision/identity linkage
- `/api/users` transaction coupling
- frontend fetch/redirect regression
- migration rollback failure
- inactive scope accidental conversion
- fixture gaps

Each risk must list owner task, mitigation, evidence, and stop/go gate.

0. **Phase 0 auth stabilization milestone**
   - Tasks: 1, 2, 3, 4
   - Gate: current `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, session cookie subject behavior, 401/403 semantics, and `/api/auth/me` rate-limit behavior are captured before auth redesign.
   - Required outputs: login response schema snapshot, me response schema snapshot, cookie subject variant list (`account:*`, `nip:*`, `pin:*`, untyped fallback), 401/403 route matrix, rate-limit placement/exemption note, transient-failure behavior statement (DB down, network fail, 5xx, malformed session), current group filtering examples.
   - Hard stop: do not start canonical auth/schema/policy work until baseline auth contract evidence exists.
   - Explicit June-bug guard: transient DB/API/network errors are not logout, and `/api/auth/me` must not reintroduce broad request-loop/rate-limit churn.

1. **Auth contract milestone**
   - Tasks: 5, 6, 9, 10, 11, 12
   - Gate: constants/types, compatibility projection, legacy-only resolver, additive `/api/auth/me`, and focused tests pass.
   - Hard stop: do not start schema artifacts or frontend slicing until this gate passes.

2. **Schema artifact milestone**
   - Tasks: 7, 8, 27
   - Gate: forward SQL, rollback, dry-run backfill/audit, isolated DB proof, and row-count evidence pass.
   - Hard stop: do not enable canonical-preferred resolver until this gate passes.

3. **Backend boundary milestone**
   - Tasks: 13, 14, 15, 16, 17, 24, 25
   - Gate: service/repository seams compile; representative route guards pass 401/403/group/self tests.
   - `/api/users` hard stop: read-model seam, mapper extraction, policy seam extraction, and snapshot tests only. No transaction order changes and no write orchestration split in this milestone.
   - Hard stop: do not change broad UI surfaces until auth/route contracts stable.

4. **Frontend slicing milestone**
   - Tasks: 18, 19, 20, 21, 22, 23, 26, 28
   - Gate: sliced pages preserve visible behavior and Playwright regression passes.

5. **Closure milestone**
   - Tasks: 29, 30, 31, 32, 33, F0
   - Gate: docs/multibrain updated, integration smoke done, security/static/build checks done, `/review-work` passes.

### Current code constraints found by review

Executor must account for these current code seams:
- `lib/auth-session.ts` and `lib/authz/authorization-adapter.ts` are still boolean-driven around `is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`.
- `lib/domain/employee-auth-model.ts` currently defines coarse roles (`admin`, `group_leader`, `employee`) and must be explicitly replaced, migrated, or wrapped by the richer role model. Do not silently overload old names.
- `app/api/auth/login/route.js` response is coupled to `role_key`, legacy booleans, and `groups`; login response shape must be frozen alongside `/api/auth/me`.
- Route standard helpers already exist: `getAuthContextFromCookies`, `unauthorizedResponse`, `forbiddenResponse`; evolve through these seams to avoid route signature churn.
- `lib/flags/migration-flags.ts` already has migration modes such as `PolicySourceMode = 'legacy' | 'compat_view' | 'canonical'`; new rollout must reuse or align with existing flags rather than inventing parallel switches.

### Auth rollout sequencing (frozen)

Inside auth implementation, executor must follow this order:
1. Freeze vocabulary + compatibility contract.
2. Align/replace `lib/domain/employee-auth-model.ts` with richer canonical roles or create explicit adapter/wrapper.
3. Reuse/align existing `lib/flags/migration-flags.ts` policy modes.
4. Add canonical constants/types only.
5. Add resolver that computes canonical snapshot from legacy sources only.
6. Project existing booleans from snapshot and keep boolean bridge active.
7. Expose additive canonical fields in `/api/auth/me` and `app/api/auth/login/route.js` response without removing current fields.
8. Migrate selected route guards to consume scope resolver through existing auth response helpers.
9. Add canonical SQL artifacts/backfill scripts.
10. Only after migration/audit proof, allow resolver to prefer canonical assignments when present.

This prevents schema-first rollout from breaking app auth contracts.

### Canonical-present precedence rule

When canonical tables exist and resolver supports canonical reads:

```text
effective auth =
  canonical assignments, if canonical subject link exists and integrity checks pass;
  else hybrid projection from legacy lane sources;
  else tb_user privilege fallback only for pin lane;
  else deny.
```

Integrity checks before canonical rows can win:
- active `auth_subject_links` row resolves to exactly one active `auth_identities` row.
- identity status is `active`.
- role keys and scope keys exist in canonical catalogs.
- group-role rows reference valid groups.
- duplicate active assignments do not create conflicting role meaning.
- audit reports zero critical mismatch for that subject.

If any integrity check fails, resolver must fall back to legacy projection and record redacted mismatch telemetry; it must not partially merge corrupted canonical authority.

Strict merge rule:
- No union of canonical scopes and legacy scopes for the same subject during first rollout.
- Effective snapshot is either canonical-preferred whole snapshot or legacy-projected whole snapshot.
- Partial canonical + legacy union is forbidden because it can widen access during incomplete backfill.

Tie-break examples:
- If `auth_accounts` maps to canonical `viewer` but legacy `tb_user.privilege=4`, canonical viewer wins when canonical integrity passes.
- If canonical global role exists but canonical group roles are missing, do not merge legacy group scopes; use canonical whole snapshot or fallback whole legacy snapshot based on integrity gate.
- If two canonical subject links point to different identities for same typed subject, canonical integrity fails and resolver uses legacy projection with redacted mismatch telemetry.
- If typed `account:` and `nip:` subjects map to same employee, they may share identity only after audit proves same person; otherwise stay separate links.
- PIN lane fallback authority ceiling is compatibility projection only; no canonical scope enrichment unless canonical identity integrity passes.
- Ambiguous untyped legacy subject is deny-by-default for canonical linking and remains legacy fallback only with mismatch telemetry.

### Canonical identity linkage decision table

Migration/backfill must classify identity links before writes:

| Case | Action |
|---|---|
| `auth_accounts.login_id` links to known employee by existing audited relation | auto-link allowed |
| `tb_karyawan_auth.nip` belongs to active employee | auto-link allowed |
| `tb_user.pin` maps to exactly one active employee/device mirror with matching audited identity | auto-link allowed only as `legacy_pin` subject |
| `auth_accounts.login_id` equals employee NIP but no audited same-person proof | quarantine/manual-review; no auto-link |
| multiple `tb_user` rows share PIN or name drift | quarantine/manual-review; no auto-link |
| employee lacks auth row but has machine mirror only | do not create login identity automatically; report candidate only |
| one employee has multiple typed subjects with audited same-person proof | link multiple subjects to same identity |
| untyped legacy subject resolves through multiple lanes | never auto-link; legacy fallback only |

### Subject collision handling

Migration/backfill must classify these collisions before writes:
- same human represented in `auth_accounts` and `tb_karyawan_auth`.
- `auth_accounts.login_id` equals `tb_karyawan_auth.nip`.
- same PIN mapped to multiple employee/machine records.
- same login identifier reused across lanes.
- orphan group rows in `tb_user_group_access`.
- employee missing `tb_karyawan_auth` but has role/group artifacts.
- disabled legacy record but active canonical candidate.
- one employee has both account and NIP auth rows.
- `tb_user.pin` reused or stale.
- legacy untyped subject could resolve through multiple lanes.

Collision policy:
- Every collision class must be detected, quarantined, and reported before canonical-preferred activation.
- Quarantined subjects must not use canonical-preferred auth.
- Manual resolution artifact is required before quarantined subject can receive canonical subject link.
- typed subject links (`account:`, `nip:`, `pin:`) are distinct and may link to same identity only when audit proves same employee/person.
- ambiguous untyped legacy subjects remain legacy fallback and must not create canonical subject link automatically.
- duplicate active subject links are critical audit failures.
- collision report must use redacted identifiers only.

### Migration execution gates

Schema work must move through these gates:
1. Add SQL files only.
2. Run SQL syntax/compatibility check against target DB engine or documented local equivalent.
3. Run dry-run backfill/audit with no writes.
4. Run forward migration in isolated local/test DB.
5. Run audit and capture row counts: source rows, inserted identities, inserted subject links, global role rows, group role rows, mismatch rows.
6. Run rollback in isolated local/test DB.
7. Prove rollback leaves legacy tables and rows intact.
8. Only after evidence passes may executor consider applying migration in non-local environment.

---

## Route Guard Rollout Scope

Priority route conversion is representative, not total rewrite. Executor must convert at least one route family from each domain if fixtures exist:
- Identity & Access: `/api/auth/me` or auth session guard seam.
- Workforce/Users: safe read route or users aggregate guard seam.
- Scheduling: schedule read/write or revision approval route.
- Machine/Scanlog: read/sync route with existing tests.
- Attendance/Reporting: read/review/export guard seam.

If fixtures are missing, executor must record blocked route family and reason in evidence; do not invent unsafe DB fixtures.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring human manual testing are forbidden.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after for broad refactors; TDD for pure auth/policy/migration helpers where feasible.
- **Framework**: Node test runner with `tsx` import for TS seams, Next/TypeScript checks, lint, build.
- **Agent-Executed QA**: Mandatory for every task.

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/implement-auth-scope-service-slicing/task-{N}-{scenario-slug}.{ext}`.

A task is incomplete if QA scenarios are unproven.
Acceptance criteria must have a corresponding test/proof command or Playwright artifact.
Evidence must include concrete inputs, exact commands run, expected versus actual output, and failure/blocker context if applicable.

- **Frontend/UI**: Use Playwright skill - navigate, interact, assert DOM, screenshot.
- **API/Backend**: Use Bash/curl or node test runner - assert status, payload, auth behavior.
- **DB/Migration**: Use local/test DB or dry-run SQL parser/runner; capture row-count/audit output.
- **Library/Module**: Use `node --test --import tsx` - import and assert pure helpers.
- **Architecture/Docs**: Use grep/read checks to verify docs and route ownership references.

### Minimum Verification Commands
```bash
node --test --import tsx tests/*.test.js
npm run typecheck
npm run lint
npm run build
```

If `npm run build` fails from missing DB env during page data collection, executor must capture exact error and prove unrelated to this plan.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Phase 0 auth stabilization + prep):
├── Task 1: Read repo docs + multibrain + record execution context [quick]
├── Task 2: Build fixture/seed inventory for auth roles and groups [testing]
├── Task 3: Freeze current auth/login/me/logout compatibility contract and rollback gates [deep]
└── Task 4: Create architecture implementation checklist and evidence folder [quick]

Wave 1 (Auth app contract before schema):
├── Task 5: Canonical role/scope vocabulary module [implementation]
├── Task 6: Legacy compatibility projection policy [implementation]
├── Task 9: Auth fixture matrix and tests [testing]
├── Task 10: Logging/redaction guardrails for auth migration [security]
├── Task 11: Scope resolver from legacy sources only [implementation]
└── Task 12: Route guard adapter preserving old booleans [implementation]

Wave 2A (Schema artifacts after auth contract gate):
├── Task 7: Canonical auth migration SQL + rollback [implementation]
├── Task 8: Backfill/audit/dry-run scripts for canonical auth [implementation]
└── Task 27: Migration dry-run + rollback verification [testing]

Wave 2B (Route ownership foundations after auth contract gate):
├── Task 13: Identity & Access service-layer boundary [refactorer]
├── Task 14: Workforce/Users aggregate boundary assessment and safe seams [refactorer]
├── Task 15: Scheduling service/repository boundary [refactorer]
├── Task 16: Machine + Scanlog service/repository boundary [refactorer]
└── Task 17: Attendance + Reporting boundary and read-model seams [refactorer]

Wave 3 (Frontend slicing after auth/backend contract gates):
├── Task 18: Split AppShell into auth/nav/theme/route-effect pieces [implementation]
├── Task 19: Split Schedule page into container/hooks/sections/mappers [implementation]
├── Task 20: Split Machine page into container/hooks/panels/api/mappers [implementation]
├── Task 21: Split Attendance page into container/hooks/sections/mappers [implementation]
├── Task 22: Split Users page into container/hooks/forms/tables/mappers [implementation]
└── Task 23: Shared frontend authz + route visibility adapter [implementation]

Wave 4 (Integration + compatibility conversion):
├── Task 24: Convert priority routes to scope checks with compatibility fallback [implementation]
├── Task 25: API regression tests for auth/session/route authorization [testing]
├── Task 26: Frontend Playwright regression for navigation and sliced pages [testing]
├── Task 27: Migration dry-run + rollback verification [testing]
├── Task 28: Performance/caching regression check for auth and big pages [testing]
└── Task 29: Docs, Obsidian/Mermaid, and multibrain updates [writing]

Wave 5 (Hardening):
├── Task 30: End-to-end integration pass across auth → users → schedule → attendance → scanlog [testing]
├── Task 31: Security audit fixes before review-work [security]
├── Task 32: Build/lint/typecheck closure [testing]
└── Task 33: Commit packaging guidance and rollback notes [writing]

Wave FINAL:
└── Task F0: Run `/review-work` and require all 5 agents to pass
```

### Dependency Matrix

| Task | Blocked By | Blocks | Wave |
|---|---|---|---|
| 1 | none | 5-33 | 0 |
| 2 | none | 7-9, 25-27, 30 | 0 |
| 3 | none | 5-12, 24 | 0 |
| 4 | none | all QA evidence | 0 |
| 5 | 1,3 | 6,11,12,24 | 1 |
| 6 | 3,5 | 11,12,24 | 1 |
| 7 | 1,2,3,11,12 | 8,27 | 2 |
| 8 | 2,7 | 27 | 2 |
| 9 | 2,5,6 | 11,12,25 | 1 |
| 10 | 3 | 31 | 1 |
| 11 | 5,6,9 | 12,24,25 | 2 |
| 12 | 6,11 | 13-17,23,24 | 2 |
| 13 | 11,12 | 24,25 | 2 |
| 14 | 11,12 | 24,25 | 2 |
| 15 | 11,12 | 24,25 | 2 |
| 16 | 11,12 | 24,25 | 2 |
| 17 | 11,12 | 24,25 | 2 |
| 18 | 12 | 23,26,30 | 3 |
| 19 | 12,15 | 26,30 | 3 |
| 20 | 12,16 | 26,30 | 3 |
| 21 | 12,17 | 26,30 | 3 |
| 22 | 12,14 | 26,30 | 3 |
| 23 | 12,18 | 24,26,30 | 3 |
| 24 | 11-17,23 | 25,30 | 4 |
| 25 | 24 | 30,32 | 4 |
| 26 | 18-23 | 30,32 | 4 |
| 27 | 7,8 | 30,33 | 4 |
| 28 | 18-24 | 30,32 | 4 |
| 29 | 1-28 | 33 | 4 |
| 30 | 25-29 | 31,32 | 5 |
| 31 | 10,30 | F0 | 5 |
| 32 | 25-30 | F0 | 5 |
| 33 | 27,29,32 | F0 | 5 |
| F0 | 30-33 | completion | FINAL |

### Agent Dispatch Summary

- **Wave 0**: T1/T4 quick, T2 testing, T3 deep.
- **Wave 1**: T5/T6 implementation, T7/T8 implementation, T9 testing, T10 security.
- **Wave 2**: T11/T12 implementation, T13-T17 refactorer.
- **Wave 3**: T18-T23 implementation; load `frontend-ui-ux` if UI polish needed.
- **Wave 4**: T24 implementation, T25-T28 testing, T29 writing.
- **Wave 5**: T30 testing, T31 security, T32 testing, T33 writing.
- **FINAL**: F0 `/review-work` skill.

---

## TODOs

- [ ] 1. Read repo docs, multibrain, and constraints

  **What to do**:
  - Read `.multibrain/session.md` and relevant indexes.
  - Read `AGENTS.md`, `docs/README.md`, `docs/agent-restrictions.md`, `docs/agent-context/current-project-context.md`.
  - Read guidance docs listed in Context.
  - Create execution note listing exact constraints and evidence folder path.

  **Must NOT do**:
  - Do not edit app code in prep.
  - Do not skip `.multibrain/` context.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: prep/read/context inventory task.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `review-work` not needed until final gate.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 with Tasks 2-4
  - **Blocks**: Tasks 5-33
  - **Blocked By**: None

  **References**:
  - `.multibrain/session.md` - shared memory entrypoint.
  - `.multibrain/indexes/agents.md` - recent architecture guidance entries.
  - `AGENTS.md` - repo-specific agent restrictions.
  - `docs/implementation-guidance-component-auth-service-slicing.md` - implementation guidance spine.

  **Acceptance Criteria**:
  - [ ] Execution context note exists in evidence folder.
  - [ ] Note lists all non-negotiable constraints.
  - [ ] Executor records selected test commands before edits.

  **QA Scenarios**:
  ```
  Scenario: Prep context captured
    Tool: Bash
    Preconditions: Repo checkout at task start
    Steps:
      1. Run `test -f .multibrain/session.md && test -f AGENTS.md`.
      2. Run `test -f docs/implementation-guidance-component-auth-service-slicing.md`.
      3. Run `test -f .sisyphus/evidence/implement-auth-scope-service-slicing/task-1-context.md`.
    Expected Result: All files exist; context note contains "No microservice extraction" and "No auth lane removal".
    Failure Indicators: Missing context note or missing constraints.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-1-context.md

  Scenario: Missing multibrain guard
    Tool: Bash
    Preconditions: Repo checkout at task start
    Steps:
      1. Temporarily check with `test -f .multibrain/session.md`.
      2. If missing, run global init script per AGENTS before coding.
    Expected Result: `.multibrain/session.md` exists before implementation.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-1-multibrain-check.txt
  ```

  **Commit**: NO

- [ ] 2. Build auth role/group fixture inventory

  **What to do**:
  - Inventory existing test fixtures, mock conventions, and seed data for roles/groups/auth lanes.
  - Define minimum personas: `super_admin`, `hr_admin`, `scheduler_admin`, `viewer`, `employee`, `group_leader`, `group_scheduler`, `legacy_pin`, `service_account`.
  - Include scheduler ambiguity fixtures: global scheduler only, group scheduler only, and both global+group scheduler together.
  - Identify fixture gaps and create local-only fixture strategy.

  **Must NOT do**:
  - Do not require production DB access.
  - Do not log raw PIN/NIP/password/cookie values.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: fixture/test strategy task.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 with Tasks 1,3,4
  - **Blocks**: Tasks 7-9, 25-27, 30
  - **Blocked By**: None

  **References**:
  - `docs/role-scope-matrix.md:23-90` - target role/scope catalog.
  - `docs/auth-canonical-schema-ddl.md:23-35` - migration principle and legacy tables.
  - `tests/` - existing test runner conventions.

  **Acceptance Criteria**:
  - [ ] Fixture inventory created.
  - [ ] Each target role has at least one planned fixture or explicit blocked reason.
  - [ ] Legacy auth lanes have fixtures: account, NIP, PIN.

  **QA Scenarios**:
  ```
  Scenario: Fixture matrix complete
    Tool: Bash
    Preconditions: Fixture inventory file written to evidence folder
    Steps:
      1. Search fixture inventory for `super_admin`, `viewer`, `legacy_pin`, `group_scheduler`.
      2. Search for `account`, `employee_nip`, `legacy_pin` auth lane coverage.
    Expected Result: All personas and lanes listed with fixture source or gap.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-2-fixture-inventory.md

  Scenario: Sensitive data redaction
    Tool: Bash
    Preconditions: Fixture inventory exists
    Steps:
      1. Search inventory for strings `password=`, `cookie=`, `token=`, raw PIN examples longer than masked form.
      2. Confirm all sample identifiers use fake values like `EMP001`, `PIN001`, or masked format.
    Expected Result: No real secrets/raw identifiers in fixture inventory.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-2-redaction-check.txt
  ```

  **Commit**: NO

- [ ] 3. Freeze compatibility contract, login/me snapshots, and rollback gates

  **What to do**:
  - Capture current `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, session cookie subject behavior, and 401/403 response semantics before redesign.
  - Write compatibility contract for login responses, session user shape, booleans, groups, and route guard outcomes.
  - Capture guard rule: transient DB/API/network errors are not logout and must not redirect to login.
  - Capture `/api/auth/me` request/rate-limit baseline to avoid reintroducing auth churn.
  - Define rollback gates for schema, auth resolver, route guard conversion, and frontend slicing.
  - Lock rule: canonical scopes may generate legacy booleans, but legacy booleans are not target source of truth.

  **Must NOT do**:
  - Do not remove compatibility fields.
  - Do not change role meaning without test proof.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: cross-cutting auth contract and rollback design.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 with Tasks 1,2,4
  - **Blocks**: Tasks 5-12, 24
  - **Blocked By**: None

  **References**:
  - `docs/role-scope-matrix.md` - target role semantics.
  - `lib/auth-session.ts` - current AuthContext shape and compatibility booleans.
  - `app/api/auth/login/route.js` - current login response shape.
  - `app/api/auth/me/route.js` - session user response shape.

  **Acceptance Criteria**:
  - [ ] Contract lists exact `/api/auth/me` hybrid fields: identity, canonical, compatibility.
  - [ ] Contract includes exact compatibility projection table.
  - [ ] Contract records scheduler checkpoint result and evidence.
  - [ ] Runtime authority precedence is frozen: session subject → lane principal → canonical snapshot → compatibility projection → legacy fallback only.
  - [ ] Rollback gates listed for DB, auth resolver, route guards, UI slicing.
  - [ ] `viewer` target is read-only; any legacy stronger behavior documented as transitional only.
  - [ ] `scheduler_admin` vs `group_scheduler` and `group_owner` policy defaults match the Hybrid Auth Authority Contract.

  **QA Scenarios**:
  ```
  Scenario: Compatibility contract includes required fields
    Tool: Bash
    Preconditions: Contract file written to evidence folder
    Steps:
      1. Search contract for `is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`, `groups`.
      2. Search contract for `rollback` and `hybrid`.
    Expected Result: Required fields and rollback rules present.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-3-compat-contract.md

  Scenario: Viewer no mutation target
    Tool: Bash
    Preconditions: Contract file exists
    Steps:
      1. Search contract for `viewer`.
      2. Confirm nearby text says read-only/no mutation in target model.
    Expected Result: Viewer target cannot mutate.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-3-viewer-policy.txt
  ```

  **Commit**: NO

- [ ] 4. Create implementation checklist and evidence scaffolding

  **What to do**:
  - Create evidence directory for this plan.
  - Create implementation checklist mapping all tasks to changed files, tests, and rollback notes.
  - Record commands that must run at final verification.

  **Must NOT do**:
  - Do not mark task complete without evidence files.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: lightweight workflow setup.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 with Tasks 1-3
  - **Blocks**: all QA evidence
  - **Blocked By**: None

  **References**:
  - This plan file - task list and evidence policy.
  - `.sisyphus/evidence/` - evidence root convention.

  **Acceptance Criteria**:
  - [ ] Evidence folder exists.
  - [ ] Checklist names Tasks 1-33 and F0.
  - [ ] Final command list captured.

  **QA Scenarios**:
  ```
  Scenario: Evidence scaffolding exists
    Tool: Bash
    Preconditions: Task executed
    Steps:
      1. Run `test -d .sisyphus/evidence/implement-auth-scope-service-slicing`.
      2. Run `test -f .sisyphus/evidence/implement-auth-scope-service-slicing/checklist.md`.
      3. Search checklist for `Task 33` and `/review-work`.
    Expected Result: Evidence folder and checklist exist with full task coverage.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-4-checklist.txt

  Scenario: Missing evidence detection
    Tool: Bash
    Preconditions: Checklist exists
    Steps:
      1. Search checklist for `Evidence:` rows.
      2. Confirm each task has planned evidence path.
    Expected Result: No task lacks evidence path.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-4-evidence-map.txt
  ```

  **Commit**: NO

- [ ] 5. Add canonical role/scope vocabulary module

  **What to do**:
  - Implement canonical role and scope constants/types from `docs/role-scope-matrix.md`.
  - Include global, group, and self scopes.
  - Add tests proving role/scope keys are stable and typo-safe.

  **Must NOT do**:
  - Do not remove existing role strings or booleans.
  - Do not make `viewer` mutating.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: pure auth contract module.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with Tasks 6-10
  - **Blocks**: Tasks 6,11,12,24
  - **Blocked By**: Tasks 1,3

  **References**:
  - `docs/role-scope-matrix.md:23-90` - role and scope catalog.
  - `docs/implementation-guidance-component-auth-service-slicing.md:24-39` - do-first/do-not-do-first guidance.
  - `lib/domain/employee-auth-model.ts` - current coarse role model requiring explicit replacement/wrapper.
  - `lib/authz/authorization-adapter.ts` - current authorization seam.
  - `lib/flags/migration-flags.ts` - existing policy migration flags to reuse/align.

  **Acceptance Criteria**:
  - [ ] Canonical role/scope module exists.
  - [ ] `lib/domain/employee-auth-model.ts` is explicitly wrapped/replaced/migrated; old coarse names are not silently overloaded.
  - [ ] Existing migration flags in `lib/flags/migration-flags.ts` are reused or documented as intentionally extended.
  - [ ] Tests assert expected keys: `super_admin`, `hr_admin`, `scheduler_admin`, `viewer`, `employee`, `service_account`.
  - [ ] Tests assert v1 minimal executable scope set exists and is usable.
  - [ ] Tests assert `viewer` has read scopes only.

  **QA Scenarios**:
  ```
  Scenario: Role/scope constants import and match docs
    Tool: Bash
    Preconditions: Module and tests implemented
    Steps:
      1. Run focused role/scope test command.
      2. Assert tests check all global roles and at least one group/self scope.
    Expected Result: Tests pass and constants match docs.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-5-role-scope-tests.txt

  Scenario: Viewer mutation denied
    Tool: Bash
    Preconditions: Policy test exists
    Steps:
      1. Run test that evaluates `viewer` against `schedule.write.any` and `employee.write.any`.
      2. Assert both return false.
    Expected Result: Viewer has no mutation scope.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-5-viewer-deny.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add canonical role scope vocabulary`

- [ ] 6. Add legacy compatibility projection policy

  **What to do**:
  - Map current sources (`auth_accounts.role_key`, `tb_karyawan_roles.role_key`, `tb_user.privilege`, `tb_user_group_access`) to canonical roles/scopes.
  - Project legacy booleans from canonical scopes during hybrid phase.
  - Document transitional mismatches such as legacy `viewer` behavior.

  **Must NOT do**:
  - Do not trust `tb_user.privilege` as long-term target authority.
  - Do not drop existing booleans from `AuthContext`.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: compatibility logic touches auth policy.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES after Task 5
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 11,12,24
  - **Blocked By**: Tasks 3,5

  **References**:
  - `docs/role-scope-matrix.md` - compatibility mapping and open decisions.
  - `lib/auth-session.ts` - current role/boolean projections.
  - `docs/auth-domain-glossary.md` - auth domain language if present.

  **Acceptance Criteria**:
  - [ ] Compatibility mapper exists and is unit-tested.
  - [ ] Account, NIP, and legacy PIN roles produce expected canonical roles/scopes.
  - [ ] Mapper follows frozen authority precedence from Hybrid Auth Authority Contract.
  - [ ] `tb_user.privilege` is used only as fallback when no canonical assignment exists.
  - [ ] Legacy booleans still projected for existing callers.
  - [ ] Projection matches exact compatibility projection table in Hybrid Auth Authority Contract.

  **QA Scenarios**:
  ```
  Scenario: Legacy account role maps to canonical scopes
    Tool: Bash
    Preconditions: Compatibility mapper tests exist
    Steps:
      1. Run focused compatibility mapper tests.
      2. Assert `auth_accounts.role_key='admin'` maps to `super_admin` and all scopes.
      3. Assert `role_key='viewer'` maps to read-only target scopes.
    Expected Result: Mapping stable and tests pass.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-6-account-map.txt

  Scenario: Legacy PIN privilege remains transitional
    Tool: Bash
    Preconditions: Compatibility mapper tests exist
    Steps:
      1. Run test for `tb_user.privilege >= 4`.
      2. Assert output marks source as legacy/transitional.
      3. Assert raw PIN is not logged in test output.
    Expected Result: Legacy admin fallback works but is labeled transitional.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-6-pin-transitional.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add legacy role compatibility projection`

- [ ] 7. Add canonical auth migration SQL and rollback

  **What to do**:
  - Add forward migration SQL for canonical tables from `docs/auth-canonical-schema-ddl.md`.
  - Add rollback SQL or explicit rollback procedure.
  - Ensure legacy tables remain untouched and readable.
  - Include DB engine assumptions and transaction notes.

  **Must NOT do**:
  - Do not drop/rename legacy tables.
  - Do not apply migration without dry-run/test proof.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: schema artifacts and migration contracts.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 5,6,8-10 after prep
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 8,27
  - **Blocked By**: Tasks 1,2,3

  **References**:
  - `docs/auth-canonical-schema-ddl.md:23-220` - target DDL.
  - Existing migration folder/scripts if present - naming and runner convention.
  - `docs/agent-restrictions.md` - DB/migration restrictions.

  **Acceptance Criteria**:
  - [ ] Forward migration creates `auth_identities`, `auth_subject_links`, `auth_roles`, `auth_scopes`, `auth_role_scopes`, `auth_identity_global_roles`, `auth_identity_group_roles`.
  - [ ] Optional overrides table clearly optional.
  - [ ] Rollback exists and drops only new canonical tables in safe dependency order.
  - [ ] Migration docs say legacy tables remain readable.

  **QA Scenarios**:
  ```
  Scenario: Migration SQL contains canonical tables
    Tool: Bash
    Preconditions: Migration SQL file exists
    Steps:
      1. Search migration file for `CREATE TABLE auth_identities`.
      2. Search for `CREATE TABLE auth_role_scopes` and `CREATE TABLE auth_identity_group_roles`.
      3. Search rollback for `DROP TABLE` in dependency-safe order.
    Expected Result: Forward and rollback SQL cover canonical schema only.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-7-sql-check.txt

  Scenario: Legacy tables untouched
    Tool: Bash
    Preconditions: Migration SQL file exists
    Steps:
      1. Search migration files for `DROP TABLE tb_user`, `ALTER TABLE tb_user`, `DROP TABLE auth_accounts`.
      2. Assert no destructive legacy operations exist.
    Expected Result: No destructive legacy table mutation.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-7-legacy-safe.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add canonical auth migration artifacts`

- [ ] 8. Add backfill, audit, and dry-run scripts

  **What to do**:
  - Add backfill logic from legacy tables to canonical auth tables.
  - Add audit report comparing canonical rows to legacy sources.
  - Add dry-run mode that reports counts without writes.
  - Redact identifiers in logs/output.

  **Must NOT do**:
  - Do not write irreversible data without dry-run mode.
  - Do not log raw password/hash/token/PIN/cookie.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: migration support scripts.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES after Task 7 skeleton exists
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 27
  - **Blocked By**: Tasks 2,7

  **References**:
  - `docs/auth-canonical-schema-ddl.md` - canonical schema.
  - `docs/role-scope-matrix.md` - compatibility mapping.
  - `lib/auth-hardening-helpers.js` - existing masking helper pattern.

  **Acceptance Criteria**:
  - [ ] Backfill supports dry-run.
  - [ ] Audit outputs counts for identities, subject links, global roles, group roles.
  - [ ] Collision report covers account-vs-NIP, duplicate PIN, stale PIN, and untyped legacy ambiguity.
  - [ ] Redaction tests prove no raw identifiers appear.

  **QA Scenarios**:
  ```
  Scenario: Dry-run produces counts without writes
    Tool: Bash
    Preconditions: Script implemented with test fixture or mock DB
    Steps:
      1. Run backfill command with `--dry-run` against fixture/mocked data.
      2. Assert output contains counts for identities and subject links.
      3. Assert no insert/write command executes in dry-run.
    Expected Result: Dry-run reports counts and writes nothing.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-8-dry-run.txt

  Scenario: Audit detects mismatch
    Tool: Bash
    Preconditions: Fixture includes one mismatched legacy/canonical record
    Steps:
      1. Run audit command against fixture/mocked data.
      2. Assert mismatch count is `1`.
      3. Assert identifier is masked.
    Expected Result: Audit flags mismatch without leaking raw identifier.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-8-audit-mismatch.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add canonical auth backfill audit tooling`

- [ ] 9. Add auth fixture matrix and tests

  **What to do**:
  - Create local-only test fixtures for target roles, group roles, and three auth lanes.
  - Add tests for role/scope mapping and compatibility booleans.
  - Include duplicate/collision fixtures: account login equals NIP, orphaned `tb_user`, disabled identity.

  **Must NOT do**:
  - Do not depend on production database.
  - Do not use real personal data.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: fixture-driven regression coverage.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 5-8 after fixture inventory
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 11,12,25
  - **Blocked By**: Tasks 2,5,6

  **References**:
  - `tests/auth-hardening.test.js` - existing node test style.
  - `tests/login-redirect.test.js` - pure helper test style.
  - `docs/role-scope-matrix.md` - expected role/scope outputs.

  **Acceptance Criteria**:
  - [ ] Tests cover all target global roles.
  - [ ] Tests cover all target group roles.
  - [ ] Tests cover account, NIP, and legacy PIN compatibility.

  **QA Scenarios**:
  ```
  Scenario: Role matrix tests pass
    Tool: Bash
    Preconditions: Fixtures and tests implemented
    Steps:
      1. Run focused auth role/scope tests with `node --test --import tsx`.
      2. Assert all role fixtures pass.
    Expected Result: 0 failures.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-9-role-tests.txt

  Scenario: Collision fixture uses deterministic precedence
    Tool: Bash
    Preconditions: Fixture where account login equals NIP exists
    Steps:
      1. Run collision/subject resolution test.
      2. Assert typed subjects (`account:`, `nip:`, `pin:`) resolve by prefix.
      3. Assert untyped legacy fallback behavior is documented and tested.
    Expected Result: No ambiguous typed subject resolution.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-9-collision-test.txt
  ```

  **Commit**: YES
  - Message: `test(auth): cover canonical role scope compatibility`

- [ ] 10. Add auth migration logging/redaction guardrails

  **What to do**:
  - Ensure migration/backfill/audit logs use redacted labels and counts.
  - Add helper reuse or tests for masking identifiers.
  - Add lint/test checks preventing raw `login_id`, `nip`, `pin`, password/hash/token output.

  **Must NOT do**:
  - Do not log raw credentials or session tokens.

  **Recommended Agent Profile**:
  - **Category**: `security`
    - Reason: sensitive logging guardrail.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with other Wave 1 tasks
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 31
  - **Blocked By**: Task 3

  **References**:
  - `lib/auth-hardening-helpers.js` - `maskIdentifier` pattern.
  - `lib/auth-session.ts` - current redaction helper and legacy warning pattern.
  - `docs/implementation-guidance-component-auth-service-slicing.md` - no secret logging constraint.

  **Acceptance Criteria**:
  - [ ] Backfill/audit logs contain counts and masked IDs only.
  - [ ] Tests prove raw identifier input does not appear in output.
  - [ ] Password/hash/token/cookie fields never logged.

  **QA Scenarios**:
  ```
  Scenario: Raw identifier not leaked
    Tool: Bash
    Preconditions: Redaction tests exist
    Steps:
      1. Run redaction test with input `EMP-SECRET-12345`.
      2. Assert stdout/output does not contain `EMP-SECRET-12345`.
      3. Assert output contains masked form or digest only.
    Expected Result: Raw identifier absent.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-10-redaction-test.txt

  Scenario: Secret field log scan
    Tool: Bash
    Preconditions: Migration/backfill code implemented
    Steps:
      1. Search changed migration/backfill files for `console.log` around `password`, `hash`, `token`, `cookie`.
      2. Confirm any logged object explicitly omits or redacts those fields.
    Expected Result: No raw secret logging.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-10-secret-scan.txt
  ```

  **Commit**: YES
  - Message: `fix(auth): redact migration audit output`

- [ ] 11. Add ScopeResolver and AuthorizationSnapshot contract

  **What to do**:
  - Create resolver that outputs canonical `global_roles[]`, `group_roles[]`, `scopes[]`, `groups[]`, and legacy booleans.
  - Support global, group, and self scope checks.
  - Add typed/validated DTO for route guards and future service introspection.

  **Must NOT do**:
  - Do not replace route guards everywhere in this task.
  - Do not remove old fields from session responses.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: core authz contract.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 foundation
  - **Blocks**: Tasks 12-17,24,25
  - **Blocked By**: Tasks 5,6,9

  **References**:
  - `docs/role-scope-matrix.md` - role/scope semantics.
  - `lib/authz/authorization-adapter.ts` - current authz seam.
  - `app/api/auth/me/route.js` - session response contract.

  **Acceptance Criteria**:
  - [ ] Resolver is unit-tested for global/group/self scopes.
  - [ ] AuthorizationSnapshot is stable and documented.
  - [ ] Resolver emits `globalRoles`, `groupRoles`, `scopes`, and `groupIds`.
  - [ ] Legacy boolean projection tested.
  - [ ] Legacy-only resolver lands before canonical-preferred resolver.
  - [ ] Canonical assignments win only when subject link and integrity checks pass.
  - [ ] Failed integrity check falls back to legacy projection with redacted mismatch telemetry.

  **QA Scenarios**:
  ```
  Scenario: Group scope respects group boundary
    Tool: Bash
    Preconditions: ScopeResolver tests exist
    Steps:
      1. Run test with user having `schedule.write.group` for group `10`.
      2. Assert write allowed for group `10`.
      3. Assert write denied for group `11`.
    Expected Result: Group boundary enforced.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-11-group-scope.txt

  Scenario: Legacy boolean projection stable
    Tool: Bash
    Preconditions: ScopeResolver tests exist
    Steps:
      1. Run test for `super_admin` snapshot.
      2. Assert `is_admin=true` during compatibility phase.
      3. Run test for `employee` snapshot and assert admin booleans false.
    Expected Result: Compatibility projection correct.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-11-legacy-booleans.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add authorization snapshot resolver`

- [ ] 12. Add route guard adapter with compatibility fallback

  **What to do**:
  - Add guard helpers for `requireScope`, `canAccessGroup`, `canAccessSelf`, and compatibility fallback.
  - Preserve `unauthorizedResponse()` and `forbiddenResponse()` behavior.
  - Ensure transient errors do not trigger auth redirects.

  **Must NOT do**:
  - Do not convert every route yet.
  - Do not turn 5xx/network failures into login redirects.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: route auth guard foundation.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 foundation
  - **Blocks**: Tasks 13-17,23,24
  - **Blocked By**: Tasks 6,11

  **References**:
  - `app/api/*/route.js` patterns using `getAuthContextFromCookies()`.
  - `lib/auth-session.ts` - current auth context.
  - `docs/route-ownership-matrix.md` - target auth requirements per route family.

  **Acceptance Criteria**:
  - [ ] Guard adapter tests cover 401 vs 403.
  - [ ] Existing unauthorized/forbidden response shape preserved.
  - [ ] Fallback supports legacy booleans in hybrid phase.

  **QA Scenarios**:
  ```
  Scenario: Missing session returns 401
    Tool: Bash
    Preconditions: Guard adapter tests exist
    Steps:
      1. Run test invoking guard with null auth context.
      2. Assert result/status is 401.
    Expected Result: Missing session remains unauthorized, not forbidden.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-12-unauthorized.txt

  Scenario: Insufficient scope returns 403
    Tool: Bash
    Preconditions: Guard adapter tests exist
    Steps:
      1. Run test with authenticated `viewer` requesting write scope.
      2. Assert result/status is 403.
    Expected Result: Authenticated but insufficient scope is forbidden.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-12-forbidden.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add scope route guard adapter`

- [ ] 13. Introduce Identity & Access service-layer boundary

  **What to do**:
  - Move login/session/identity resolution orchestration behind internal service module(s).
  - Keep route handler payloads stable.
  - Keep 3 auth lanes and session cookie behavior unchanged.

  **Must NOT do**:
  - Do not create separate deployed service.
  - Do not remove legacy PIN fallback.

  **Recommended Agent Profile**:
  - **Category**: `refactorer`
    - Reason: behavior-preserving boundary extraction.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 14-17 after Task 12
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 24,25
  - **Blocked By**: Tasks 11,12

  **References**:
  - `app/api/auth/login/route.js` - current login route contract.
  - `app/api/auth/me/route.js` - current me route contract.
  - `lib/auth-session.ts` - session resolution and cookie behavior.
  - `docs/service-extraction-roadmap.md:43-61` - Identity & Access phase.

  **Acceptance Criteria**:
  - [ ] Auth route response snapshots unchanged for both `/api/auth/login` and `/api/auth/me`.
  - [ ] Login response preserves `role_key`, legacy booleans, and `groups`.
  - [ ] Service boundary has no network calls.
  - [ ] Tests cover account, NIP, and PIN login compatibility.

  **QA Scenarios**:
  ```
  Scenario: Login response shape unchanged
    Tool: Bash
    Preconditions: Auth route tests or snapshot tests exist
    Steps:
      1. Run account login fixture test.
      2. Run NIP login fixture test.
      3. Assert both include existing fields plus any additive canonical fields.
    Expected Result: No breaking field removal/rename.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-13-login-shape.txt

  Scenario: No service network extraction
    Tool: Bash
    Preconditions: Identity boundary implemented
    Steps:
      1. Search new identity service files for `fetch(`, `http://`, `https://`.
      2. Confirm no internal network call was introduced.
    Expected Result: Modular monolith only.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-13-no-network.txt
  ```

  **Commit**: YES
  - Message: `refactor(auth): isolate identity access boundary`

- [ ] 14. Assess and isolate Workforce/Users aggregate seams

  **What to do**:
  - Keep `/api/users` as modular-monolith orchestrator.
  - Extract only pure helpers/repositories where behavior-neutral and testable.
  - Define boundaries between Workforce Directory, Identity, machine mirror, and group scope.
  - Write stop-condition note: no broad extraction if transaction coupling remains high.

  **Must NOT do**:
  - Do not split `/api/users` into standalone service.
  - Do not alter transactional behavior without tests.

  **Recommended Agent Profile**:
  - **Category**: `refactorer`
    - Reason: high-risk route boundary work.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 13,15-17
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 22,24,25
  - **Blocked By**: Tasks 11,12

  **References**:
  - `app/api/users/route.js` - current aggregate route.
  - `docs/route-ownership-matrix.md:29` - `/api/users` ownership warning.
  - `docs/service-extraction-roadmap.md:135+` - users aggregate rework later.

  **Acceptance Criteria**:
  - [ ] Boundary assessment exists with extracted safe seams or explicit no-extract reasons.
  - [ ] Any extracted helper has tests.
  - [ ] `/api/users` response and write behavior remain stable.

  **QA Scenarios**:
  ```
  Scenario: Users route contract stable
    Tool: Bash
    Preconditions: Users route tests or fixture checks exist
    Steps:
      1. Run focused users route tests or mock-handler tests.
      2. Assert GET/POST/PUT/DELETE payload shapes match baseline snapshots.
    Expected Result: No unintended contract drift.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-14-users-contract.txt

  Scenario: Stop condition documented
    Tool: Bash
    Preconditions: Boundary note written
    Steps:
      1. Search note for `do not extract`, `transaction`, and `modular monolith`.
      2. Confirm `/api/users` remains route orchestrator.
    Expected Result: No premature service extraction.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-14-stop-condition.txt
  ```

  **Commit**: YES
  - Message: `refactor(users): document and isolate aggregate seams`

- [ ] 15. Introduce Scheduling service/repository boundary

  **What to do**:
  - Isolate schedule/shifts/revisions helpers behind scheduling domain modules.
  - Keep existing API route shapes stable.
  - Use scope guard adapter for schedule read/write/approve checks where feasible.

  **Must NOT do**:
  - Do not change schedule approval semantics without regression tests.

  **Recommended Agent Profile**:
  - **Category**: `refactorer`
    - Reason: behavior-preserving API/domain modularization.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 13,14,16,17
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 19,24,25
  - **Blocked By**: Tasks 11,12

  **References**:
  - `docs/route-ownership-matrix.md:35-41` - scheduling route ownership.
  - `lib/schedule-helpers.js` - current schedule helper seam.
  - `app/api/schedule/route.js`, `app/api/shifts/route.js`, `app/api/schedule-revisions/*` - route families.

  **Acceptance Criteria**:
  - [ ] Scheduling boundary files exist.
  - [ ] Existing schedule route tests pass or new regression tests added.
  - [ ] Scope checks distinguish read/write/approve.

  **QA Scenarios**:
  ```
  Scenario: Schedule read allowed with read scope
    Tool: Bash
    Preconditions: Scheduling guard tests exist
    Steps:
      1. Run test with `schedule.read.group` for matching group.
      2. Assert schedule read allowed.
      3. Assert write denied without `schedule.write.group`.
    Expected Result: Read/write scopes separated.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-15-schedule-scope.txt

  Scenario: Route response stable
    Tool: Bash
    Preconditions: Schedule API tests or snapshots exist
    Steps:
      1. Run focused schedule route tests.
      2. Assert response fields match baseline.
    Expected Result: Refactor preserves route contract.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-15-route-contract.txt
  ```

  **Commit**: YES
  - Message: `refactor(schedule): isolate scheduling domain boundary`

- [ ] 16. Introduce Machine and Scanlog service/repository boundaries

  **What to do**:
  - Isolate Machine Gateway and Scanlog Pipeline modules around existing seams.
  - Preserve SDK bridge, queue, sync, ingest, read-source behavior.
  - Apply scope checks for machine/scanlog read/write/sync where feasible.

  **Must NOT do**:
  - Do not change device integration protocol.
  - Do not extract machine/scanlog to deployed services.

  **Recommended Agent Profile**:
  - **Category**: `refactorer`
    - Reason: integration boundary refactor.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 13-15,17
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 20,24,25
  - **Blocked By**: Tasks 11,12

  **References**:
  - `lib/domain/machine-gateway.ts` - current machine gateway seam.
  - `lib/domain/scanlog-pipeline.ts` - current scanlog pipeline seam.
  - `lib/easylink-sdk-client.js`, `lib/scanlog-read-source.js`, `lib/hop-b-ingest-handler.js` - integration seams.
  - `docs/service-extraction-roadmap.md:62-90` - future extraction phase.

  **Acceptance Criteria**:
  - [ ] Machine and scanlog boundaries compile.
  - [ ] Existing hop-b/scanlog tests pass.
  - [ ] No transient scanlog failures cause login redirect.

  **QA Scenarios**:
  ```
  Scenario: Hop-B and scanlog tests still pass
    Tool: Bash
    Preconditions: Boundary refactor implemented
    Steps:
      1. Run existing hop-b and scanlog-focused tests.
      2. Assert 0 failures, or document pre-existing fixture blocker.
    Expected Result: Pipeline behavior preserved.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-16-scanlog-tests.txt

  Scenario: No internal service network split
    Tool: Bash
    Preconditions: Boundary refactor implemented
    Steps:
      1. Search new machine/scanlog domain files for new internal `fetch` to app routes.
      2. Confirm SDK bridge behavior remains through existing client only.
    Expected Result: Modular monolith boundary only.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-16-no-service-split.txt
  ```

  **Commit**: YES
  - Message: `refactor(ops): isolate machine scanlog boundaries`

- [ ] 17. Introduce Attendance and Reporting boundary seams

  **What to do**:
  - Identify attendance/review/report routes and shared read-model seams.
  - Extract pure mappers/repositories where safe.
  - Apply read/review/export scopes with compatibility fallback.

  **Must NOT do**:
  - Do not rework reporting/export service into separate deployment.
  - Do not alter report data semantics without tests.

  **Recommended Agent Profile**:
  - **Category**: `refactorer`
    - Reason: read-model boundary modularization.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 13-16
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 21,24,25
  - **Blocked By**: Tasks 11,12

  **References**:
  - `docs/route-ownership-matrix.md` - attendance/reporting ownership rows.
  - `lib/attendance-helpers.js` - current helper seam.
  - `app/attendance/page.jsx`, `app/performance/page.jsx`, `app/report/page.jsx` - frontend consumers.

  **Acceptance Criteria**:
  - [ ] Boundary note/module exists for Attendance and Reporting.
  - [ ] Scope tests distinguish read/review/export.
  - [ ] Existing reports/attendance views remain compatible.

  **QA Scenarios**:
  ```
  Scenario: Attendance review scope required
    Tool: Bash
    Preconditions: Scope tests exist
    Steps:
      1. Run test with `attendance.read.group` but no `attendance.review.group`.
      2. Assert read allowed and review action denied.
    Expected Result: Read and review separated.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-17-review-scope.txt

  Scenario: Report export scope required
    Tool: Bash
    Preconditions: Scope tests exist
    Steps:
      1. Run test with `report.read.any` but no `report.export.any`.
      2. Assert report view allowed and export denied.
    Expected Result: Export scope enforced.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-17-export-scope.txt
  ```

  **Commit**: YES
  - Message: `refactor(reporting): isolate attendance reporting boundaries`

- [ ] 18. Split AppShell into frame, auth gate, nav, theme, route effects

  **What to do**:
  - Split `components/app-shell.jsx` into smaller components/modules: `AppShellFrame`, `AppShellAuthGate`, `AppShellNav`, `AppShellThemeController`, `AppShellRouteEffects`.
  - Preserve login-page bypass, theme behavior, sidebar state, and 401-only redirect semantics.
  - Add tests or Playwright checks for nav/auth/theme behavior.

  **Must NOT do**:
  - Do not change visual design beyond preserving behavior.
  - Do not redirect on 429/network/5xx.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: frontend refactor with behavior preservation.
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: useful if layout regressions or navigation surfaces need polishing.

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 19-23
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 23,26,30
  - **Blocked By**: Task 12

  **References**:
  - `components/app-shell.jsx` - current shell behavior.
  - `hooks/use-auth-session.js` - auth cache and 401 status semantics.
  - `docs/implementation-guidance-component-auth-service-slicing.md:66-84` - frontend monolith finding.

  **Acceptance Criteria**:
  - [ ] AppShell file reduced and delegated to named pieces.
  - [ ] Login page bypass preserved.
  - [ ] 401 redirects to `/login?next=...`; transient failures do not.
  - [ ] Theme/sidebar behavior preserved.

  **QA Scenarios**:
  ```
  Scenario: Auth gate redirects only on 401
    Tool: Playwright
    Preconditions: App running with mocked `/api/auth/me` responses
    Steps:
      1. Navigate to `/schedule` with `/api/auth/me` mocked 401.
      2. Assert URL becomes `/login?next=/schedule`.
      3. Navigate to `/schedule` with `/api/auth/me` mocked 500.
      4. Assert URL remains `/schedule` and error UI/toast appears.
    Expected Result: Only confirmed auth failure redirects.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-18-auth-gate.png

  Scenario: Theme/sidebar behavior preserved
    Tool: Playwright
    Preconditions: App running with authenticated fixture
    Steps:
      1. Navigate to `/`.
      2. Toggle sidebar collapse.
      3. Toggle theme control.
      4. Reload page.
      5. Assert sidebar/theme persisted as before.
    Expected Result: Shell UI behavior unchanged.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-18-shell-state.png
  ```

  **Commit**: YES
  - Message: `refactor(ui): split app shell concerns`

- [ ] 19. Split Schedule page into container, hooks, sections, mappers

  **What to do**:
  - Split `app/schedule/page.jsx` into page container, tabs, monthly section, shift templates, revision requests, quick summaries, punch import, hooks, mappers, and permissions.
  - Preserve current tab behavior, filters, summaries, imports, approvals, and exports.
  - Use scheduling boundary and scope adapter where route/UI permissions are evaluated.

  **Must NOT do**:
  - Do not redesign schedule UI.
  - Do not change schedule data semantics.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: frontend domain slicing.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 18,20-23
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 26,30
  - **Blocked By**: Tasks 12,15

  **References**:
  - `app/schedule/page.jsx` - current monolith.
  - `components/schedule/*` - existing presentational components.
  - `lib/schedule-helpers.js` - mapper/helper seam.
  - `docs/implementation-guidance-component-auth-service-slicing.md` - slicing pattern.

  **Acceptance Criteria**:
  - [ ] Schedule page delegates state/data/rendering to named modules.
  - [ ] Existing tabs and actions still work.
  - [ ] Schedule tests/Playwright checks cover read/write/approval visibility.

  **QA Scenarios**:
  ```
  Scenario: Schedule tabs render after split
    Tool: Playwright
    Preconditions: App running with scheduler fixture
    Steps:
      1. Navigate to `/schedule`.
      2. Click monthly tab, shift templates tab, revision requests tab, quick summaries tab.
      3. Assert each tab container appears with expected heading text.
    Expected Result: All schedule sub-surfaces render.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-19-tabs.png

  Scenario: Viewer cannot mutate schedule
    Tool: Playwright
    Preconditions: App running with viewer fixture
    Steps:
      1. Navigate to `/schedule`.
      2. Assert edit/create/approve controls are hidden or disabled.
      3. Attempt direct mutation action if control visible.
    Expected Result: Viewer cannot perform mutation.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-19-viewer-deny.png
  ```

  **Commit**: YES
  - Message: `refactor(schedule): slice schedule page modules`

- [ ] 20. Split Machine page into container, hooks, panels, api, mappers

  **What to do**:
  - Split `app/machine/page.jsx` into machine admin container, status panel, queue panel, sync panel, users panel, hooks, API client, and mappers.
  - Preserve queue orchestration, SDK bridge behavior, polling visibility guard, and admin-only controls.

  **Must NOT do**:
  - Do not change device protocol or SDK routing.
  - Do not introduce interval polling if current behavior avoids it.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: frontend ops page slicing.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 18,19,21-23
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 26,30
  - **Blocked By**: Tasks 12,16

  **References**:
  - `app/machine/page.jsx` - current page.
  - `components/machine/machine-sync-panel.jsx` - existing panel seam.
  - `lib/hooks/use-machine-sync.js` - existing hook seam.
  - `docs/service-extraction-roadmap.md:62-76` - Machine Gateway boundary.

  **Acceptance Criteria**:
  - [ ] Machine page split into modules named by concern.
  - [ ] Queue/status/sync behavior preserved.
  - [ ] Admin-only actions remain gated.

  **QA Scenarios**:
  ```
  Scenario: Machine panels render for admin
    Tool: Playwright
    Preconditions: App running with admin fixture and mocked machine APIs
    Steps:
      1. Navigate to `/machine`.
      2. Assert status panel, queue panel, sync panel, users panel are visible.
      3. Trigger refresh/sync action using existing button selector.
    Expected Result: Panels render and action calls expected endpoint/mock.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-20-admin-panels.png

  Scenario: Non-admin cannot access machine mutation
    Tool: Playwright
    Preconditions: App running with viewer fixture
    Steps:
      1. Navigate to `/machine`.
      2. Assert mutation buttons are hidden/disabled or forbidden UI shown.
      3. Attempt direct button click if visible.
    Expected Result: No machine write action allowed.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-20-viewer-deny.png
  ```

  **Commit**: YES
  - Message: `refactor(machine): slice machine admin page`

- [ ] 21. Split Attendance page into container, hooks, sections, mappers

  **What to do**:
  - Split `app/attendance/page.jsx` into attendance container, filters, summary, table, notes/review sections, hooks, mappers.
  - Preserve attendance filters, note modal, summaries, and authz behavior.
  - Separate read vs review capability in UI.

  **Must NOT do**:
  - Do not change attendance calculation semantics.
  - Do not redirect on transient attendance API failure.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: frontend report/page slicing.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 18-20,22,23
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 26,30
  - **Blocked By**: Tasks 12,17

  **References**:
  - `app/attendance/page.jsx` - current monolith.
  - `components/attendance/*` - existing components.
  - `lib/attendance-helpers.js` - helper seam.

  **Acceptance Criteria**:
  - [ ] Page logic split into named modules.
  - [ ] Existing filters and note modal still work.
  - [ ] Review actions require review scope.

  **QA Scenarios**:
  ```
  Scenario: Attendance filters and table still work
    Tool: Playwright
    Preconditions: App running with authenticated HR fixture and mocked attendance data
    Steps:
      1. Navigate to `/attendance`.
      2. Set date/group filter to known fixture values.
      3. Assert table updates and summary count matches fixture.
    Expected Result: Filtered attendance view stable.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-21-filters.png

  Scenario: Read-only user cannot review
    Tool: Playwright
    Preconditions: App running with viewer fixture
    Steps:
      1. Navigate to `/attendance`.
      2. Assert review/note mutation controls unavailable.
      3. Confirm attendance read view still visible if read scope present.
    Expected Result: Read allowed, review denied.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-21-review-deny.png
  ```

  **Commit**: YES
  - Message: `refactor(attendance): slice attendance page`

- [ ] 22. Split Users page into container, hooks, forms, tables, mappers

  **What to do**:
  - Split `app/users/page.jsx` into page container, query hooks, mutation hooks, user table, form/modal, mappers, permissions.
  - Preserve CRUD behavior and canonical/legacy identity fields.
  - Use users aggregate boundary from Task 14.

  **Must NOT do**:
  - Do not simplify away legacy device mirror fields.
  - Do not change create/update/delete payload shape without tests.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: complex admin UI slicing.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 18-21,23
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 26,30
  - **Blocked By**: Tasks 12,14

  **References**:
  - `app/users/page.jsx` - current users admin page.
  - `app/api/users/route.js` - API contract.
  - `docs/route-ownership-matrix.md:29` - users aggregate warning.

  **Acceptance Criteria**:
  - [ ] Users page split into concern modules.
  - [ ] CRUD payloads unchanged.
  - [ ] Admin/HR permission visibility preserved.

  **QA Scenarios**:
  ```
  Scenario: Users CRUD form preserves payload
    Tool: Playwright
    Preconditions: App running with admin fixture and mocked `/api/users`
    Steps:
      1. Navigate to `/users`.
      2. Open create user form.
      3. Fill `login_id`, employee fields, group role fields with fixture values.
      4. Submit and inspect mocked request body.
    Expected Result: Request body matches pre-refactor contract.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-22-crud-payload.json

  Scenario: Viewer cannot manage users
    Tool: Playwright
    Preconditions: App running with viewer fixture
    Steps:
      1. Navigate to `/users`.
      2. Assert create/edit/delete controls hidden or disabled.
    Expected Result: Viewer cannot mutate users.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-22-viewer-deny.png
  ```

  **Commit**: YES
  - Message: `refactor(users): slice users admin page`

- [ ] 23. Add shared frontend authz and route visibility adapter

  **What to do**:
  - Add frontend helper/hooks for checking canonical scopes while reading legacy compatibility during hybrid phase.
  - Update nav/page visibility checks to use adapter, not scattered booleans where feasible.
  - Preserve current visible nav for equivalent permissions.

  **Must NOT do**:
  - Do not hide routes from users who previously had valid access.
  - Do not add client-only authority that backend does not enforce.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: frontend authz adapter.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES with Wave 3 after Task 12
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 24,26,30
  - **Blocked By**: Tasks 12,18

  **References**:
  - `components/sidebar.jsx` - current nav gating.
  - `hooks/use-auth-session.js` - client session shape.
  - `lib/authz/authorization-adapter.ts` - backend/current authz seam.

  **Acceptance Criteria**:
  - [ ] Frontend authz adapter supports scopes and legacy booleans.
  - [ ] Nav visibility tests cover admin, viewer, employee.
  - [ ] Backend remains source of truth for mutations.

  **QA Scenarios**:
  ```
  Scenario: Nav visibility by scope
    Tool: Playwright
    Preconditions: App running with admin/viewer/employee fixtures
    Steps:
      1. Navigate as admin and record visible nav labels.
      2. Navigate as viewer and record visible nav labels.
      3. Navigate as employee and record visible nav labels.
    Expected Result: Visibility matches compatibility contract and no unauthorized mutation route appears.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-23-nav-matrix.png

  Scenario: Client guard cannot bypass backend
    Tool: Bash
    Preconditions: API guard tests exist
    Steps:
      1. Call protected mutation endpoint with viewer session fixture.
      2. Assert HTTP 403 even if frontend route exists.
    Expected Result: Backend enforces authority.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-23-backend-source.txt
  ```

  **Commit**: YES
  - Message: `feat(ui): add frontend scope visibility adapter`

- [ ] 24. Convert priority API routes to scope checks with compatibility fallback

  **What to do**:
  - Convert representative routes from each domain to `requireScope`/adapter checks.
  - Prioritize auth, users, schedule, machine/scanlog, attendance/reporting routes listed in `docs/route-ownership-matrix.md`.
  - Keep legacy boolean fallback active and documented.

  **Must NOT do**:
  - Do not convert every route if fixtures/contracts are missing.
  - Do not change response shape except auth status where intended.

  **Recommended Agent Profile**:
  - **Category**: `implementation`
    - Reason: route guard migration.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES after Wave 2+3 dependencies
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 25,30
  - **Blocked By**: Tasks 11-17,23

  **References**:
  - `docs/route-ownership-matrix.md` - target route auth requirements.
  - `lib/auth-session.ts` - current auth context.
  - `app/api/**/route.js` - route handlers.

  **Acceptance Criteria**:
  - [ ] At least one route family per major domain uses scope adapter.
  - [ ] 401/403 semantics preserved.
  - [ ] Compatibility fallback documented in code/tests.

  **QA Scenarios**:
  ```
  Scenario: Priority route denies insufficient scope
    Tool: Bash (curl or route test)
    Preconditions: App/test route harness with viewer fixture
    Steps:
      1. Call selected write endpoint with viewer fixture.
      2. Assert status 403 and response shape matches existing forbidden response.
    Expected Result: Insufficient scope denied.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-24-forbidden-route.txt

  Scenario: Legacy admin fallback still works
    Tool: Bash (curl or route test)
    Preconditions: Legacy admin fixture available
    Steps:
      1. Call same endpoint with legacy admin compatibility fixture.
      2. Assert request allowed.
      3. Assert audit/log output marks legacy source redacted.
    Expected Result: Hybrid compatibility preserved.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-24-legacy-allow.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): migrate priority routes to scope checks`

- [ ] 25. Add API regression tests for auth/session/route authorization

  **What to do**:
  - Add tests for login/me/session shape, scope guard outcomes, selected route families.
  - Cover account, NIP, legacy PIN auth lanes.
  - Cover 401, 403, allowed, group mismatch, self scope.

  **Must NOT do**:
  - Do not require human QA.
  - Do not skip legacy PIN fixture.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: API regression coverage.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 26-29 after Task 24
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 30,32
  - **Blocked By**: Task 24

  **References**:
  - `tests/auth-hardening.test.js` - auth helper test style.
  - `tests/verify-plain-password.test.js` - TS import runner pattern.
  - `app/api/auth/login/route.js`, `app/api/auth/me/route.js` - contracts.

  **Acceptance Criteria**:
  - [ ] API tests cover all auth lanes.
  - [ ] Tests cover 401 vs 403.
  - [ ] Tests cover group and self scope decisions.

  **QA Scenarios**:
  ```
  Scenario: Auth lane regression suite passes
    Tool: Bash
    Preconditions: API/route tests implemented
    Steps:
      1. Run auth/session route tests with `node --test --import tsx`.
      2. Assert account, NIP, and legacy PIN fixtures pass.
    Expected Result: 0 failures.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-25-auth-lanes.txt

  Scenario: 401 and 403 distinct
    Tool: Bash
    Preconditions: Route guard tests implemented
    Steps:
      1. Run missing-session test and assert 401.
      2. Run insufficient-scope test and assert 403.
    Expected Result: Unauthorized and forbidden remain distinct.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-25-status-semantics.txt
  ```

  **Commit**: YES
  - Message: `test(auth): cover route authorization regression`

- [ ] 26. Add frontend Playwright regression for navigation and sliced pages

  **What to do**:
  - Add Playwright scenarios for shell, nav, schedule, machine, attendance, users.
  - Mock stable API data or use local fixtures.
  - Capture screenshots and request assertions.

  **Must NOT do**:
  - Do not rely on manual browser checks.
  - Do not test against production environment.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: UI regression suite.
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 25,27-29
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 30,32
  - **Blocked By**: Tasks 18-23

  **References**:
  - `app/schedule/page.jsx`, `app/machine/page.jsx`, `app/attendance/page.jsx`, `app/users/page.jsx` - sliced pages.
  - `components/app-shell.jsx` and split modules - shell behavior.

  **Acceptance Criteria**:
  - [ ] Playwright tests cover authenticated admin, viewer, employee basics.
  - [ ] Screenshots saved for each major page.
  - [ ] Auth redirect only on 401 scenario tested.

  **QA Scenarios**:
  ```
  Scenario: Major pages render with admin fixture
    Tool: Playwright
    Preconditions: App running with mocked authenticated admin session
    Steps:
      1. Navigate to `/schedule`, `/machine`, `/attendance`, `/users`.
      2. Assert each page shows expected top-level heading/container.
      3. Capture screenshot per page.
    Expected Result: All sliced pages render.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-26-admin-pages.png

  Scenario: Viewer nav has no mutation-only routes
    Tool: Playwright
    Preconditions: App running with viewer fixture
    Steps:
      1. Navigate to `/`.
      2. Inspect sidebar/nav labels.
      3. Assert mutation/admin-only links are absent or disabled.
    Expected Result: Viewer sees read-only allowed navigation only.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-26-viewer-nav.png
  ```

  **Commit**: YES
  - Message: `test(ui): add sliced page regression coverage`

- [ ] 27. Verify migration dry-run and rollback

  **What to do**:
  - Run migration dry-run and audit against fixtures or local test DB.
  - Run forward migration then rollback in isolated environment if available.
  - Capture table counts and rollback proof.

  **Must NOT do**:
  - Do not run against production DB.
  - Do not leave test DB dirty.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: DB migration verification.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 25,26,28,29
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 30,33
  - **Blocked By**: Tasks 7,8

  **References**:
  - Migration files from Task 7.
  - Backfill/audit scripts from Task 8.
  - `docs/auth-canonical-schema-ddl.md` - expected tables.

  **Acceptance Criteria**:
  - [ ] Dry-run output captured.
  - [ ] Forward migration creates expected tables in isolated target.
  - [ ] Rollback removes new tables and leaves legacy tables intact.

  **QA Scenarios**:
  ```
  Scenario: Forward migration then rollback
    Tool: Bash
    Preconditions: Isolated test DB or SQL verification harness available
    Steps:
      1. Run forward migration.
      2. Assert canonical tables exist.
      3. Run rollback.
      4. Assert canonical tables gone and legacy tables still exist.
    Expected Result: Migration reversible in isolated environment.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-27-rollback.txt

  Scenario: Dry-run audit no writes
    Tool: Bash
    Preconditions: Backfill/audit script implemented
    Steps:
      1. Run backfill with `--dry-run`.
      2. Capture row counts.
      3. Assert no canonical rows inserted.
    Expected Result: Dry-run is read-only.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-27-dry-run.txt
  ```

  **Commit**: YES
  - Message: `test(db): verify auth migration dry run rollback`

- [ ] 28. Run performance and caching regression checks

  **What to do**:
  - Verify auth session cache/invalidation still works after authz changes.
  - Check large pages do not add duplicate expensive reads/fan-out.
  - Confirm event-driven refresh/manual refresh pattern preserved.

  **Must NOT do**:
  - Do not add interval polling.
  - Do not fan out page reads blindly on mount.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: regression/performance checks.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 25-27,29
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 30,32
  - **Blocked By**: Tasks 18-24

  **References**:
  - `hooks/use-auth-session.js` - auth cache/invalidation semantics.
  - `AGENTS.md` - no blind fan-out/polling default.
  - `components/app-shell.jsx` split modules and page hooks.

  **Acceptance Criteria**:
  - [ ] Auth cache tests still pass.
  - [ ] No new interval polling except documented existing patterns.
  - [ ] Major pages do not duplicate identical request bursts on mount.

  **QA Scenarios**:
  ```
  Scenario: Auth cache invalidation works
    Tool: Bash
    Preconditions: Auth session cache tests exist
    Steps:
      1. Run test for login invalidation event.
      2. Run test for logout/reset invalidation.
      3. Assert stale positive/negative cache bounded by existing TTL or invalidated.
    Expected Result: Cache semantics preserved.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-28-auth-cache.txt

  Scenario: No new interval polling
    Tool: Bash
    Preconditions: Changes complete
    Steps:
      1. Search changed frontend files for `setInterval`.
      2. Confirm any match is pre-existing or explicitly cleaned up/unrefed where applicable.
    Expected Result: No new blind interval polling.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-28-no-polling.txt
  ```

  **Commit**: YES
  - Message: `test(perf): verify auth cache and page request behavior`

- [ ] 29. Update docs, Obsidian/Mermaid artifacts, and multibrain

  **What to do**:
  - Update guidance docs to reflect implementation choices and file paths.
  - Add Mermaid diagrams for target auth flow, role/scope ERD, route ownership, modular monolith boundaries.
  - Update `.multibrain/indexes/agents.md` and context note with final implementation summary.

  **Must NOT do**:
  - Do not let docs claim microservices already extracted.
  - Do not duplicate stale role names.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: documentation and graph artifacts.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 25-28 after implementation shape known
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 33
  - **Blocked By**: Tasks 1-28

  **References**:
  - `docs/implementation-guidance-component-auth-service-slicing.md`
  - `docs/role-scope-matrix.md`
  - `docs/route-ownership-matrix.md`
  - `docs/auth-canonical-schema-ddl.md`
  - `docs/service-extraction-roadmap.md`
  - `.multibrain/indexes/agents.md`

  **Acceptance Criteria**:
  - [ ] Docs reflect actual modules/migrations created.
  - [ ] Mermaid diagrams render in Markdown.
  - [ ] Multibrain index entry added with context pointer if complex.

  **QA Scenarios**:
  ```
  Scenario: Docs mention actual implementation files
    Tool: Bash
    Preconditions: Docs updated
    Steps:
      1. Search docs for canonical role/scope module path.
      2. Search docs for migration file path.
      3. Search docs for route guard adapter path.
    Expected Result: Docs point to implemented files.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-29-doc-paths.txt

  Scenario: Multibrain updated
    Tool: Bash
    Preconditions: Multibrain update done
    Steps:
      1. Search `.multibrain/indexes/agents.md` for `implement-auth-scope-service-slicing`.
      2. If context file referenced, assert it exists.
    Expected Result: Shared memory updated.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-29-multibrain.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): update auth scope implementation guidance`

- [ ] 30. Run end-to-end integration pass across core domains

  **What to do**:
  - Execute agent-driven flow: login → me/session → users → schedule → attendance → scanlog/machine where fixtures allow.
  - Verify route scopes, frontend nav, API guards, and migration artifacts work together.
  - Capture consolidated evidence and blockers.

  **Must NOT do**:
  - Do not require human confirmation.
  - Do not ignore missing fixtures; document blocked scenario precisely.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: cross-domain integration QA.
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: Tasks 31,32
  - **Blocked By**: Tasks 25-29

  **References**:
  - All implemented modules from Tasks 5-29.
  - `docs/route-ownership-matrix.md` - domain coverage map.

  **Acceptance Criteria**:
  - [ ] Cross-domain smoke test report exists.
  - [ ] Admin, viewer, and employee flows covered.
  - [ ] Blockers list exact missing env/fixture if any.

  **QA Scenarios**:
  ```
  Scenario: Admin cross-domain smoke
    Tool: Playwright + Bash
    Preconditions: App running with admin fixture and mocked/stable APIs
    Steps:
      1. Login as admin or mock admin session.
      2. Visit `/users`, `/schedule`, `/attendance`, `/scanlog`, `/machine`.
      3. Assert each page loads and API calls return non-401/non-403.
    Expected Result: Admin flow reaches all core domains.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-30-admin-smoke.md

  Scenario: Viewer restricted smoke
    Tool: Playwright + Bash
    Preconditions: App running with viewer fixture
    Steps:
      1. Login/mock viewer session.
      2. Visit read-allowed pages.
      3. Attempt one mutation API request directly.
      4. Assert UI omits mutation controls and API returns 403.
    Expected Result: Viewer read-only semantics enforced end-to-end.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-30-viewer-smoke.md
  ```

  **Commit**: NO

- [ ] 31. Run security audit fixes before final review

  **What to do**:
  - Audit auth/session, migration logs, route guards, frontend visibility, and DB scripts.
  - Fix any privilege expansion, secret logging, unsafe redirect, or schema rollback issue.
  - Re-run focused tests after fixes.

  **Must NOT do**:
  - Do not ship known high/medium auth vulnerability.
  - Do not rely on client-side authz only.

  **Recommended Agent Profile**:
  - **Category**: `security`
    - Reason: auth/security hardening review.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Task 32 after Task 30
  - **Parallel Group**: Wave 5
  - **Blocks**: F0
  - **Blocked By**: Tasks 10,30

  **References**:
  - `lib/auth-session.ts`, scope resolver, guard adapter, migration/backfill files.
  - `middleware.ts` - CSRF/security headers/rate-limit context.
  - `docs/agent-restrictions.md` - security rules.

  **Acceptance Criteria**:
  - [ ] No raw secret/identifier logging.
  - [ ] 401/403 semantics correct.
  - [ ] Viewer mutation denied.
  - [ ] Rollback/dry-run verified.

  **QA Scenarios**:
  ```
  Scenario: Security grep clean
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Search changed files for raw logging of `password`, `token`, `cookie`, `pin`, `nip`, `login_id`.
      2. Review every match; verify redaction or no logging.
    Expected Result: No raw sensitive logs.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-31-secret-grep.txt

  Scenario: Privilege expansion test
    Tool: Bash
    Preconditions: Authz tests exist
    Steps:
      1. Run tests proving `viewer` cannot mutate.
      2. Run tests proving group-scoped user cannot access different group.
      3. Run tests proving unauthenticated user gets 401.
    Expected Result: No privilege expansion.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-31-privilege-tests.txt
  ```

  **Commit**: YES if fixes needed
  - Message: `fix(security): close auth scope review findings`

- [ ] 32. Run build, lint, typecheck, and full test closure

  **What to do**:
  - Run all required verification commands.
  - Run LSP diagnostics on changed files.
  - Capture exact failures and classify pre-existing vs introduced.

  **Must NOT do**:
  - Do not skip failing tests.
  - Do not mark complete if introduced failures remain.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: final static/build/test closure.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES with Task 31
  - **Parallel Group**: Wave 5
  - **Blocks**: F0
  - **Blocked By**: Tasks 25-30

  **References**:
  - `package.json` scripts.
  - This plan's Verification Strategy.
  - Changed files list from git diff.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` passes.
  - [ ] `npm run lint` passes or only pre-existing warning documented.
  - [ ] `node --test --import tsx tests/*.test.js` passes or pre-existing blocker documented.
  - [ ] `npm run build` passes or DB env blocker proven unrelated.
  - [ ] `lsp_diagnostics` clean on changed files.

  **QA Scenarios**:
  ```
  Scenario: Static checks pass
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run `npm run typecheck`.
      2. Run `npm run lint`.
      3. Capture outputs.
    Expected Result: Typecheck clean; lint clean or pre-existing warning documented.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-32-static.txt

  Scenario: Build/test closure
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. Run `node --test --import tsx tests/*.test.js`.
      2. Run `npm run build`.
      3. Capture exact output.
    Expected Result: Tests/build pass or unrelated pre-existing infra blocker documented with proof.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-32-build-test.txt
  ```

  **Commit**: NO unless fixes required

- [ ] 33. Prepare commit packaging and rollback notes

  **What to do**:
  - Review git diff and group commits logically.
  - Write rollback notes for auth resolver, DB migration, route guard conversion, frontend slicing.
  - Ensure commit messages match strategy.

  **Must NOT do**:
  - Do not commit secrets.
  - Do not squash unrelated changes without user request.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: release/rollback documentation and commit prep.
  - **Skills**: [`git-master`]
    - `git-master`: required for git operations if executor commits.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 final prep
  - **Blocks**: F0
  - **Blocked By**: Tasks 27,29,32

  **References**:
  - This plan's Commit Strategy.
  - Git diff after implementation.
  - Migration rollback files from Task 7.

  **Acceptance Criteria**:
  - [ ] Rollback notes exist.
  - [ ] Commit grouping maps to waves.
  - [ ] No unintended files or secrets in diff.

  **QA Scenarios**:
  ```
  Scenario: Rollback notes complete
    Tool: Bash
    Preconditions: Rollback note written
    Steps:
      1. Search rollback note for `auth resolver`, `migration`, `route guard`, `frontend slicing`.
      2. Confirm each section has revert command or rollback action.
    Expected Result: Rollback guidance complete.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-33-rollback-notes.md

  Scenario: Diff reviewed for secrets
    Tool: Bash
    Preconditions: Git diff available
    Steps:
      1. Run secret-pattern scan over changed files.
      2. Inspect git diff name-only for unintended files.
    Expected Result: No secrets, no unrelated files.
    Evidence: .sisyphus/evidence/implement-auth-scope-service-slicing/task-33-diff-scan.txt
  ```

  **Commit**: YES if committing requested
  - Message: grouped per Commit Strategy

---

## Final Verification Wave

> Significant implementation requires `/review-work`. It launches 5 parallel agents. All must pass.

- [ ] F0. **Run `/review-work` final gate** — `review-work` skill
  - Goal Verifier: confirm all planned deliverables match user request and docs.
  - QA Executor: run all automated and agent-executed UI/API/DB scenarios.
  - Code Reviewer: inspect changed files for maintainability, over-abstraction, AI slop.
  - Security Auditor: verify auth/role/scope changes preserve security, no secret logs, no privilege expansion.
  - Context Miner: compare docs, AGENTS, multibrain, recent commits, and plan for missed constraints.
  - Evidence: `.sisyphus/evidence/implement-auth-scope-service-slicing/final-review-work.md`

---

## Commit Strategy

- Wave 0-1: `feat(auth): add canonical role scope foundation`
- Wave 1 DB: `feat(auth): add canonical auth migration artifacts`
- Wave 2: `refactor(api): introduce domain service boundaries`
- Wave 3 shell/schedule/machine: `refactor(ui): slice shell schedule and machine pages`
- Wave 3 attendance/users: `refactor(ui): slice attendance and users pages`
- Wave 4-5: `test(auth): add integration and migration regression coverage`
- Docs: `docs(architecture): update auth scope and service slicing guidance`

Each commit must run focused tests for touched areas plus typecheck when TS/JS contracts change.

---

## Success Criteria

### Verification Commands
```bash
node --test --import tsx tests/*.test.js
npm run typecheck
npm run lint
npm run build
```

### Final Checklist
- [ ] All auth lanes preserved.
- [ ] No raw secrets or identifiers logged.
- [ ] Canonical roles/scopes tested.
- [ ] Legacy booleans still projected during compatibility phase.
- [ ] Migration has forward, rollback, backfill, audit, dry-run evidence.
- [ ] Route authorization uses scopes with compatibility fallback.
- [ ] Frontend sliced pages preserve visible behavior and navigation.
- [ ] No microservice extraction occurred.
- [ ] Docs and multibrain updated.
- [ ] `/review-work` passes.
