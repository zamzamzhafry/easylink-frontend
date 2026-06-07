# EasyLink Architecture Clean-Slate Migration & Module Parity Plan

## TL;DR

> **Summary**: Migrate to a clean-slate employee-bound auth/data architecture with strict 3-tier access (admin/group leader/employee), machine parity anchored to `easylinkv2.ps1` paging/stream behavior, and user-friendly EN/ID UI with strong dark/light readability.
> **Deliverables**:
>
> - Canonical role-policy matrix + centralized authorization adapter
> - Clean-slate schema, migration orchestrator, compatibility bridge, reconciliation gates
> - Machine module parity cards (including separated danger zone)
> - Foldable admin-only right ops sidebar with lazy/accordion logs
> - Interactive reporting (pie/bar/drilldown) with scoped role payloads and monthly-hours prediction context
> - Frontend EN/ID localization switch and global-CSS-driven readability upgrade
>   **Effort**: XL
>   **Parallel**: YES - 3 waves
>   **Critical Path**: 1 → 3 → 8 → 9 → 10 → 16 → 17

## Execution Resume Note (Current Session)

- Resume order confirmed with user: **close Task 7 acceptance first**, then advance to Tasks 8-10.
- Task 7 closeout focus: rerun smoke/acceptance using supported commands (avoid unsupported `--dry-run` on fixture seed script), capture evidence, and explicitly mark pass/fail criteria.
- After Task 7 closure: start Task 8 as next critical-path gate (employee/auth convergence), then Task 9 (projection contracts), then Task 10 (report payload partitioning).
- Browser QA remains mandatory via combined Chrome DevTools MCP + Next DevTools MCP + Playwright; if blocked by privileges/environment, escalate immediately.

## Context

### Original Request

- User wants pre-refactor baseline preserved, then architecture-level revision with clean DB/data separation, 1:1 employee-auth model, simplified role tiers, better reporting UX, foldable admin ops sidebar, and machine parity with PS1 function set.

### Interview Summary

- **Decided**: migration mode = clean-slate reset.
- **Decided**: machine module = admin-only visibility.
- **Decided**: group leader scope = planning/schedule management + cumulative hours + monthly prediction visibility.
- **Decided**: employee scope = group schedule + cumulative hours + monthly prediction visibility.
- **Decided**: users table remains machine-control domain; 3-tier auth binds to employee domain.
- **Decided**: admin owns punch review/normalization/tagging workflow (late/acceptable/invalid).
- **Decided**: monthly minimum-hours prediction source is config-driven with group override and global fallback.
- **Reference docs**:
  - `docs/learning/easylink-architecture-guide.md`
  - `docs/learning/easylinkv2.ps1` (canonical machine behavior baseline)
  - `docs/learning/devinfo.json`, `docs/learning/scanlog_new.json`, `docs/learning/users.json`

### Metis Review (gaps addressed)

- Guardrails integrated for role drift, migration race conditions, and payload performance regressions.
- Scope locked to 3-tier role model; no role-name sprawl.
- Compatibility bridge + reconciliation gates required before destructive cleanup.

## Work Objectives

### Core Objective

Ship a decision-complete migration plan that removes legacy/v2 scatter and enforces a single policy/data model without operational downtime surprises.

### Deliverables

- Central role-policy contract used by UI + API.
- Clean-slate schema/migration package with rollback.
- 1:1 employee-auth identity + identification-method metadata.
- Unified attendance projection and role-scoped outputs.
- Machine card parity aligned to `easylinkv2.ps1` stream/paging and output artifacts.
- Foldable admin-only right sidebar and log-performance hardening.
- Interactive role-scoped reporting + monthly prediction contracts.
- EN/ID localization layer and global readability/theming uplift.

### Definition of Done (verifiable conditions with commands)

- `npm run typecheck`
- `npm run build`
- Role matrix API verification suite (curl matrix for admin/leader/employee) passes.
- Machine parity suite for approved `easylinkv2.ps1` actions and artifact outputs passes.
- Reconciliation command returns zero unresolved deltas before cutover.
- Playwright suite validates role nav visibility, route guards, and sidebar fold persistence.
- Localization coverage suite validates EN/ID key parity on all primary screens.
- Readability audit validates font-size floor and contrast thresholds in light/dark modes.

### Must Have

- Exactly 3 active tiers: `admin`, `group_leader`, `employee`.
- Admin-only machine module (nav + route + API).
- 3-tier access authority is bound to employee/auth tables; users table is machine-control data only.
- Leader sees planning/schedule management + cumulative + monthly prediction.
- Employee sees group schedule + cumulative + monthly prediction.
- Admin-only punch review/normalization/tagging (late/acceptable/invalid taxonomy).
- Monthly target formula source is config-driven (`group override` → `global fallback`) and must be auditable.
- Large payload handling strategy (chunking/lazy rendering/limits).
- Frontend EN/ID language switch without backend contract translation.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)

- No active policy using `hr/scheduler/viewer` labels after cutover.
- No raw, unbounded JSON rendering in main UI.
- No irreversible production reset without migration gate approval.
- No split authorization logic between UI and API.
- No always-on heavy polling for collapsed/offscreen admin sidebar.
- No dependence on `docs/learning/easylink.ps1` legacy action matrix for execution scope.

