# Machine Connect: Tabbed De-Clutter + Static Fast Rendering

## TL;DR
> **Summary**: Restructure `/machine` into 3 selectable tabs (Ops/Queue/Logs) to remove UI clutter, keep tab switches instant with static rendering (no skeleton on tab change), and preserve existing machine/scanlog functionality.
> **Deliverables**:
> - Tabbed machine page with isolated per-tab state and stable behavior
> - Logs tab with date-range-driven table UX aligned to existing project patterns
> - Race-safe data loading on rapid tab switching without full-page loading flashes
> - Agent-executed manual QA evidence for admin + non-admin + edge cases
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 6 → Task 8

## Context
### Original Request
- "on machine connects. its too much cluttered make it manageable in selectable tabs."
- "after adding skeleton lazy loading. between pages is feel sluggish."
- "should be implemented in table, data range cell but remain static render blaizngly quick"

### Interview Summary
- Confirmed tab split: **Ops / Queue / Logs**.
- Confirmed UX behavior: **no skeleton when switching tabs**; keep static DOM feel and only show local inline loading for true fetch/refresh operations.
- Confirmed scope boundary: **Machine page only** (exclude app-wide loading/perf changes in `components/app-shell.jsx`).
- Confirmed verification model: **manual QA only** (agent-executed scenarios + evidence artifacts).

### Metis Review (gaps addressed)
- Enforced Next.js 14 compatibility (repo uses `next@14.2.3`), no Next16-only features.
- Added race-condition guardrails for fast tab switching and in-flight requests.
- Added role/access guardrail checks (non-admin redirect behavior remains unchanged).
- Added explicit tab behavior contract (first-load vs subsequent switch behavior).
- Added API contract preservation guardrail for existing endpoints.

## Work Objectives
### Core Objective
Deliver a cleaner, faster-feeling `/machine` experience by splitting the monolithic UI into clear tabs while preserving all existing machine operations, queue management, and logs functionality.

### Deliverables
- `/machine` renders 3 tabs with predictable content boundaries:
  - **Ops**: machine actions, task-12 action controls, and operation result panels.
  - **Queue**: recent machine jobs list, pagination, expand/cancel controls.
  - **Logs**: date-range + source/pin filters and table-based records view.
- Tab switching remains instant (no full-page skeleton, no route navigation, no component remount thrash).
- Existing API behaviors and payload contracts remain unchanged.
- Manual QA evidence files captured per task and final verification wave.

### Definition of Done (verifiable conditions with commands)
- `npm run build` exits with code 0.
- `npm run typecheck` exits with code 0.
- Browser QA confirms tab switches (Ops↔Queue↔Logs) produce no full-page skeleton flash and no console errors.
- Browser QA confirms queue and logs interactions still call existing endpoints and render expected results/empty states.
- Browser QA confirms non-admin access behavior for `/machine` is unchanged (redirect/guard).

### Must Have
- Maintain all current action flows (`confirmMachineAction`, queue submission/cancel, task-12 parity actions).
- Keep data-fetching contracts intact for:
  - `/api/machine`
  - `/api/scanlog/sync`
  - `/api/scanlog`
  - `/api/scanlog/stream`
- Preserve static tab container rendering and use lightweight localized loading indicators only.
- Isolate per-tab state so tab-specific updates do not trigger broad rerender churn.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No app-wide loading/perf rewrite in `components/app-shell.jsx`.
- No backend schema/contract redesign.
- No introduction of Next16-only APIs/patterns.
- No generic "improve performance" claims without reproducible QA evidence.
- No splitting this work into multiple plans.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **none (framework setup out of scope)** + manual agent QA.
- QA policy: Every task includes happy + failure/edge scenario with evidence paths.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: UX contract + architecture split + tab frame foundation (blocking)
Wave 2: Per-tab wiring + integration + perf/a11y hardening + integrated QA

