# Demo EasyLink Post-UAT Safe Cleanup

## TL;DR
> **Summary**: Safely retire unnecessary legacy DB tables/columns after UAT using delayed-drop policy with zero-data-loss guardrails.
> **Deliverables**:
> - Dependency-complete cleanup matrix (keep/bridge/deprecate/drop)
> - Executable pre-drop gates (code + DB object + workload checks)
> - Rollback-ready migration runbook (rename quarantine first, hard drop later)
> - Evidence pack proving parity and no hidden consumers
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Inventory & dependency proof -> compatibility/parity window -> quarantine rename -> delayed hard drop

## Context
### Original Request
User provided clean export (`docs/learning/demo_easylink clean structure export.md`) plus real-data tables and requested safe migration/cleanup while preserving data.

### Interview Summary
- Safety is non-negotiable.
- Cleanup policy chosen: **Delayed Drop**.
- Plan placement chosen: **Separate post-UAT plan**.
- Real-data tables in scope: `scanlog_events`, `tb_scanlog`, `tb_template`, `tb_schedule`, `tb_scanlog_safe_events`, `tb_user`, `tb_karyawan`, `tb_employee_group`, `tb_group`.

### Metis Review (gaps addressed)
- Do not equate "no app references" with safe drop; include external consumer evidence gates.
- Add explicit No-Go criteria and dependency-zero gates before each destructive step.
- Treat rollback as first-class; DDL rollback needs tested compensating strategy.
- Separate cutover and physical drop phases.

### Oracle Review (architecture guardrails)
- Require three-source dependency proof (code, DB objects, external jobs).
- Use two-stage retire: quarantine rename first (reversible), hard drop later.
- Enforce telemetry soak window; any access resets readiness.

## Work Objectives
### Core Objective
Produce a decision-complete, execution-ready post-UAT cleanup plan that removes only truly unused schema objects without data loss or runtime regressions.

### Deliverables
1. Canonical-vs-legacy object matrix with lifecycle state per object.
2. SQL gate suite for FK/view/routine/trigger/event dependency checks.
3. Workload parity/usage verification suite with pass/fail thresholds.
4. Quarantine + delayed-drop migration scripts and rollback scripts.
5. Evidence bundle under `.sisyphus/evidence/` for each gate.

### Definition of Done (verifiable conditions with commands)
- `npm run typecheck` exits 0
- `npm run build` exits 0
- Dependency queries return zero blockers for each scheduled drop object
- Parity and critical API checks pass during soak window
- Quarantine stage reversible by tested rollback script
- Delayed-drop execution only for objects with zero-usage evidence and all automated gates green

### Must Have
- Backup + restore drill evidence before any destructive DDL
- Object-by-object lifecycle states: active -> deprecated(read-only) -> quarantined -> dropped
- External consumer inventory and zero-hit evidence gate
- Explicit No-Go criteria that block execution automatically

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No immediate hard drops in same wave as first cutover
- No destructive DDL without dependency-zero proofs
- No schema cleanup mixed with unrelated feature work
- No assumptions based on code grep alone

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after (repo-native typecheck/build + SQL/API gate suite)
- QA policy: Every task includes executable happy + failure scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Shared dependency extraction first for maximal parallelism.

Wave 1: Inventory + dependency census + safety baselines
Wave 2: Compatibility/parity validation + no-new-legacy guardrails
Wave 3: Quarantine rename + soak monitoring + rollback drills
Wave 4: Delayed-drop execution for eligible objects + post-drop audits

### Dependency Matrix (full, all tasks)
- Wave 1 tasks block all later waves.
- Wave 2 requires complete inventory and baseline.
- Wave 3 requires parity pass and external-consumer zero-hit evidence.
- Wave 4 requires quarantine soak pass and zero-usage evidence.