## Verification Strategy

> ZERO HUMAN INTERVENTION — all verification is agent-executed.

- Test decision: **tests-after** (targeted API contracts + Playwright UX + migration reconciliation).
- QA policy: every task includes happy + failure scenario.
- Browser/tooling policy: use **combined** Chrome DevTools MCP + Next DevTools MCP + Playwright for browser QA and regression checks.
- Evidence path: `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

## Execution Strategy

### Parallel Execution Waves

Preflight (Task 0): testing toolchain setup (Chrome DevTools MCP + Next DevTools MCP + Playwright baseline).  
Wave 1 (Tasks 1-6): policy foundation, schema, compatibility bridge, cutover controls.  
Wave 2 (Tasks 7-12): identity/data pipeline convergence + machine core parity.  
Wave 3 (Tasks 13-18): admin ops UX, scope partitioning, reporting, performance hardening.

### Dependency Matrix (full, all tasks)

| Task | Depends On     |
| ---- | -------------- |
| 0    | -              |
| 1    | 0              |
| 2    | 1              |
| 3    | 1              |
| 4    | 3              |
| 5    | 1,3            |
| 6    | 1,4,5          |
| 7    | 3,4            |
| 8    | 3,4,7          |
| 9    | 1,5,8          |
| 10   | 8,9            |
| 11   | 7,8,10         |
| 12   | 1,6,7          |
| 13   | 12             |
| 14   | 6              |
| 15   | 1,2,5,9        |
| 16   | 1,9,10         |
| 17   | 10,16          |
| 18   | 11,12,13,14,17 |

### Agent Dispatch Summary (wave → task count → categories)

- Preflight → 1 task → `implementation`, `testing`
- Wave 1 → 6 tasks → `deep`, `implementation`, `security`
- Wave 2 → 6 tasks → `implementation`, `refactorer`, `testing`
- Wave 3 → 6 tasks → `visual-engineering`, `implementation`, `review`

## TODOs

> Implementation + Test = ONE task. Never separate.
> EVERY task includes Agent Profile + Parallelization + QA Scenarios.

- [x] 0. MCP + Browser Testing Toolchain Preflight

  **What to do**: Configure project-level MCP servers for `chrome-devtools-mcp` and `next-devtools-mcp` (root `.mcp.json`), plus Playwright validation baseline; define failure-report protocol for blocked MCP/browser tooling.
  **Must NOT do**: Proceed with downstream implementation tasks until toolchain preflight passes.

  **Recommended Agent Profile**:
  - Category: `implementation` — environment/toolchain setup with test workflow hooks.
  - Skills: [`playwright`] — browser automation baseline verification.
  - Omitted: `security` — no policy mutation in this task.

  **Parallelization**: Can Parallel: NO | Preflight | Blocks: 1-18 | Blocked By: -

  **References**:
  - External: `https://github.com/ChromeDevTools/chrome-devtools-mcp`
  - External: `https://www.npmjs.com/package/next-devtools-mcp`
  - Pattern: `.mcp.json` (root config contract for MCP servers)

  **Acceptance Criteria**:
  - [x] Root `.mcp.json` defines both `chrome-devtools` and `next-devtools` servers using user-approved `npx -y ...@latest` commands.
  - [x] Dry-run invocation confirms both MCP CLIs are executable in project environment.
  - [x] Playwright baseline browser test passes and evidence is stored.
  - [x] Any blocked toolchain step is documented with intervention request path.

  **QA Scenarios**:

  ```
  Scenario: MCP executability smoke
    Tool: Bash
    Steps: Run `npx -y chrome-devtools-mcp@latest --help` and `npx -y next-devtools-mcp@latest --help`.
    Expected: Both commands exit successfully.
    Evidence: .sisyphus/evidence/task-0-mcp-smoke.txt

  Scenario: Browser baseline with combined toolchain
    Tool: Playwright
    Steps: Open key pages and cross-check console/network behavior with MCP-assisted inspection.
    Expected: Core routes load, no blocking console/network failures.
    Evidence: .sisyphus/evidence/task-0-browser-baseline.json
  ```

  **Commit**: YES | Message: `chore(tooling): add mcp browser preflight for project qa` | Files: `.mcp.json`, `package.json`, `docs/**`, `tests/**`