### Dependency Matrix (full, all tasks)
- Task 1 blocks Tasks 2, 3, 4.
- Task 2 blocks Task 5.
- Task 3 blocks Task 6.
- Task 4 blocks Task 7.
- Tasks 5, 6, 7 block Task 8.
- Task 8 blocks Task 9.
- Task 9 blocks final verification wave (F1-F4).

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 4 tasks → implementation / refactorer / visual-engineering
- Wave 2 → 5 tasks → implementation / visual-engineering / tester / review
- Final Verification → 4 tasks → oracle / unspecified-high / deep

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Define `/machine` tab behavior contract and state partition

  **What to do**:
  - In `app/machine/page.jsx`, introduce explicit tab config with fixed order: `ops`, `queue`, `logs`.
  - Add `activeTab` local state with default `ops`.
  - Add first-load flags: `queueInitialized`, `logsInitialized`.
  - Define behavior contract in code comments and implementation:
    1) First open of Queue/Logs may show localized loading row while fetching.
    2) Subsequent tab switches must reuse cached in-memory state with no full-page skeleton.
    3) Tab selection is local state only (no URL query sync).
  - Partition state ownership so tab-specific states do not trigger unrelated tab rerender churn.

  **Must NOT do**:
  - Do not introduce route navigation for tab switches.
  - Do not add app-wide loading changes in `components/app-shell.jsx`.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: foundational refactor decisions and state contract setup.
  - Skills: `[]` — No special skill required.
  - Omitted: `playwright` — not needed for code changes in this step.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2,3,4 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `app/attendance/page.jsx:23-31` — tab definitions by role.
  - Pattern: `app/attendance/page.jsx:104,142` — active tab state + selected tabs list.
  - Current target: `app/machine/page.jsx:599-915` — mixed Ops/Task12/artifact/scanlog controls currently co-located.
  - Guardrail context: `components/app-shell.jsx:186-196` — non-admin redirect behavior for `/machine`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `/machine` code contains explicit 3-tab config with default `ops`.
  - [ ] Tab state persistence is local-only (no query param sync logic added).
  - [ ] No import/use of global skeleton mechanisms introduced for tab switch behavior.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Tab defaults to Ops
    Tool: Playwright
    Steps: Open /machine as admin; verify Ops tab is active by default; capture first paint.
    Expected: Ops tab active, Queue/Logs inactive, no route change.
    Evidence: .sisyphus/evidence/task-1-tab-contract-default.png

  Scenario: Tab state stays local (no URL mutation)
    Tool: Playwright
    Steps: Click Queue then Logs; inspect current URL each click.
    Expected: Path remains /machine with no tab query param changes.
    Evidence: .sisyphus/evidence/task-1-tab-contract-url.txt
  ```

  **Commit**: YES | Message: `refactor(machine): define local tab state contract for machine page` | Files: `app/machine/page.jsx`

- [ ] 2. Extract and encapsulate Ops tab UI

  **What to do**:
  - Create `components/machine/machine-ops-tab.jsx`.
  - Move Ops-specific sections from `app/machine/page.jsx` into this component:
    - Machine worker action grid (`info/time/sync_time/pull_users`) around `app/machine/page.jsx:623-685`.
    - Add User menu around `app/machine/page.jsx:687-751`.
    - Task-12 parity actions around `app/machine/page.jsx:753-891`.
    - Artifact views around `app/machine/page.jsx:893-914`.
  - Keep orchestration logic (API handlers/state mutation) in `app/machine/page.jsx`; pass handlers/state down as props.

  **Must NOT do**:
  - Do not change endpoint contracts or payload shapes.
  - Do not move queue history list into Ops tab.

  **Recommended Agent Profile**:
  - Category: `refactorer` — Reason: safe extraction of dense JSX without behavior drift.
  - Skills: `[]` — No special skill needed.
  - Omitted: `frontend-ui-ux` — structural extraction is primary concern.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 5 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Source block: `app/machine/page.jsx:623-914` — full Ops-related UI currently inline.
  - Existing helper usage: `app/machine/page.jsx:562-593` (`artifactEntries`) and action handlers above render.
  - UI pattern: `components/ui/table-shell.jsx:1-40` — preferred lightweight shell/loading conventions.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Ops controls render under Ops tab only and invoke existing handlers correctly.
  - [ ] Add User, Task-12 actions, and artifact panels still function without API contract changes.
  - [ ] No regression in confirmation modal trigger paths for Ops actions.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Ops actions remain functional after extraction
    Tool: Playwright
    Steps: Open /machine; trigger Get Device Info and Sync Date/Time; submit confirmations.
    Expected: Buttons queue actions, actionBusy text appears, result payload panels update as before.
    Evidence: .sisyphus/evidence/task-2-ops-actions.png

  Scenario: Failure path on invalid Add User input
    Tool: Playwright
    Steps: Leave PIN empty; click Queue Add User.
    Expected: Validation/error feedback appears (or request rejection surfaced) without UI crash.
    Evidence: .sisyphus/evidence/task-2-ops-add-user-error.png
  ```

  **Commit**: YES | Message: `refactor(machine): extract operations tab component` | Files: `app/machine/page.jsx`, `components/machine/machine-ops-tab.jsx`