### Agent Dispatch Summary (wave -> task count -> categories)
- Wave 1 -> 5 tasks -> explore, implementation, security
- Wave 2 -> 5 tasks -> implementation, testing, review
- Wave 3 -> 4 tasks -> implementation, testing, security
- Wave 4 -> 4 tasks -> executor, reviewer, security-auditor

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Create backup + restore baseline gate

  **What to do**: Create executable pre-cleanup backup and restore-drill scripts for `demo_easylinksdk` (full schema + in-scope tables), store outputs under `.sisyphus/evidence/`.
  **Must NOT do**: Do not run any DROP/ALTER destructive statements.

  **Recommended Agent Profile**:
  - Category: `security` — Reason: data-loss prevention and recovery validation.
  - Skills: `[]` — Reason: standard SQL/bash workflow.
  - Omitted: `playwright` — Reason: non-UI task.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2-14 | Blocked By: none

  **References**:
  - Pattern: `docs/learning/demo_easylink clean structure export.md` — backup scope baseline
  - Pattern: `migration_v3_clean_slate_schema.sql` — canonical object set for integrity checks

  **Acceptance Criteria**:
  - [ ] `mysqldump --single-transaction --routines --triggers demo_easylinksdk > .sisyphus/evidence/task-1-full-backup.sql` exits 0
  - [ ] `mysqldump --single-transaction demo_easylinksdk tb_scanlog tb_scanlog_safe_events tb_schedule tb_user tb_karyawan tb_employee_group tb_group scanlog_events tb_template > .sisyphus/evidence/task-1-scope-backup.sql` exits 0
  - [ ] Restore drill into temp DB (`demo_easylinksdk_restore_check`) exits 0 and table counts match source for in-scope tables

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Backup success
    Tool: Bash
    Steps: Run full and scope mysqldump commands; verify output file sizes > 0
    Expected: Both artifacts exist and are non-empty
    Evidence: .sisyphus/evidence/task-1-backup.log

  Scenario: Restore failure path
    Tool: Bash
    Steps: Attempt restore with intentionally wrong DB name first, then corrected DB name
    Expected: First run fails with clear error; second run succeeds
    Evidence: .sisyphus/evidence/task-1-restore.log
  ```

  **Commit**: YES | Message: `chore(db): add backup and restore safety gates` | Files: `.sisyphus/evidence/*`, `scripts/db/*`

- [ ] 2. Build authoritative schema/dependency inventory snapshot

  **What to do**: Generate machine-readable inventories for tables, columns, indexes, FKs, views, routines, triggers, events, and grants for `demo_easylinksdk`.
  **Must NOT do**: Do not classify/drop anything yet.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: script + SQL artifact generation.
  - Skills: `[]` — Reason: repository-local scripting.
  - Omitted: `frontend-ui-ux` — Reason: no UI.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5-14 | Blocked By: 1

  **References**:
  - Pattern: `docs/learning/clean-slate-schema-contract.md` — canonical entities to align with
  - Pattern: `docs/learning/clean-slate-compatibility-contract.md` — compat view expectations

  **Acceptance Criteria**:
  - [ ] Inventory artifacts exist: `.sisyphus/evidence/task-2-tables.json`, `task-2-columns.json`, `task-2-dependencies.json`
  - [ ] FK/view/routine/trigger/event references to in-scope legacy objects are explicitly enumerated

  **QA Scenarios**:
  ```
  Scenario: Full inventory generation
    Tool: Bash
    Steps: Run inventory script against demo_easylinksdk
    Expected: All JSON files created with valid JSON
    Evidence: .sisyphus/evidence/task-2-inventory.log

  Scenario: Missing-permission failure
    Tool: Bash
    Steps: Run script with reduced DB user lacking INFORMATION_SCHEMA access
    Expected: Script exits non-zero with explicit missing-privilege error
    Evidence: .sisyphus/evidence/task-2-inventory-error.log
  ```

  **Commit**: YES | Message: `chore(db): add schema dependency inventory artifacts` | Files: `scripts/db/*`, `.sisyphus/evidence/*`

- [ ] 3. Produce code-level dependency census for legacy objects

  **What to do**: Build deterministic scan (grep + ast-grep) that maps each legacy object to file-level read/write dependency in app code and SQL migrations.
  **Must NOT do**: Do not remove references in this task.

  **Recommended Agent Profile**:
  - Category: `review` — Reason: static dependency analysis and risk mapping.
  - Skills: `[]` — Reason: built-in search tools sufficient.
  - Omitted: `dev-browser` — Reason: no browser need.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5-14 | Blocked By: none

  **References**:
  - Pattern: `app/api/scanlog/route.js` — legacy/safe table read paths
  - Pattern: `app/api/scanlog/sync/route.js` — reconciliation and gate behavior
  - Pattern: `app/api/attendance/route.js` — attendance joins to legacy tables
  - Pattern: `lib/auth-session.ts` — auth identity dependencies

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-3-code-dependency-map.md` lists each in-scope table with SELECT/INSERT/UPDATE/DELETE/JOIN callsites
  - [ ] Each dependency is tagged `hard-runtime`, `migration-only`, or `likely-dead`

  **QA Scenarios**:
  ```
  Scenario: Deterministic dependency scan
    Tool: Bash
    Steps: Run census script twice on same commit
    Expected: Outputs are byte-identical
    Evidence: .sisyphus/evidence/task-3-census.log

  Scenario: False-negative guard
    Tool: Bash
    Steps: Inject a temp SQL literal in a scratch file and rerun scanner
    Expected: Scanner reports added reference; scratch file removed afterward
    Evidence: .sisyphus/evidence/task-3-census-error.log
  ```

  **Commit**: YES | Message: `docs(db): add legacy object code dependency census` | Files: `.sisyphus/evidence/*`, `scripts/db/*`

- [ ] 4. Create external-consumer and DB-account usage gate

  **What to do**: Produce executable check for non-app consumers via DB account activity, grants, and query telemetry snapshot for in-scope objects.
  **Must NOT do**: Do not approve drops if telemetry source is unavailable.

  **Recommended Agent Profile**:
  - Category: `security-auditor` — Reason: hidden-consumer risk containment.
  - Skills: `[]` — Reason: SQL + audit script only.
  - Omitted: `playwright` — Reason: backend-only validation.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6-14 | Blocked By: 1

  **References**:
  - API/Type: `app/api/users/route.js` — known app-side dependency context for separation
  - External: `information_schema.USER_PRIVILEGES` — account scope inventory

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-4-db-consumers.json` includes DB users, grants, and access evidence for in-scope objects
  - [ ] If telemetry cannot prove zero external access, status is explicitly `BLOCKED_FOR_DROP`

  **QA Scenarios**:
  ```
  Scenario: External consumer inventory
    Tool: Bash
    Steps: Run consumer scan SQL scripts and aggregate output JSON
    Expected: At least app account and any non-app accounts are listed
    Evidence: .sisyphus/evidence/task-4-consumer-scan.log

  Scenario: Telemetry unavailable edge
    Tool: Bash
    Steps: Run scan with performance_schema disabled
    Expected: Script exits with BLOCKED_FOR_DROP classification
    Evidence: .sisyphus/evidence/task-4-consumer-scan-error.log
  ```

  **Commit**: YES | Message: `chore(db): add external consumer drop gate` | Files: `scripts/db/*`, `.sisyphus/evidence/*`

- [ ] 5. Finalize keep/bridge/deprecate/drop matrix (object + column level)

  **What to do**: Convert inventories into decision-complete matrix for each in-scope table and candidate columns, with explicit lifecycle state and planned wave.
  **Must NOT do**: Do not classify as `drop` without all Wave-1 gates green.

  **Recommended Agent Profile**:
  - Category: `reviewer` — Reason: evidence-to-decision synthesis.
  - Skills: `[]` — Reason: document + data classification.
  - Omitted: `implementation` — Reason: no code mutation required.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 6-14 | Blocked By: 2,3,4

  **References**:
  - Pattern: `docs/learning/demo_easylink clean structure export.md` — canonical + legacy object presence
  - Pattern: `docs/learning/clean-slate-compatibility-contract.md` — compatibility object expectations

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-5-cleanup-matrix.csv` exists with columns: object_name, object_type, state, rationale, blockers, target_wave
  - [ ] Every in-scope table and each candidate column appears exactly once in matrix

  **QA Scenarios**:
  ```
  Scenario: Complete matrix generation
    Tool: Bash
    Steps: Run matrix synthesis script from task-2/3/4 outputs
    Expected: No missing objects; no duplicate object rows
    Evidence: .sisyphus/evidence/task-5-matrix.log

  Scenario: Blocking classification
    Tool: Bash
    Steps: Force one unresolved dependency and regenerate matrix
    Expected: Affected object state becomes BLOCKED_FOR_DROP
    Evidence: .sisyphus/evidence/task-5-matrix-error.log
  ```

  **Commit**: YES | Message: `docs(db): add post-uat cleanup decision matrix` | Files: `.sisyphus/evidence/*`, `docs/learning/*`

- [ ] 6. Add no-new-legacy-reference guard in CI checks

  **What to do**: Add deterministic guard script that fails when new references to drop-candidate objects are introduced in code/migrations.
  **Must NOT do**: Do not fail existing baseline references until they are explicitly whitelisted.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: CI guardrail scripting.
  - Skills: `[]` — Reason: shell/node script suffices.
  - Omitted: `frontend-ui-ux` — Reason: non-UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 10-14 | Blocked By: 5

  **References**:
  - Pattern: `package.json` — script registration pattern
  - Pattern: `.sisyphus/plans/easylink-architecture-clean-slate.md` — evidence-first gate style

  **Acceptance Criteria**:
  - [ ] New script command exists (e.g., `npm run guard:legacy-schema`) and exits non-zero on added banned references
  - [ ] Baseline whitelist file exists and is generated from current dependency map

  **QA Scenarios**:
  ```
  Scenario: Guard pass on clean tree
    Tool: Bash
    Steps: Run guard script with no new references
    Expected: Exit code 0
    Evidence: .sisyphus/evidence/task-6-guard.log

  Scenario: Guard fail on introduced legacy reference
    Tool: Bash
    Steps: Add temporary banned table literal in scratch file and run guard
    Expected: Exit non-zero with offending file path
    Evidence: .sisyphus/evidence/task-6-guard-error.log
  ```

  **Commit**: YES | Message: `chore(ci): block new legacy schema references` | Files: `scripts/*`, `package.json`, `.sisyphus/evidence/*`

- [ ] 7. Implement SQL dependency-zero gate suite for drop candidates

  **What to do**: Add SQL checks that must return zero before object enters quarantine/drop: FK refs, views, routines, triggers, events, and grants.
  **Must NOT do**: Do not allow best-effort pass; any query failure blocks progression.

  **Recommended Agent Profile**:
  - Category: `security` — Reason: destructive DDL risk prevention.
  - Skills: `[]` — Reason: SQL scripts only.
  - Omitted: `dev-browser` — Reason: non-UI.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 10-14 | Blocked By: 5

  **References**:
  - Pattern: `migration_v3_clean_slate_schema.sql` — current FK relationships
  - Pattern: `docs/learning/clean-slate-schema-contract.md` — canonical ownership model

  **Acceptance Criteria**:
  - [ ] SQL gate pack exists at `scripts/db/dependency-gates.sql`
  - [ ] Gate runner emits `.sisyphus/evidence/task-7-dependency-gates.json` with pass/fail per object
  - [ ] Objects with non-zero dependencies are auto-classified `BLOCKED_FOR_DROP`

  **QA Scenarios**:
  ```
  Scenario: Dependency-zero pass for safe candidate
    Tool: Bash
    Steps: Run gate runner for candidate marked drop-eligible
    Expected: All gate counters are 0
    Evidence: .sisyphus/evidence/task-7-gates.log

  Scenario: Dependency-detected fail
    Tool: Bash
    Steps: Run gate for known-active object (e.g., tb_schedule)
    Expected: Non-zero dependency count and BLOCKED_FOR_DROP result
    Evidence: .sisyphus/evidence/task-7-gates-error.log
  ```

  **Commit**: YES | Message: `chore(db): add dependency-zero gate suite` | Files: `scripts/db/*`, `.sisyphus/evidence/*`

- [ ] 8. Run parity and runtime safety gates during pre-contract soak window

  **What to do**: Execute API/data parity checks across scanlog/attendance/users/schedule endpoints to prove no regression while objects remain in bridge mode.
  **Must NOT do**: Do not proceed if any critical endpoint diverges beyond defined threshold.

  **Recommended Agent Profile**:
  - Category: `testing` — Reason: runtime parity validation.
  - Skills: `[]` — Reason: HTTP + SQL checks.
  - Omitted: `frontend-ui-ux` — Reason: API/data parity task.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 11-14 | Blocked By: 5

  **References**:
  - Pattern: `app/api/scanlog/sync/route.js` — `report=delta`, `check_gate` semantics
  - Pattern: `app/api/attendance/route.js` — attendance aggregation path
  - Pattern: `app/api/users/route.js` — auth/identity blended path

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-8-parity.json` includes pass for: scanlog delta gate, attendance row count parity, users role-scope invariants
  - [ ] Any failed parity check marks plan state `NO-GO`

  **QA Scenarios**:
  ```
  Scenario: Parity pass
    Tool: Bash
    Steps: Run parity script hitting defined API checks and SQL count comparisons
    Expected: All checks pass within threshold
    Evidence: .sisyphus/evidence/task-8-parity.log

  Scenario: Parity failure path
    Tool: Bash
    Steps: Run parity with intentionally strict threshold=0 where known drift exists
    Expected: Script fails with explicit failing check list
    Evidence: .sisyphus/evidence/task-8-parity-error.log
  ```

  **Commit**: YES | Message: `test(db): add pre-contract parity gate suite` | Files: `scripts/db/*`, `.sisyphus/evidence/*`
- [ ] 9. Prepare quarantine-rename migration scripts (reversible contract step)

  **What to do**: Generate `RENAME TABLE`-based quarantine scripts for drop-eligible tables only (initial default candidate: `tb_template`), including reverse rename rollback.
  **Must NOT do**: Do not include hard `DROP TABLE` in this task.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: migration script authoring.
  - Skills: `[]` — Reason: SQL DDL scripting.
  - Omitted: `security-auditor` — Reason: audit already in gate tasks.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 11-14 | Blocked By: 7,8

  **References**:
  - Pattern: `migration_v3_clean_slate_schema.sql` — migration style conventions
  - Pattern: `docs/learning/clean-slate-compatibility-contract.md` — bridge-then-contract sequencing

  **Acceptance Criteria**:
  - [ ] Migration file exists: `migration_post_uat_quarantine_legacy.sql`
  - [ ] Rollback file exists: `migration_post_uat_quarantine_legacy_rollback.sql`
  - [ ] Both scripts are idempotent-safe (`IF EXISTS`/pre-check guards)

  **QA Scenarios**:
  ```
  Scenario: Quarantine script dry-run
    Tool: Bash
    Steps: Execute script against restore-check DB and inspect renamed objects
    Expected: Candidate tables renamed to quarantine prefix; no data loss
    Evidence: .sisyphus/evidence/task-9-quarantine.log

  Scenario: Rollback rename
    Tool: Bash
    Steps: Execute rollback script after quarantine run
    Expected: Original table names restored and row counts unchanged
    Evidence: .sisyphus/evidence/task-9-quarantine-rollback.log
  ```

  **Commit**: YES | Message: `feat(db): add reversible quarantine rename migrations` | Files: `migration_post_uat_quarantine_legacy*.sql`, `.sisyphus/evidence/*`

- [ ] 10. Enforce read-only mode for quarantined objects during retention window

  **What to do**: Add guards (permissions/triggers/route-level blocks) so quarantined objects cannot receive new writes while monitoring for hidden reads.
  **Must NOT do**: Do not block canonical tables.

  **Recommended Agent Profile**:
  - Category: `security` — Reason: prevent accidental writes to retiring objects.
  - Skills: `[]` — Reason: SQL grants/triggers + API guard checks.
  - Omitted: `frontend-ui-ux` — Reason: no UI changes.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 11-14 | Blocked By: 9

  **References**:
  - Pattern: `app/api/scanlog/sync/route.js` — write paths to legacy/safe objects
  - Pattern: `app/api/schedule/route.js` — schedule write paths

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-10-readonly-gate.json` shows write attempts to quarantined objects are blocked
  - [ ] Canonical write paths remain functional

  **QA Scenarios**:
  ```
  Scenario: Write blocked to quarantined object
    Tool: Bash
    Steps: Attempt INSERT/UPDATE on quarantined table using app DB role
    Expected: Permission/trigger block with explicit error
    Evidence: .sisyphus/evidence/task-10-readonly.log

  Scenario: Canonical write unaffected
    Tool: Bash
    Steps: Perform control write on canonical table used by app flow
    Expected: Write succeeds
    Evidence: .sisyphus/evidence/task-10-readonly-control.log
  ```

  **Commit**: YES | Message: `chore(db): enforce read-only quarantine guardrails` | Files: `scripts/db/*`, `.sisyphus/evidence/*`

- [ ] 11. Run retention-window usage telemetry and zero-hit gate

  **What to do**: Execute scheduled telemetry collection over defined retention window (default: 14 days) for quarantined objects; mark eligible only if zero hits.
  **Must NOT do**: Do not shorten retention window below 14 days in this plan.

  **Recommended Agent Profile**:
  - Category: `testing` — Reason: time-window evidence collection.
  - Skills: `[]` — Reason: SQL telemetry polling + aggregation.
  - Omitted: `playwright` — Reason: DB telemetry task.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 12-14 | Blocked By: 9,10

  **References**:
  - External: `performance_schema` statement summaries / query digest tables
  - Pattern: `.sisyphus/evidence/task-4-db-consumers.json` — consumer baseline

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-11-usage-window.json` reports zero accesses to each quarantined object over retention window
  - [ ] Any detected access auto-flags object as `NOT_ELIGIBLE_FOR_DROP`

  **QA Scenarios**:
  ```
  Scenario: Zero-hit eligibility
    Tool: Bash
    Steps: Aggregate telemetry snapshots for full retention window
    Expected: Access count=0 for each candidate; status eligible
    Evidence: .sisyphus/evidence/task-11-usage.log

  Scenario: Hidden consumer detection
    Tool: Bash
    Steps: Simulate/query quarantined table during window and rerun aggregation
    Expected: Access count>0 and status not eligible
    Evidence: .sisyphus/evidence/task-11-usage-error.log
  ```

  **Commit**: YES | Message: `test(db): add quarantine retention usage gates` | Files: `scripts/db/*`, `.sisyphus/evidence/*`

- [ ] 12. Execute delayed hard-drop for eligible objects only

  **What to do**: Apply `DROP TABLE`/`DROP COLUMN` only for objects marked eligible after Tasks 7-11; produce immutable execution report.
  **Must NOT do**: Do not include non-eligible objects in drop script.

  **Recommended Agent Profile**:
  - Category: `executor` — Reason: controlled destructive step execution.
  - Skills: `[]` — Reason: SQL execution with strict gates.
  - Omitted: `review` — Reason: review handled in final wave.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 13-14 | Blocked By: 11

  **References**:
  - Pattern: `.sisyphus/evidence/task-5-cleanup-matrix.csv` — eligibility source of truth
  - Pattern: `migration_post_uat_quarantine_legacy.sql` — object lineage for drop set

  **Acceptance Criteria**:
  - [ ] `migration_post_uat_drop_legacy.sql` contains only eligible objects
  - [ ] `.sisyphus/evidence/task-12-drop-report.json` lists dropped objects and pre/post row-count snapshots
  - [ ] Execution aborts if any eligibility gate is stale or missing

  **QA Scenarios**:
  ```
  Scenario: Eligible-only drop execution
    Tool: Bash
    Steps: Run drop executor with fresh gate artifacts
    Expected: Only eligible objects dropped; script exits 0
    Evidence: .sisyphus/evidence/task-12-drop.log

  Scenario: Gate-staleness block
    Tool: Bash
    Steps: Remove/age one required gate artifact and rerun executor
    Expected: Execution blocked with explicit stale-gate error
    Evidence: .sisyphus/evidence/task-12-drop-error.log
  ```

  **Commit**: YES | Message: `feat(db): execute delayed drop for eligible legacy objects` | Files: `migration_post_uat_drop_legacy.sql`, `.sisyphus/evidence/*`

- [ ] 13. Post-drop runtime and parity regression audit

  **What to do**: Re-run runtime API parity suite and DB dependency scans after drop to confirm no regressions and no dangling references.
  **Must NOT do**: Do not mark complete if any endpoint or dependency check fails.

  **Recommended Agent Profile**:
  - Category: `tester` — Reason: post-change validation.
  - Skills: `[]` — Reason: scripted checks.
  - Omitted: `frontend-ui-ux` — Reason: API/DB verification focus.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 14 | Blocked By: 12

  **References**:
  - Pattern: `app/api/scanlog/route.js`, `app/api/attendance/route.js`, `app/api/users/route.js`, `app/api/schedule/route.js`
  - Pattern: `scripts/db/dependency-gates.sql`

  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-13-postdrop-parity.json` all checks pass
  - [ ] Dependency gate rerun shows no references to dropped objects

  **QA Scenarios**:
  ```
  Scenario: Post-drop parity pass
    Tool: Bash
    Steps: Run same parity suite from Task 8 against post-drop state
    Expected: No regressions
    Evidence: .sisyphus/evidence/task-13-postdrop.log

  Scenario: Regression detection
    Tool: Bash
    Steps: Run parity suite with one intentionally broken endpoint config in test env
    Expected: Suite fails and identifies broken endpoint
    Evidence: .sisyphus/evidence/task-13-postdrop-error.log
  ```

  **Commit**: YES | Message: `test(db): add post-drop parity and dependency audit` | Files: `scripts/db/*`, `.sisyphus/evidence/*`

- [ ] 14. Final rollback readiness and archival handoff

  **What to do**: Package final rollback commands, retention artifacts, and archived backups with checksum manifest and handoff doc.
  **Must NOT do**: Do not delete backup artifacts in this task.

  **Recommended Agent Profile**:
  - Category: `doc-writer` — Reason: operational handoff completeness.
  - Skills: `[]` — Reason: docs + manifest generation.
  - Omitted: `implementation` — Reason: no new logic.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: none | Blocked By: 12,13

  **References**:
  - Pattern: `.sisyphus/evidence/task-1-full-backup.sql`
  - Pattern: `.sisyphus/evidence/task-12-drop-report.json`
  - Pattern: `.sisyphus/evidence/task-13-postdrop-parity.json`

  **Acceptance Criteria**:
  - [ ] `docs/learning/post-uat-cleanup-handoff.md` includes rollback matrix and emergency runbook
  - [ ] Backup/archive checksum manifest exists and validates

  **QA Scenarios**:
  ```
  Scenario: Manifest integrity
    Tool: Bash
    Steps: Generate SHA256 manifest and verify all listed artifacts
    Expected: All checksums match
    Evidence: .sisyphus/evidence/task-14-manifest.log

  Scenario: Missing-artifact failure
    Tool: Bash
    Steps: Remove one artifact path in staging copy and run manifest verify
    Expected: Verification fails with missing path detail
    Evidence: .sisyphus/evidence/task-14-manifest-error.log
  ```

  **Commit**: YES | Message: `docs(db): finalize post-uat cleanup rollback handoff` | Files: `docs/learning/*`, `.sisyphus/evidence/*`

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit per lifecycle stage (inventory/gates, quarantine, delayed-drop batch)
- Never mix destructive and non-destructive changes in one commit
- Keep reversible checkpoints before each DDL milestone

## Success Criteria
- Only objects with proven zero usage are dropped
- No runtime/API regressions after cleanup
- Full rollback path validated before and after quarantine stage
- Evidence artifacts are complete and auditable