- [x] 1. Canonical 3-Tier Role-Capability Matrix

  **What to do**: Define one source-of-truth policy matrix mapping each protected route/API to admin/group_leader/employee permissions, including explicit legacy-flag mapping.
  **Must NOT do**: Add any fourth role label.

  **Recommended Agent Profile**:
  - Category: `deep` — cross-cutting access design.
  - Skills: `[]`
  - Omitted: `playwright` — not needed here.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2,3,5,9,15,16 | Blocked By: 0

  **References**:
  - `lib/auth-session.ts`
  - `lib/domain/employee-auth-model.ts`
  - `components/sidebar.jsx`
  - `app/api/attendance/route.js`, `app/api/attendance/review/route.js`

  **Acceptance Criteria**:
  - [x] Matrix covers every currently protected route/API.
  - [x] Legacy flags mapped to canonical tiers with deprecation notes.
  - [x] No unresolved role ambiguity remains.

  **QA Scenarios**:

  ```
  Scenario: Complete policy coverage
    Tool: Bash
    Steps: Run policy inventory script and compare against matrix entries.
    Expected: 100% route/API coverage.
    Evidence: .sisyphus/evidence/task-1-policy-coverage.json

  Scenario: Forbidden role labels
    Tool: Grep
    Steps: Search active policy config for hr/scheduler/viewer labels.
    Expected: None found in active decisions.
    Evidence: .sisyphus/evidence/task-1-role-label-audit.txt
  ```

  **Commit**: YES | Message: `refactor(auth): define canonical three-tier policy matrix` | Files: `lib/**`, `docs/**`, `app/**`

- [x] 2. Central Authorization Adapter (UI + API)

  **What to do**: Replace scattered inline role checks with adapter functions consumed by nav rendering and API handlers.
  **Must NOT do**: Keep new inline role checks outside adapter.

  **Recommended Agent Profile**:
  - Category: `refactorer` — mechanical replacement task.
  - Skills: `[]`
  - Omitted: `security-auditor`

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 15,16 | Blocked By: 1

  **References**:
  - `components/sidebar.jsx`
  - `app/api/machine/route.js`
  - `app/api/attendance/raw/route.js`
  - `lib/auth-session.ts`

  **Acceptance Criteria**:
  - [x] UI and API gates call shared adapter.
  - [x] Compatibility mode behavior remains unchanged.
  - [x] No orphan gate logic remains.

  **QA Scenarios**:

  ```
  Scenario: UI gate parity
    Tool: Playwright
    Steps: Login admin/leader/employee and inspect protected nav entries.
    Expected: Visibility matches matrix.
    Evidence: .sisyphus/evidence/task-2-ui-parity.json

  Scenario: API gate parity
    Tool: Bash
    Steps: Role cookie matrix against protected APIs.
    Expected: Status/error matches policy matrix.
    Evidence: .sisyphus/evidence/task-2-api-parity.txt
  ```

  **Commit**: YES | Message: `refactor(auth): centralize authorization adapter` | Files: `lib/**`, `components/**`, `app/api/**`

- [x] 3. Clean-Slate Schema + Compatibility Contracts

  **What to do**: Define schema for 1:1 employee-auth identity, identification method metadata, group ownership, and raw/computed scanlog separation plus compatibility contracts.
  **Must NOT do**: Drop legacy tables in this task.

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: `[]`
  - Omitted: `visual-engineering`

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4,7,8,10 | Blocked By: 1

  **References**:
  - `migration.sql`
  - `migration_v2_auth_and_scanlog.sql`
  - `migration_scanlog_safe_events.sql`
  - `app/api/users/route.js`, `app/api/employees/route.js`

  **Acceptance Criteria**:
  - [x] Schema defines keys/constraints for 1:1 identity.
  - [x] Compatibility contract documented.
  - [x] Roll-forward/rollback SQL exists.

  **QA Scenarios**:

  ```
  Scenario: Migration dry-run
    Tool: Bash
    Steps: Apply migration in isolated DB and run schema assertions.
    Expected: All objects/constraints valid.
    Evidence: .sisyphus/evidence/task-3-dryrun.log

  Scenario: Rollback integrity
    Tool: Bash
    Steps: Execute rollback after dry-run.
    Expected: DB returns to baseline without orphan artifacts.
    Evidence: .sisyphus/evidence/task-3-rollback.log
  ```

  **Commit**: YES | Message: `feat(db): add clean-slate schema contracts` | Files: `migration*.sql`, `docs/**`

- [x] 4. Migration Orchestrator + Seed Fixtures

  **What to do**: Add orchestrator commands (apply/validate/rollback) and seed fixtures for `admin001`, `leader001`, `employee001` plus group/schedule fixtures.
  **Must NOT do**: Execute destructive production reset in this task.

  **Recommended Agent Profile**:
  - Category: `implementation`
  - Skills: `[]`
  - Omitted: `playwright`

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6,7,8 | Blocked By: 3

  **References**:
  - `migration*.sql`
  - `app/api/auth/login/route.js`
  - `lib/auth-session.ts`

  **Acceptance Criteria**:
  - [x] Orchestrator supports apply/validate/rollback.
  - [x] Seed fixtures are deterministic and reusable.
  - [x] Re-running seeds is idempotent.

  **QA Scenarios**:

  ```
  Scenario: Seed idempotency
    Tool: Bash
    Steps: Run seeds twice and compare unique keys/counts.
    Expected: No duplicate conflicts.
    Evidence: .sisyphus/evidence/task-4-seed-idempotent.txt

  Scenario: Fixture login sanity
    Tool: Bash
    Steps: Login all three fixture users.
    Expected: All pass with expected role flags.
    Evidence: .sisyphus/evidence/task-4-fixture-login.json
  ```

  **Commit**: YES | Message: `feat(migration): add orchestrator and seed fixtures` | Files: `scripts/**`, `migration*.sql`, `app/api/auth/**`