- [ ] 3. Extract and encapsulate Queue tab UI

  **What to do**:
  - Create `components/machine/machine-queue-tab.jsx`.
  - Move queue-history section from `app/machine/page.jsx` into Queue tab component:
    - "Recent Machine Jobs" header/controls around `app/machine/page.jsx:1096-1146`.
    - Row list + expand details + status pills + admin cancel controls around `app/machine/page.jsx:1148-1230`.
  - Preserve existing expand/collapse behavior and pagination controls.
  - Keep queue fetching/cancel handlers in parent page and pass via props.

  **Must NOT do**:
  - Do not alter cancel-job permission rules.
  - Do not replace current row/card layout with a new design system.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: component extraction plus behavior preservation.
  - Skills: `[]` — No special skill needed.
  - Omitted: `playwright` — verification runs separately.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Source queue section: `app/machine/page.jsx:1096-1230`.
  - Expand state handler: `app/machine/page.jsx:595-597`.
  - Queue metadata/status display: `app/machine/page.jsx:623-644` and queue fetch logic above render.
  - Existing status helpers: `app/machine/page.jsx` (`isTerminalStatus`, status badge classes in row rendering).

  **Acceptance Criteria** (agent-executable only):
  - [ ] Queue tab shows current job list, pagination state, and expand details identical to pre-refactor behavior.
  - [ ] Admin cancel action remains available and functional where previously supported.
  - [ ] Queue tab empty/loading/error states render with existing shell styling.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Queue pagination and row expansion
    Tool: Playwright
    Steps: Switch to Queue tab; paginate next/prev; expand at least one job row.
    Expected: Correct page metadata updates and expanded JSON/detail panel appears.
    Evidence: .sisyphus/evidence/task-3-queue-pagination-expand.png

  Scenario: Cancel edge behavior
    Tool: Playwright
    Steps: Attempt cancel on a terminal job and on a cancellable job (if present).
    Expected: Terminal job shows disabled/no-op behavior; cancellable job triggers cancel flow without crash.
    Evidence: .sisyphus/evidence/task-3-queue-cancel-edge.png
  ```

  **Commit**: YES | Message: `refactor(machine): extract queue tab component` | Files: `app/machine/page.jsx`, `components/machine/machine-queue-tab.jsx`

- [ ] 4. Build Logs tab UI with date-range and table-shell patterns

  **What to do**:
  - Create `components/machine/machine-logs-tab.jsx`.
  - Implement Logs tab UI using existing project patterns:
    - Date-range controls (`from`, `to`) and optional pin/source filters aligned to attendance/scanlog styles.
    - Table shell rendering using `TableShell`, `TableHeadRow`, `TableLoadingRow`, `TableEmptyRow`.
    - Fixed, static table container (no skeleton overlay when switching tabs).
  - Keep scanlog queue action controls associated with logs behavior in Logs tab (not Ops).

  **Must NOT do**:
  - Do not introduce a new table library.
  - Do not alter existing date format semantics used elsewhere.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI composition consistency and layout clarity.
  - Skills: `[]` — Existing in-repo patterns are sufficient.
  - Omitted: `frontend-ui-ux` — no net-new design language needed.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 7 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Date-range/filter pattern: `components/attendance/attendance-filters.jsx:27-46,93-104`.
  - Logs page filtering structure: `app/scanlog/page.jsx:1-260`.
  - Table primitives: `components/ui/table-shell.jsx:1-40`.
  - Existing machine scanlog controls: `app/machine/page.jsx:916-960`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Logs tab has visible date-range controls and table headers/cells rendered through table-shell components.
  - [ ] Logs tab renders loading/empty/data states without full-page fallback.
  - [ ] Switching away and back to Logs does not remount a global skeleton.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Logs tab date-range table render
    Tool: Playwright
    Steps: Open Logs tab; set From/To; click Apply/Refresh.
    Expected: Table updates with loading row then data/empty state; layout remains static.
    Evidence: .sisyphus/evidence/task-4-logs-date-range-table.png

  Scenario: Invalid date range edge case
    Tool: Playwright
    Steps: Set From > To and submit filter.
    Expected: Graceful validation or safe empty/error message; no crash.
    Evidence: .sisyphus/evidence/task-4-logs-invalid-range.png
  ```

  **Commit**: YES | Message: `feat(machine): add logs tab table and date-range controls` | Files: `components/machine/machine-logs-tab.jsx`, `app/machine/page.jsx`

- [ ] 5. Rewire Ops tab handlers/results without behavior drift

  **What to do**:
  - Ensure all Ops tab actions still call existing parent handlers and preserve confirmation modal flow:
    - `confirmMachineAction`, `submitMachineAction`, `queueAddUser`, `queueTask12ScanlogNew`, `queueUsersPartial`.
  - Ensure result panels (`deviceInfo`, `deviceTime`, `userSyncResult`, `scanSyncResult`, `initResult`, task12 artifacts) remain accessible from Ops tab after extraction.
  - Keep action busy labels and disabled states exactly aligned with existing behavior.

  **Must NOT do**:
  - Do not refactor API payload contracts during this step.
  - Do not duplicate handler logic inside child components.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: event wiring and state integrity checks.
  - Skills: `[]` — No special skill needed.
  - Omitted: `testing` — formal test infra is out of scope.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 2

  **References** (executor has NO interview context — be exhaustive):
  - Handler core: `app/machine/page.jsx:273-559` (queue submit/refresh/confirm helpers).
  - Ops sections moved in Task 2: `app/machine/page.jsx:623-914`.
  - Artifact derivation: `app/machine/page.jsx:562-593`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] All existing Ops actions can still be triggered and complete as before.
  - [ ] Confirmation modal text/action labels remain correct per action.
  - [ ] Busy/loading labels continue to reflect in-flight actions.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Confirmation modal integrity
    Tool: Playwright
    Steps: Trigger initialize machine and one non-danger action; inspect modal labels/messages; confirm.
    Expected: Correct modal copy and confirm behavior for both danger and normal actions.
    Evidence: .sisyphus/evidence/task-5-ops-confirm-modal.png

  Scenario: Action failure resilience
    Tool: Playwright
    Steps: Simulate request failure (offline or API error) while triggering an Ops action.
    Expected: Error banner/text shown, actionBusy resets, UI remains interactive.
    Evidence: .sisyphus/evidence/task-5-ops-failure-resilience.png
  ```

  **Commit**: YES | Message: `fix(machine): preserve ops action wiring after tab extraction` | Files: `app/machine/page.jsx`, `components/machine/machine-ops-tab.jsx`

- [ ] 6. Rewire Queue tab data flow, controls, and permissions

  **What to do**:
  - Ensure Queue tab consumes existing queue state from parent (`machineRows`, `machineQueueMeta`, pagination, errors).
  - Preserve refresh and per-row expand/cancel behavior exactly.
  - Keep admin-only cancel control conditions intact.
  - Ensure Queue tab first-open initializes queue load if not already populated.

  **Must NOT do**:
  - Do not alter machine queue endpoint semantics.
  - Do not remove expandable row details.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: state-flow and permission-sensitive behavior.
  - Skills: `[]` — no special skill needed.
  - Omitted: `security` — no auth model changes required.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 3

  **References** (executor has NO interview context — be exhaustive):
  - Queue refresh handler: `app/machine/page.jsx` (`refreshMachineQueue` in action helpers section).
  - Queue render source block: `app/machine/page.jsx:1096-1230`.
  - Expand helper: `app/machine/page.jsx:595-597`.
  - Terminal status helper: `app/machine/page.jsx` (`isTerminalStatus`).

  **Acceptance Criteria** (agent-executable only):
  - [ ] Queue tab refresh updates metadata and row list.
  - [ ] Pagination and row expansion remain functional.
  - [ ] Cancel control remains admin-guarded and terminal-state-safe.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Queue refresh and pagination continuity
    Tool: Playwright
    Steps: Enter Queue tab; click refresh; change rows-per-page; paginate next and previous.
    Expected: Metadata and rows update correctly with no UI flicker.
    Evidence: .sisyphus/evidence/task-6-queue-refresh-pagination.png

  Scenario: Permission edge behavior
    Tool: Playwright
    Steps: Access /machine with non-admin user context.
    Expected: Existing redirect/guard behavior preserved; queue controls not exposed to unauthorized context.
    Evidence: .sisyphus/evidence/task-6-queue-nonadmin-guard.png
  ```

  **Commit**: YES | Message: `fix(machine): preserve queue behavior and admin controls in queue tab` | Files: `app/machine/page.jsx`, `components/machine/machine-queue-tab.jsx`