- [x] 5. Compatibility Auth Bridge (Legacy → Canonical)

  **What to do**: Add translator from both legacy and NIP contexts to canonical role payload while preserving backward compatibility under flag.
  **Must NOT do**: Remove legacy fallback before reconciliation cutover.

  **Recommended Agent Profile**:
  - Category: `implementation`
  - Skills: `[]`
  - Omitted: `visual-engineering`

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 9,15 | Blocked By: 1,3

  **References**:
  - `lib/auth-session.ts`
  - `app/api/auth/login/route.js`
  - `lib/domain/employee-auth-model.ts`

  **Acceptance Criteria**:
  - [x] Canonical role output for both auth paths.
  - [x] Backward session compatibility retained under flag.
  - [x] Legacy-path telemetry emitted.

  **QA Scenarios**:

  ```
  Scenario: Dual-path canonical output
    Tool: Bash
    Steps: Authenticate legacy-backed and nip-backed accounts.
    Expected: Canonical output shape is identical.
    Evidence: .sisyphus/evidence/task-5-dual-path.json

  Scenario: Legacy fallback off
    Tool: Bash
    Steps: Disable fallback flag and replay old session.
    Expected: Controlled unauthorized response.
    Evidence: .sisyphus/evidence/task-5-fallback-off.txt
  ```

  **Commit**: YES | Message: `feat(auth): add compatibility bridge to canonical roles` | Files: `lib/auth-session.ts`, `app/api/auth/**`, `lib/domain/**`

- [x] 6. Feature Flags, Cutover Gates, Rollback Hooks

  **What to do**: Add explicit flags for policy source, data source cutover, machine parity exposure, and reporting mode with gate/rollback docs.
  **Must NOT do**: Enable irreversible modes by default.

  **Recommended Agent Profile**:
  - Category: `security`
  - Skills: `[]`
  - Omitted: `tester`

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 12,14,17 | Blocked By: 1,4,5

  **References**:
  - `components/app-shell.jsx`
  - `components/right-ops-sidebar.jsx`
  - `app/api/scanlog/sync/route.js`

  **Acceptance Criteria**:
  - [x] All migration switches controlled by explicit flags.
  - [x] Each flag has entry/exit + rollback criteria.
  - [x] Rollout checklist is documented.

  **QA Scenarios**:

  ```
  Scenario: Flag toggling smoke
    Tool: Bash
    Steps: Toggle each flag in test env and run smoke checks.
    Expected: No crash; expected behavior mode applied.
    Evidence: .sisyphus/evidence/task-6-flag-smoke.txt

  Scenario: Rollback execution
    Tool: Bash
    Steps: Trigger one-phase rollback simulation.
    Expected: Service returns to previous stable mode.
    Evidence: .sisyphus/evidence/task-6-rollback.log
  ```

  **Commit**: YES | Message: `chore(release): add cutover flags and rollback gates` | Files: `app/**`, `lib/**`, `docs/**`

- [x] 7. Separate Machine User Polling Retrieval from DB Persistence

  **What to do**: Implement staged user-ingestion pipeline: stream fetch/chunk → raw staging → validation → idempotent upsert worker.
  **Must NOT do**: Persist unvalidated payload blobs directly to domain tables.

  **Recommended Agent Profile**:
  - Category: `implementation`
  - Skills: `[]`
  - Omitted: `visual-engineering`

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8,11,12,18 | Blocked By: 3,4

  **References**:
  - `app/api/machine/route.js`
  - `lib/easylink-sdk-client.js`
  - `docs/learning/users.json`
  - `docs/learning/easylinkv2.ps1`

  **Acceptance Criteria**:
  - [x] Chunk progress checkpoints and partial artifacts (`users.partial.json` equivalent) persisted.
  - [x] Malformed chunk isolation without total-job failure.
  - [x] Upsert is idempotent on replay.

  **QA Scenarios**:

  ```
  Scenario: Large users payload replay
    Tool: Bash
    Steps: Replay large fixture with chunk mode.
    Expected: Complete ingestion with checkpoint trail.
    Evidence: .sisyphus/evidence/task-7-large-replay.json

  Scenario: Corrupt chunk handling
    Tool: Bash
    Steps: Inject malformed middle chunk.
    Expected: Chunk rejected/logged; pipeline continues.
    Evidence: .sisyphus/evidence/task-7-corrupt-chunk.log
  ```

  **Commit**: YES | Message: `refactor(machine): stage user polling pipeline before persistence` | Files: `app/api/machine/**`, `lib/**`, `scripts/**`