- [ ] 7. Implement Logs data flow with cached static tab behavior

  **What to do**:
  - Implement Logs data loading using `usePaginatedResource` in parent page or a dedicated hook module.
  - Query parameters must support at minimum: `from`, `to`, `page`, `limit`, optional `source`, optional `pin`.
  - On first Logs tab open: initialize load once.
  - On subsequent tab switches: keep prior table DOM/data visible (no skeleton reset); only run load when user explicitly applies filters, paginates, or refreshes.
  - Keep in-flight request cancellation behavior via abort support to prevent stale updates.

  **Must NOT do**:
  - Do not auto-refetch on every tab switch.
  - Do not clear logs rows to empty between tab changes unless filters change.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: data lifecycle and request orchestration.
  - Skills: `[]` — built-in hook/pattern references are sufficient.
  - Omitted: `testing` — no formal test harness setup in scope.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8 | Blocked By: 4

  **References** (executor has NO interview context — be exhaustive):
  - Pagination hook: `hooks/use-paginated-resource.js:1-157`.
  - Scanlog request pattern: `app/scanlog/page.jsx:1-260`.
  - Existing machine scanlog params: `app/machine/page.jsx:916-960`.
  - Date-range defaults helper: `app/machine/page.jsx` (`currentMonthRange`).

  **Acceptance Criteria** (agent-executable only):
  - [ ] Logs first-open loads data once and renders loading row then stable table content.
  - [ ] Returning to Logs tab does not trigger full reset/skeleton when no filter/pagination action occurred.
  - [ ] Rapid filter updates do not surface stale-response UI corruption.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: First-open fetch then cached tab return
    Tool: Playwright
    Steps: Open Logs tab (first time), wait for data; switch Ops→Logs repeatedly.
    Expected: First open fetches; later switches keep rendered table state with no skeleton flash.
    Evidence: .sisyphus/evidence/task-7-logs-cache-switch.png

  Scenario: Stale request protection
    Tool: Playwright
    Steps: In Logs, rapidly change filters and submit twice with different values.
    Expected: Final table reflects latest filter set only; no stale overwrite.
    Evidence: .sisyphus/evidence/task-7-logs-stale-request-edge.png
  ```

  **Commit**: YES | Message: `feat(machine): add abort-safe logs data flow with static tab caching` | Files: `app/machine/page.jsx`, `components/machine/machine-logs-tab.jsx`, `hooks/use-paginated-resource.js` (only if extension needed)

- [ ] 8. Integrate tab shell, keyboard accessibility, and rapid-switch performance safeguards

  **What to do**:
  - Add semantic tab controls in `app/machine/page.jsx`:
    - container `role="tablist"`
    - each trigger `role="tab"`, `aria-selected`, `aria-controls`
    - each panel `role="tabpanel"`, `aria-labelledby`.
  - Implement keyboard support: ArrowLeft/ArrowRight, Home, End for tab focus/selection.
  - Keep tab panels mounted (hide inactive panel via classes/attributes) to avoid remount slowness.
  - Ensure no global loading placeholders are triggered by tab switching.
  - Add memoization/derived-state guards where needed to prevent unnecessary panel rerenders.

  **Must NOT do**:
  - Do not replace mounted-panel approach with route-based navigation.
  - Do not add virtualization or heavy perf tooling in this scope.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: interaction smoothness + a11y semantics.
  - Skills: `[]` — no external library adoption required.
  - Omitted: `frontend-ui-ux` — existing visual language remains unchanged.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 9 | Blocked By: 5,6,7

  **References** (executor has NO interview context — be exhaustive):
  - Existing tab behavior reference: `app/attendance/page.jsx:23-31,104,142`.
  - Existing machine root render: `app/machine/page.jsx:599-1230`.
  - Global loading out-of-scope reference: `components/app-shell.jsx:231-244`.
  - Table loading reference: `components/ui/table-shell.jsx:22-31` (`TableLoadingRow`).

  **Acceptance Criteria** (agent-executable only):
  - [ ] Tab controls satisfy ARIA roles/states and keyboard navigation works end-to-end.
  - [ ] Rapid tab switching (10+ switches) produces no full-page skeleton and no console errors.
  - [ ] Inactive panel content remains mounted and restores instantly on return.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Keyboard-accessible tab navigation
    Tool: Playwright
    Steps: Focus tablist; use ArrowRight/ArrowLeft/Home/End.
    Expected: Focus and active tab update correctly; matching panel becomes visible.
    Evidence: .sisyphus/evidence/task-8-tab-a11y-keyboard.png

  Scenario: Rapid-switch stress
    Tool: Playwright
    Steps: Cycle Ops→Queue→Logs 10 times quickly; collect console logs.
    Expected: No runtime errors, no full-page loading placeholder, no frozen interaction.
    Evidence: .sisyphus/evidence/task-8-tab-rapid-switch-console.json
  ```

  **Commit**: YES | Message: `fix(machine): add accessible static tab shell and switch-performance guards` | Files: `app/machine/page.jsx`, `components/machine/*.jsx`