- [x] 8. Enforce 1:1 Employee-Auth Identity + Identification Method

  **What to do**: Migrate to strict one-to-one employee-auth identity and add identification method fields; move password/privilege authority to employee-auth model.
  **Must NOT do**: Keep legacy `tb_user` privilege/password as live authority after cutover.

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: `[]`
  - Omitted: `quick`

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 9,10,16 | Blocked By: 3,4,7

  **References**:
  - `app/api/users/route.js`
  - `app/api/employees/route.js`
  - `app/api/auth/login/route.js`
  - `lib/domain/employee-auth-model.ts`

  **Acceptance Criteria**:
  - [x] DB-level uniqueness enforces 1:1 identity.
  - [x] Identification method values migrated and validated.
  - [x] Auth authority moved from legacy user table.

  **QA Scenarios**:

  ```
  Scenario: 1:1 constraint test
    Tool: Bash
    Steps: Attempt duplicate auth identity for one employee.
    Expected: Constraint violation blocks write.
    Evidence: .sisyphus/evidence/task-8-constraint.txt

  Scenario: Method migration audit
    Tool: Bash
    Steps: Run migration audit query over sample records.
    Expected: Identification methods populated and valid.
    Evidence: .sisyphus/evidence/task-8-method-audit.csv
  ```

  **Commit**: YES | Message: `feat(identity): enforce one-to-one employee auth model` | Files: `migration*.sql`, `app/api/**`, `lib/**`

- [x] 9. Standardize Login/Session Contracts to Canonical Identity

  **What to do**: Normalize login/session around NIP/employee-series string and canonical role payload; retain old decode path behind compatibility flag only.
  **Must NOT do**: Break active session flows during staged rollout.

  **Recommended Agent Profile**:
  - Category: `implementation`
  - Skills: `[]`
  - Omitted: `visual-engineering`

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 15,16 | Blocked By: 1,5,8

  **References**:
  - `app/api/auth/login/route.js`
  - `lib/auth-session.ts`
  - `app/login/page.jsx`

  **Acceptance Criteria**:
  - [x] String identity login contract accepted and validated.
  - [x] Session payload emits canonical roles only.
  - [x] Legacy decode path controlled by flag.

  **QA Scenarios**:

  ```
  Scenario: Role session matrix
    Tool: Bash
    Steps: Login admin/leader/employee and fetch `/api/auth/me`.
    Expected: Canonical role fields correct per fixture.
    Evidence: .sisyphus/evidence/task-9-session-matrix.json

  Scenario: Legacy cookie block
    Tool: Bash
    Steps: Disable compatibility and send old cookie format.
    Expected: Unauthorized response, no crash.
    Evidence: .sisyphus/evidence/task-9-legacy-cookie.txt
  ```

  **Commit**: YES | Message: `refactor(auth): canonicalize login and session contracts` | Files: `app/api/auth/**`, `lib/auth-session.ts`, `app/login/**`

- [x] 10. Unified Attendance/Review Projection with Admin Tagging + Monthly Prediction Inputs

  **What to do**: Rebuild attendance/review read path from unified projection; enforce admin-only punch review/normalization/tagging workflow (late/acceptable/invalid) and expose role-scoped schedule+cumulative+monthly prediction outputs.
  **Must NOT do**: Leak admin punch-review controls or discipline detail operations to leader/employee outputs.

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: `[]`
  - Omitted: `quick`

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 16,17 | Blocked By: 8,9

  **References**:
  - `app/api/attendance/route.js`
  - `app/api/attendance/review/route.js`
  - `lib/domain/attendance-read-model.ts`
  - `docs/learning/easylink-architecture-guide.md`

  **Acceptance Criteria**:
  - [x] Unified projection backs attendance/review.
  - [x] Leader payload includes schedule management context + cumulative + monthly prediction visibility (no admin review controls).
  - [x] Employee payload includes group schedule + cumulative + monthly prediction visibility only.
  - [x] Admin-only endpoints support punch status tagging taxonomy (`late`, `acceptable`, `invalid`) with audit fields.
  - [x] Monthly prediction uses config-driven target source with deterministic precedence (group override then global fallback).

  **QA Scenarios**:

  ```
  Scenario: Scoped payload + tagging audit
    Tool: Bash
    Steps: Call attendance/review APIs using each role cookie.
    Expected: Field visibility matches policy matrix and tagging controls are admin-only.
    Evidence: .sisyphus/evidence/task-10-scope-audit.json

  Scenario: Projection dependency failure
    Tool: Bash
    Steps: Simulate missing projection artifact and hit endpoint.
    Expected: Controlled error with explicit code.
    Evidence: .sisyphus/evidence/task-10-projection-failure.log
  ```

  **Commit**: YES | Message: `feat(attendance): unify projection and enforce role-scoped outputs` | Files: `app/api/attendance/**`, `lib/domain/**`, `migration*.sql`

- [x] 11. Deterministic Safe/Legacy Reconciliation Service

  **What to do**: Build reconciliation job for safe events vs target projection/legacy outputs with replay and cutover delta gates.
  **Must NOT do**: Remove compatibility merge before sustained zero-delta window.

  **Recommended Agent Profile**:
  - Category: `testing`
  - Skills: `[]`
  - Omitted: `visual-engineering`

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 18 | Blocked By: 7,8,10

  **References**:
  - `app/api/scanlog/sync/route.js`
  - `app/api/scanlog/route.js`
  - `app/api/scanlog/stream/route.js`

  **Acceptance Criteria**:
  - [x] Reconciliation produces deterministic delta report. Evidence: `.sisyphus/evidence/task-11-reconcile.json`
  - [x] Replay resolves known deltas idempotently. Evidence: `.sisyphus/evidence/task-11-replay.json`
  - [x] Cutover blocked when deltas above threshold. Evidence: `.sisyphus/evidence/task-11-gate-block.txt`

  **QA Scenarios**:

  ```
  Scenario: Delta replay
    Tool: Bash
    Steps: Seed mismatch, run reconcile + replay.
    Expected: Delta drops from >0 to 0.
    Evidence: .sisyphus/evidence/task-11-reconcile.json

  Scenario: Gate block on unresolved deltas
    Tool: Bash
    Steps: Force unresolved delta and run cutover check.
    Expected: Cutover command fails with gate reason.
    Evidence: .sisyphus/evidence/task-11-gate-block.txt
  ```

  **Commit**: YES | Message: `feat(scanlog): add reconciliation and cutover delta gates` | Files: `app/api/scanlog/**`, `scripts/**`, `docs/**`

- [x] 12. Machine Core Parity Cards (`easylinkv2.ps1` Set)

  **What to do**: Split machine UI into capability cards aligned to `easylinkv2.ps1`: Device Info, Scanlog New (from/to/limit), and Stream Users paging with delay/partial-save semantics + explicit output artifact views (`devinfo`, `scanlog_new`, `users_partial`, `users`).
  **Must NOT do**: Depend on deprecated `easylink.ps1` menu matrix for parity scope.

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `[]`
  - Omitted: `security`

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13,18 | Blocked By: 1,6,7

  **References**:
  - `app/machine/page.jsx`
  - `app/api/machine/route.js`
  - `docs/learning/easylinkv2.ps1`
  - `docs/learning/devinfo.json`, `docs/learning/scanlog_new.json`, `docs/learning/users.json`

  **Acceptance Criteria**:
  - [x] One card per approved `easylinkv2.ps1` function.
  - [x] Card actions map one-to-one to API handlers.
  - [x] Streaming user paging exposes progress + partial-save checkpoints + bounded queue behavior.

  **QA Scenarios**:

  ```
  Scenario: v2 parity execution
    Tool: Playwright
    Steps: As admin, run each card action once.
    Expected: Correct queued/running/success transitions and result payload type.
    Evidence: .sisyphus/evidence/task-12-parity-flow.json

  Scenario: Unknown action rejection
    Tool: Bash
    Steps: POST unsupported action to machine API.
    Expected: 400 with supported_actions response.
    Evidence: .sisyphus/evidence/task-12-unknown-action.txt
  ```

  **Commit**: YES | Message: `feat(machine): implement easylinkv2 parity cards and stream artifacts` | Files: `app/machine/**`, `components/**`, `app/api/machine/**`

- [x] 13. Admin Punch Review, Normalization, and Tagging Workflow

  **What to do**: Build dedicated admin workflow for punch review actions: normalize working hour decisions, assign tag status (`late`, `acceptable`, `invalid`), capture reason, and persist immutable audit trail.
  **Must NOT do**: Allow non-admin users to mutate punch review/tagging state.

  **Recommended Agent Profile**:
  - Category: `security`
  - Skills: `[]`
  - Omitted: `quick`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 18 | Blocked By: 10,12

  **References**:
  - `app/api/attendance/review/route.js`
  - `app/api/attendance/route.js`
  - `app/attendance/review/page.jsx`

  **Acceptance Criteria**:
  - [x] Admin can set/modify review normalization and tagging fields with reason notes.
  - [x] Audit metadata persisted for every tagging/normalization mutation.
  - [x] Non-admin review mutation requests always forbidden.

  **QA Scenarios**:

  ```
  Scenario: Admin tagging mutation flow
    Tool: Playwright
    Steps: As admin update punch record to `acceptable` with reason and normalized hour override.
    Expected: Mutation accepted, audit trail recorded, derived status recomputed.
    Evidence: .sisyphus/evidence/task-13-admin-tagging.json

  Scenario: Non-admin mutation forbidden
    Tool: Bash
    Steps: Invoke review-mutation endpoint with leader/employee cookies.
    Expected: HTTP 403.
    Evidence: .sisyphus/evidence/task-13-review-mutation-forbidden.txt
  ```

  **Commit**: YES | Message: `feat(attendance): add admin-only punch normalization and tagging workflow` | Files: `app/attendance/**`, `app/api/attendance/**`, `docs/**`