- [ ] 9. Execute integrated manual QA wave and produce evidence bundle

  **What to do**:
  - Run full integrated verification after refactor and wiring tasks complete.
  - Execute build/typecheck plus scripted browser scenarios for ops, queue, logs, and role guards.
  - Capture screenshots/text/json evidence under `.sisyphus/evidence/` with stable names.
  - Document observed results and pass/fail per scenario in `.sisyphus/evidence/task-9-summary.md`.

  **Must NOT do**:
  - Do not mark done without evidence files for both happy and failure/edge scenarios.
  - Do not rely on memory-only verification notes.

  **Recommended Agent Profile**:
  - Category: `tester` — Reason: evidence-focused validation across user flows and edge cases.
  - Skills: `[]` — built-in browser + shell tools are sufficient.
  - Omitted: `implementation` — this is validation/documentation only.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: Final wave F1-F4 | Blocked By: 8

  **References** (executor has NO interview context — be exhaustive):
  - Build/typecheck commands: `package.json:5-15`.
  - Machine route target: `app/machine/page.jsx`.
  - Guard behavior reference: `components/app-shell.jsx:186-196`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm run build` exits 0 and output saved to `.sisyphus/evidence/task-9-build.txt`.
  - [ ] `npm run typecheck` exits 0 and output saved to `.sisyphus/evidence/task-9-typecheck.txt`.
  - [ ] QA summary file includes pass/fail for all task scenarios and links to artifacts.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: End-to-end happy path bundle
    Tool: Playwright + Bash
    Steps: Run build/typecheck; run admin walkthrough for Ops/Queue/Logs; capture screenshots and console output.
    Expected: All primary flows function, no critical console/runtime errors.
    Evidence: .sisyphus/evidence/task-9-e2e-happy.zip

  Scenario: End-to-end edge/failure bundle
    Tool: Playwright + Bash
    Steps: Execute invalid date range, rapid tab switching, and non-admin /machine access checks.
    Expected: Graceful handling for each edge condition with preserved route guard.
    Evidence: .sisyphus/evidence/task-9-e2e-edge.zip
  ```

  **Commit**: YES | Message: `docs(qa): add machine tabbed UX verification evidence` | Files: `.sisyphus/evidence/*` (or project QA artifacts path in repo policy)

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit 1: `refactor(machine): split machine page into ops queue logs tabs`
- Commit 2: `feat(machine): add logs table date-range flow with static tab rendering`
- Commit 3: `fix(machine): harden tab-switch race handling and preserve role guards`
- Commit 4: `docs(qa): add evidence artifacts for machine tabbed UX verification`

## Success Criteria
- Machine page is materially less cluttered via tabbed segmentation with no workflow loss.
- Tab switching feels instant (static render, no skeleton flash) under normal and rapid interactions.
- Queue and logs behaviors remain functionally correct and API-compatible.
- Scope remains contained to machine page changes only.