- [x] 14. Foldable Admin Right Sidebar + Lazy Accordion Logs

  **What to do**: Add right-fold state, persisted preference, and lazy log expansion; pause heavy refresh while collapsed; implement one-shot table remount fallback driven by `themeVersion/themeEpoch` only when post-toggle stale-style detection fails.
  **Must NOT do**: Render full queue logs while collapsed or trigger repeated remount loops on every theme toggle.

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `[]`
  - Omitted: `security`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 18 | Blocked By: 6

  **References**:
  - `components/right-ops-sidebar.jsx`
  - `components/app-shell.jsx`
  - `app/api/scanlog/stream/route.js`

  **Acceptance Criteria**:
  - [x] Sidebar folds/unfolds and state persists.
  - [x] Collapsed mode suppresses heavy polling.
  - [x] Accordion loads details on demand.
  - [x] Theme source-of-truth remains root-level class/token state (no component-local color authority drift).
  - [x] Table fallback remount runs at most once per failed toggle check and logs fallback event.

  **QA Scenarios**:

  ```
  Scenario: Fold persistence
    Tool: Playwright
    Steps: Collapse sidebar, reload, verify state.
    Expected: Collapsed state restored.
    Evidence: .sisyphus/evidence/task-14-fold-persist.json

  Scenario: Collapsed network budget
    Tool: Playwright
    Steps: Capture 30s network while collapsed.
    Expected: Sidebar endpoints reduced to minimal heartbeat/pause policy.
    Evidence: .sisyphus/evidence/task-14-network.har

  Scenario: Theme stale-render fallback
    Tool: Playwright
    Steps: Toggle dark/light repeatedly on table-heavy pages; inspect computed table colors and remount fallback counter.
    Expected: Correct theme colors after toggle; fallback remount only when stale detection triggers and never loops.
    Evidence: .sisyphus/evidence/task-14-theme-fallback.json
  ```

  **Commit**: YES | Message: `feat(layout): add foldable admin ops sidebar with lazy logs` | Files: `components/right-ops-sidebar.jsx`, `components/app-shell.jsx`, `app/globals.css`

- [x] 15. Enforce Admin-Only Machine Module End-to-End

  **What to do**: Ensure nav, route access, and APIs all enforce admin-only machine module behavior.
  **Must NOT do**: Depend on UI-only hiding without backend enforcement.

  **Recommended Agent Profile**:
  - Category: `security`
  - Skills: `[]`
  - Omitted: `visual-engineering`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: - | Blocked By: 1,2,5,9

  **References**:
  - `components/sidebar.jsx`
  - `app/machine/page.jsx`
  - `app/api/machine/route.js`

  **Acceptance Criteria**:
  - [x] Non-admin users cannot see machine nav entry.
  - [x] Non-admin route access to `/machine` is blocked/redirected.
  - [x] Non-admin machine API calls return 403 consistently.

  **QA Scenarios**:

  ```
  Scenario: Route + nav enforcement
    Tool: Playwright
    Steps: Login leader/employee and attempt /machine access.
    Expected: Access blocked and nav hidden.
    Evidence: .sisyphus/evidence/task-15-route-nav.json

  Scenario: API enforcement
    Tool: Bash
    Steps: GET/POST machine API with non-admin cookies.
    Expected: All 403.
    Evidence: .sisyphus/evidence/task-15-api-403.txt
  ```

  **Commit**: YES | Message: `fix(auth): enforce machine module admin-only end-to-end` | Files: `components/sidebar.jsx`, `app/machine/**`, `app/api/machine/**`

- [x] 16. Leader/Employee Scope Partition Implementation

  **What to do**: Implement role-specific views: leader gets elevated planning/schedule management for current + upcoming month with cumulative and monthly prediction panels; employee gets group schedule + cumulative + monthly prediction views.
  **Must NOT do**: Expose discipline/review queues to non-admin roles.

  **Recommended Agent Profile**:
  - Category: `implementation`
  - Skills: `[]`
  - Omitted: `security`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 17 | Blocked By: 1,9,10

  **References**:
  - `app/attendance/page.jsx`
  - `app/api/attendance/route.js`
  - `app/api/attendance/review/route.js`
  - `components/sidebar.jsx`

  **Acceptance Criteria**:
  - [ ] Leader scope contains planning/schedule management plus cumulative + monthly prediction.
  - [ ] Employee scope contains group schedule + cumulative + monthly prediction.
  - [ ] Discipline/review details hidden for non-admin.

  **QA Scenarios**:

  ```
  Scenario: Leader scope
    Tool: Playwright
    Steps: Login leader and inspect modules/data fields.
    Expected: Planning/schedule management + prediction visible, discipline/review mutation controls absent.
    Evidence: .sisyphus/evidence/task-16-leader.json

  Scenario: Employee scope
    Tool: Playwright
    Steps: Login employee and inspect modules/data fields.
    Expected: Group schedule + cumulative + prediction visible, admin review controls absent.
    Evidence: .sisyphus/evidence/task-16-employee.json
  ```

  **Commit**: YES | Message: `feat(scope): implement leader and employee scope partition` | Files: `app/attendance/**`, `app/page.jsx`, `components/**`, `app/api/**`

- [x] 17. Interactive Reporting Upgrade (Pie/Bar/Drilldown)

  **What to do**: Build interactive chart workflows (pie/bar/drilldown) with monthly minimum-hours prediction overlays and role-scoped reporting contracts.
  **Must NOT do**: Query raw high-volume logs directly for chart endpoints.

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `[]`
  - Omitted: `security`

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 18 | Blocked By: 10,16

  **References**:
  - `app/attendance/page.jsx`
  - `app/api/attendance/route.js`
  - `docs/learning/easylink-architecture-guide.md`

  **Acceptance Criteria**:
  - [ ] Pie/bar charts support click drilldown and monthly target/prediction overlays.
  - [ ] Role-scoped reporting payloads are enforced.
  - [ ] Drilldown endpoints are bounded and paginated.
  - [ ] Chart target lines/bands read from config-driven monthly target source with visible source attribution.

  **QA Scenarios**:

  ```
  Scenario: Drilldown interaction
    Tool: Playwright
    Steps: Click chart segments and validate filtered detail panels.
    Expected: Deterministic filter propagation to list/KPI.
    Evidence: .sisyphus/evidence/task-17-report-ui.json

  Scenario: Role payload scope
    Tool: Bash
    Steps: Compare reporting payload fields across roles.
    Expected: Non-admin excludes discipline detail fields.
    Evidence: .sisyphus/evidence/task-17-api-contract.json
  ```

  **Commit**: YES | Message: `feat(reporting): add interactive charts with monthly prediction overlays` | Files: `app/attendance/**`, `components/**`, `app/api/**`

- [x] 18. Performance, Localization, and Readability Hardening

  **What to do**: Enforce payload budgets, chunking, lazy parsing, selective rendering, and list virtualization while introducing frontend EN/ID localization switch plus global-CSS readability uplift (font-size floor, contrast-safe dark/light palette, clearer icon usage). Light mode must use slightly off-white surfaces (not pure `#FFFFFF`) and avoid low-contrast gray body text. Implement global reusable component classes in `app/globals.css` (e.g., `.panel-card`, `.table-shell`, `.table-head-cell`, `.table-cell`, `.control-input`, `.control-select`, `.pill-button`, `.btn-action`, `.btn-outline`, `.btn-danger`) to minimize per-page Tailwind churn.
  **Must NOT do**: Render full template-heavy payloads at initial page paint or ship untranslated hardcoded strings in revised primary screens.

  **Recommended Agent Profile**:
  - Category: `review`
  - Skills: `[]`
  - Omitted: `quick`

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: Final verification | Blocked By: 11,12,13,14,17

  **References**:
  - `components/right-ops-sidebar.jsx`
  - `app/machine/page.jsx`
  - `components/attendance/attendance-table.jsx`
  - `components/employees/employees-table.jsx`
  - `components/attendance/attendance-filters.jsx`
  - `components/groups/groups-list.jsx`
  - `components/attendance/note-modal.jsx`
  - `app/attendance/page.jsx`
  - `docs/learning/users.json`
  - `docs/learning/easylinkv2.ps1`

  **Acceptance Criteria**:
  - [ ] Payload budget policy enforced by API responses.
  - [ ] Large list/log rendering uses incremental/virtualized strategy.
  - [ ] EN/ID localization coverage meets required screen/key thresholds.
  - [ ] Readability standards (contrast + minimum font-size) pass in light and dark mode.
  - [ ] Light theme text tokens avoid gray-on-light primary text and meet contrast threshold for table/body text.
  - [ ] Light background token uses slightly off-white value for readability comfort.
  - [ ] Key table/filter/button/select surfaces consume global semantic classes instead of repeated page-level utility chains.
  - [ ] p95 latency/frame-budget targets meet defined thresholds.

  **QA Scenarios**:

  ```
  Scenario: Large payload stress
    Tool: Bash
    Steps: Replay bloated users fixture through machine/reporting paths.
    Expected: No timeout/OOM; bounded responses.
    Evidence: .sisyphus/evidence/task-18-stress.log

  Scenario: Log-heavy UI responsiveness
    Tool: Playwright
    Steps: Load admin ops with high queue volume and expand selected logs.
    Expected: UI remains responsive within frame budget.
    Evidence: .sisyphus/evidence/task-18-ui-perf.json

  Scenario: Localization and readability compliance
    Tool: Playwright
    Steps: Toggle EN/ID locale and dark/light theme across key screens (login, attendance, machine, sidebar), run visual/readability assertions, and validate table/body contrast tokens.
    Expected: UI strings switch correctly, text remains readable, contrast and font-size thresholds pass, and no grayish low-contrast primary text appears in light mode.
    Evidence: .sisyphus/evidence/task-18-i18n-readability.json
  ```

  **Commit**: YES | Message: `feat(ui): add en-id localization and readability-safe theme hardening` | Files: `components/**`, `app/**`, `app/globals.css`, `lib/**`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

Canonical evidence files:

- F1: `.sisyphus/evidence/F1-plan-compliance-audit.md`
- F2: `.sisyphus/evidence/F2-code-quality-review.md`
- F3: `.sisyphus/evidence/F3-real-manual-qa.md`
- F4: `.sisyphus/evidence/F4-scope-fidelity-check.md`

## Commit Strategy

- User creates pre-refactor baseline commit/tag before execution starts.
- Commit each task (or tightly coupled max-2-task batch) with why-focused message.
- Require wave-end checkpoint commits with migration-state and rollback note.

## Success Criteria

- Single authorization policy surface drives UI + API decisions.
- Clean-slate migration is repeatable, reversible, and reconciliation-gated.
- Machine module achieves approved `easylinkv2.ps1` parity list and artifact semantics under admin-only controls.
- Leader/employee scope boundaries match requested business intent.
- Right sidebar is foldable, admin-only, and performance-safe.
- Reporting is interactive (pie/bar/drilldown), role-scoped, and includes monthly prediction overlays.
- UI supports EN/ID switching and readability-safe light/dark presentation.
