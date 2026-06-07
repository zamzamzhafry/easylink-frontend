# Machine Connect Tabs + Auth Elevation + Overlay Right Bar + Schedule Full-Width

## TL;DR
> **Summary**: Consolidate machine operations into PS1-aligned tabs, fix `ADMIN001` admin elevation/render mismatch, switch right sidebar to overlay behavior, and expand schedule layout to use screen width without right-margin reservation.
> **Deliverables**:
> - Auth contract fix for machine page (`/api/auth/me` envelope parsing)
> - Machine page tabs: Device Info & Time, Scanlogs, Users Manipulation, Danger Zone (placeholder)
> - Overlay right bar behavior in app-shell/layout
> - Schedule page full-width fill behavior with overlay compatibility
> - Reconciliation report of pending machine-connect items from existing plans/docs
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 (auth contract) → 3 (tab architecture) → 6/7/8 (feature tab migration) → 13 (integrated QA)

## Context
### Original Request
- Reference `docs/learning/easylink.ps1` and restructure machine features by tabs.
- Include scanlogs, users manipulation, device info/time, and later danger zone.
- Fix seeded smoke admin (`ADMIN001`) not seeing logs JSON, or simplify viewer.
- Move right bar behavior to layout/page behavior as overlay.
- Make schedule pages fill screen width/right side.
- Scan docs/todo and report not-achieved/pending items.

### Interview Summary
- User chose: **Fix auth elevation** for `ADMIN001`.
- User chose: **Danger Zone placeholder now**.
- User chose: **Reconcile pending items into one plan**.
- Root cause confirmed: machine page parses `/api/auth/me` envelope incorrectly (stores whole response, not `response.user`), making `isAdmin` false in page-level render path.

### Metis Review (gaps addressed)
- Added guardrails to prevent scope creep into destructive Danger Zone operations.
- Added explicit verification for `/api/auth/me` contract, seed `--execute`, and admin/non-admin UX/API parity.
- Added overlay regression checks (z-index, focus, ESC, click-through) and session transition checks.
- Added explicit reconciliation source for pending items (`.sisyphus/plans/machine-connect-tabs-performance.md` plus docs follow-up notes).

## Work Objectives
### Core Objective
Deliver a deterministic, role-correct machine operations experience with PS1-aligned tabs and overlay-first layout behavior, without weakening backend admin security constraints.

### Deliverables
1. Machine page auth-context parsing fix (`/api/auth/me` envelope alignment).
2. Machine tabs aligned to `docs/learning/easylink.ps1` operation groups.
3. Right sidebar overlay behavior (no permanent `xl:mr-80` content reservation).
4. Schedule layout width expansion and right-side fill compatibility.
5. Pending-item reconciliation report and execution checklist.

### Definition of Done (verifiable conditions with commands)
- `npm run typecheck` passes.
- `npm run build` passes.
- Admin login (`admin001`) yields `/api/auth/me` with `user.is_admin=true` and machine JSON blocks render.
- Non-admin users retain backend 403 for admin-only machine/scanlog APIs.
- Right bar open state overlays content (no layout width shrink from `xl:mr-80`).
- Schedule page content fills available width and remains usable with right overlay open.

### Must Have
- Keep backend admin-only guards intact unless explicitly changing policy (not in this scope).
- Preserve existing machine action semantics and queue polling semantics.
- Keep Danger Zone actions non-expanded (placeholder tab only).
- Reconcile relevant pending items from prior machine-connect plan.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT add new destructive endpoints/actions.
- Must NOT bypass role checks via client-only hacks.
- Must NOT duplicate pollers per tab; shared state remains centralized.
- Must NOT alter unrelated route permissions.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after (existing project relies on build/typecheck + agent QA flows).
- QA policy: Every task includes happy + failure/edge scenarios.
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Shared dependencies extracted to Wave 1.

Wave 1: Auth contract + layout foundations + pending reconciliation
- Tasks: 1, 2, 4, 5, 12

Wave 2: Machine tab migration + role-aware rendering
- Tasks: 3, 6, 7, 8, 9, 10

Wave 3: Integration hardening + regression verification
- Tasks: 11, 13

### Dependency Matrix (full, all tasks)
- 1 → blocks 3, 6, 7, 8, 10, 13
- 2 → informs 13
- 3 → blocks 6, 7, 8, 9, 10, 11, 13
- 4 + 5 → block 11 and feed 13
- 6/7/8/9/10 + 11 + 12 → block 13

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → implementation, review, testing
- Wave 2 → 6 tasks → implementation, visual-engineering, review
- Wave 3 → 2 tasks → testing, reviewer, deep

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task includes Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Fix machine auth envelope parsing (`/api/auth/me`) to restore correct `isAdmin`

  **What to do**:
  - Update machine-page current-user fetch path to unwrap `response.user` (same contract as app-shell).
  - Ensure `currentUser` shape always matches `AuthContext` (or null).
  - Add defensive handling for unauthorized responses without stale `isAdmin` state.
  **Must NOT do**:
  - Must not change `/api/auth/me` payload contract.
  - Must not hardcode admin flags in UI state.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: focused front-end logic correction.
  - Skills: `[]` — Reason: no special skill required.
  - Omitted: `playwright` — Reason: runtime browser checks are covered in QA scenarios.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3, 6, 7, 8, 10, 13 | Blocked By: none

  **References**:
  - Pattern: `components/app-shell.jsx:167-171` — correct `/api/auth/me` unwrapping via `data?.user`.
  - Bug site: `app/machine/page.jsx:372-378` — currently sets whole response as `currentUser`.
  - Gate usage: `app/machine/page.jsx:133` — `isAdmin` derived from `currentUser?.is_admin`.
  - API contract: `app/api/auth/me/route.js:10` — returns `{ ok: true, user: auth }`.

  **Acceptance Criteria**:
  - [ ] Machine page `isAdmin` becomes true for real admin session without any UI hacks.
  - [ ] `npm run typecheck` passes after change.

  **QA Scenarios**:
  ```
  Scenario: Happy path - admin envelope unwrapped
    Tool: Playwright
    Steps: Login as admin001; open /machine; verify raw JSON panel renders in results card instead of hidden text.
    Expected: JSON `<pre>` visible for device info block; hidden-for-non-admin text absent.
    Evidence: .sisyphus/evidence/task-1-auth-envelope-fix.png

  Scenario: Failure/edge - unauthorized session
    Tool: Playwright
    Steps: Clear session/cookies; open /machine; observe redirect/forbidden handling.
    Expected: No stale admin JSON content appears; user is redirected/blocked per current route guard.
    Evidence: .sisyphus/evidence/task-1-auth-envelope-fix-error.png
  ```

  **Commit**: YES | Message: `fix(machine): unwrap auth me response.user for admin gating` | Files: `app/machine/page.jsx`

- [ ] 2. Add deterministic `ADMIN001` elevation verification flow (seed + role/session checks)

  **What to do**:
  - Add a reproducible verification checklist/script notes for fixture execution and admin role assertions.
  - Validate that `seed-v3-role-fixtures` ran with `--execute` in target env.
  - Verify `/api/auth/me` response includes `user.is_admin=true` for `admin001`.
  **Must NOT do**:
  - Must not alter production auth policy.
  - Must not rely on uppercase/lowercase assumptions without explicit test evidence.

  **Recommended Agent Profile**:
  - Category: `testing` — Reason: this task is verification-oriented.
  - Skills: `[]` — Reason: command and API verification only.
  - Omitted: `visual-engineering` — Reason: no UI construction work.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 13 | Blocked By: none

  **References**:
  - Fixture source: `scripts/seed-v3-role-fixtures.mjs:11-15` — admin fixture (`admin001`, role `admin`).
  - Execute flag: `scripts/seed-v3-role-fixtures.mjs:61,453` — dry-run unless `--execute` used.
  - Role bind upserts: `scripts/seed-v3-role-fixtures.mjs:177-184,329-341`.
  - Auth derivation: `lib/auth-session.ts:223-249,375-387`.
  - Runbook: `docs/learning/migration-v3-runbook.md:95-99`.

  **Acceptance Criteria**:
  - [ ] Evidence shows fixture execution mode and resulting admin auth context for `admin001`.
  - [ ] Evidence shows machine page receives admin session shape expected by task 1.

  **QA Scenarios**:
  ```
  Scenario: Happy path - fixture applied, admin role resolved
    Tool: Bash
    Steps: Run seed command with execute flag in target env; call /api/auth/me after admin login.
    Expected: Response contains `ok: true` and `user.is_admin: true`.
    Evidence: .sisyphus/evidence/task-2-admin001-elevation.json

  Scenario: Failure/edge - fixture not executed
    Tool: Bash
    Steps: Validate environment where seed ran in dry-run only; attempt same admin check.
    Expected: Verification report marks failure and identifies missing execute step.
    Evidence: .sisyphus/evidence/task-2-admin001-elevation-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: evidence/report only

- [ ] 3. Introduce Machine page tab architecture mapped to `easylink.ps1` operation groups

  **What to do**:
  - Add top-level tab state and render sections as tab panels without changing API behavior.
  - Map tabs to PS1 groups:
    - Device Info & Time (`Get-DeviceInfo`, `Sync-DateTime`)
    - Scanlogs (`Get-ScanlogNew`, `Get-ScanlogAll`, optional GPS queue controls if existing)
    - Users Manipulation (`Get-UserAll`, `Set-User`)
    - Danger Zone (placeholder only in this scope)
  - Keep queue status and polling state centralized to avoid duplicate network loops.
  - Ensure new tab labels/strings have valid i18n keys for supported locales.
  **Must NOT do**:
  - Must not duplicate polling per tab.
  - Must not add new endpoints/actions beyond existing machine/scanlog capabilities.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: page-level state and component organization.
  - Skills: `[]` — Reason: existing framework patterns are local.
  - Omitted: `refactorer` — Reason: targeted re-organization, not broad refactor.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6, 7, 8, 9, 10, 11, 13 | Blocked By: 1

  **References**:
  - Existing machine sections: `app/machine/page.jsx:643-1120`.
  - Queue/polling constraints: `app/machine/page.jsx:401-610`.
  - PS1 operation catalog: `docs/learning/easylink.ps1` (normal menu operations + danger ops).
  - Existing schedule tab UX pattern: `app/schedule/page.jsx:620-879`.

  **Acceptance Criteria**:
  - [ ] Machine page shows 4 tabs with deterministic labels/order.
  - [ ] Existing actions still execute and queue updates still function.
  - [ ] No duplicate polling timers/streams created by tab switching.

  **QA Scenarios**:
  ```
  Scenario: Happy path - tab navigation with preserved state
    Tool: Playwright
    Steps: Login admin001; open /machine; switch across all tabs; trigger one action in each of first three tabs.
    Expected: Correct panel content appears per tab; job queue updates continue across tab switches.
    Evidence: .sisyphus/evidence/task-3-machine-tabs.mp4

  Scenario: Failure/edge - rapid tab switching during active queue
    Tool: Playwright
    Steps: Start machine queue action; rapidly switch tabs 10+ times.
    Expected: No duplicate toasts/jobs/pollers; queue state remains consistent.
    Evidence: .sisyphus/evidence/task-3-machine-tabs-error.mp4
  ```

  **Commit**: YES | Message: `refactor(machine): organize machine operations into ps1-aligned tabs` | Files: `app/machine/page.jsx`, related local components if extracted

- [ ] 4. Convert right ops sidebar layout behavior from content-reserving to overlay

  **What to do**:
  - Remove permanent main-content right reservation tied to sidebar visibility.
  - Keep sidebar as fixed/overlay surface when opened.
  - Preserve existing collapse/expand and admin-only display logic.
  - Keep default breakpoint behavior: right ops sidebar remains `xl` desktop feature; below `xl` remains hidden in current scope.
  **Must NOT do**:
  - Must not remove admin gating for right ops sidebar.
  - Must not break left-nav offset behavior.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: layout behavior and responsive UX.
  - Skills: `[]` — Reason: implementation is local CSS/class orchestration.
  - Omitted: `security` — Reason: no auth-policy changes in this task.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 11, 13 | Blocked By: none

  **References**:
  - Content reservation: `components/app-shell.jsx:275` (`showRightSidebar && 'xl:mr-80'`).
  - Sidebar mount: `components/app-shell.jsx:280-286`.
  - Sidebar width behavior: `components/right-ops-sidebar.jsx:218-222`.

  **Acceptance Criteria**:
  - [ ] Opening right bar no longer shrinks page content width.
  - [ ] Sidebar remains interactive and visible as overlay.

  **QA Scenarios**:
  ```
  Scenario: Happy path - overlay behavior on xl desktop
    Tool: Playwright
    Steps: Login admin001; open page with wide content; toggle right sidebar open/close.
    Expected: Main content width remains constant; sidebar overlays on top.
    Evidence: .sisyphus/evidence/task-4-rightbar-overlay.png

  Scenario: Failure/edge - interaction layering
    Tool: Playwright
    Steps: Open sidebar and try clicking underlying content through sidebar area.
    Expected: Click-through does not occur where overlay covers content.
    Evidence: .sisyphus/evidence/task-4-rightbar-overlay-error.png
  ```

  **Commit**: YES | Message: `feat(layout): switch right ops sidebar to overlay behavior` | Files: `components/app-shell.jsx`, `components/right-ops-sidebar.jsx`

- [ ] 5. Expand schedule page layout to fill available screen width under overlay model

  **What to do**:
  - Adjust schedule page outer layout classes/components so content fills width previously lost to right reservation.
  - Ensure horizontal overflow areas (e.g., punches table, schedule grid) remain usable.
  - Keep existing tab logic and data behavior unchanged.
  **Must NOT do**:
  - Must not rewrite schedule business logic.
  - Must not introduce fixed widths that regress smaller breakpoints.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: responsive layout tuning.
  - Skills: `[]` — Reason: page-local class/layout updates.
  - Omitted: `implementation` — Reason: no API/state redesign required.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 11, 13 | Blocked By: none

  **References**:
  - Schedule tab panel area and table overflow: `app/schedule/page.jsx:620-879`.
  - App-shell width reservation interaction: `components/app-shell.jsx:275`.

  **Acceptance Criteria**:
  - [ ] Schedule page uses full available content width.
  - [ ] Punches/import/plan panels remain readable and scrollable where needed.

  **QA Scenarios**:
  ```
  Scenario: Happy path - full-width schedule rendering
    Tool: Playwright
    Steps: Open /schedule at desktop viewport with and without right sidebar open.
    Expected: Main schedule content width remains maximized and stable.
    Evidence: .sisyphus/evidence/task-5-schedule-full-width.png

  Scenario: Failure/edge - small viewport regression
    Tool: Playwright
    Steps: Resize to tablet width; traverse all schedule tabs.
    Expected: No clipped controls; overflow areas remain interactable.
    Evidence: .sisyphus/evidence/task-5-schedule-full-width-error.png
  ```

  **Commit**: YES | Message: `feat(schedule): maximize schedule layout width under overlay sidebar` | Files: `app/schedule/page.jsx`, optional schedule subcomponents

- [ ] 6. Build Scanlogs tab content from existing machine scanlog controls (PS1-aligned)

  **What to do**:
  - Move existing scanlog action controls/results into dedicated Scanlogs tab panel.
  - Preserve existing modes (`new`/`all`) and queue submission behavior.
  - Label panel terminology to match PS1 operation language where practical.
  **Must NOT do**:
  - Must not change scanlog API contracts.
  - Must not alter admin-only backend policy.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: section migration within machine page.
  - Skills: `[]` — Reason: reuse existing handlers/state.
  - Omitted: `security` — Reason: no permission model change here.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13 | Blocked By: 1, 3

  **References**:
  - Existing scanlog controls/results: `app/machine/page.jsx:900-1012`.
  - Queue action submit path: `app/machine/page.jsx:338-370`.
  - PS1 scanlog ops: `docs/learning/easylink.ps1` (`Get-ScanlogNew`, `Get-ScanlogAll`).

  **Acceptance Criteria**:
  - [ ] Scanlogs tab exposes existing scanlog controls and queue statuses.
  - [ ] Triggered scanlog actions still appear in machine/scanlog queues.

  **QA Scenarios**:
  ```
  Scenario: Happy path - queue scanlog new/all from tab
    Tool: Playwright
    Steps: In Scanlogs tab, submit NEW then ALL mode pulls with valid inputs.
    Expected: Success toasts and queue entries appear; status updates continue.
    Evidence: .sisyphus/evidence/task-6-scanlogs-tab.mp4

  Scenario: Failure/edge - invalid range/limits
    Tool: Playwright
    Steps: Submit invalid date range or impossible limits.
    Expected: Validation/error feedback appears; no broken UI state.
    Evidence: .sisyphus/evidence/task-6-scanlogs-tab-error.png
  ```

  **Commit**: YES | Message: `refactor(machine): move scanlog operations into dedicated tab` | Files: `app/machine/page.jsx`

- [ ] 7. Build Users Manipulation tab from existing user pull/set controls (PS1-aligned)

  **What to do**:
  - Move user synchronization and `set_user` form controls into Users Manipulation tab.
  - Keep existing validation and API invocation path unchanged.
  - Surface result summaries consistently in tab.
  **Must NOT do**:
  - Must not widen user-management permission beyond existing policy.
  - Must not modify payload schema for existing user actions.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: UI regrouping with existing state handlers.
  - Skills: `[]` — Reason: no new external API needed.
  - Omitted: `refactorer` — Reason: localized page composition only.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13 | Blocked By: 1, 3

  **References**:
  - Existing set-user form and pull users controls: `app/machine/page.jsx:650-830`.
  - Machine action submit function: `app/machine/page.jsx:338-370`.
  - PS1 user ops: `docs/learning/easylink.ps1` (`Get-UserAll`, `Set-User`).

  **Acceptance Criteria**:
  - [ ] Users Manipulation tab supports existing pull users and add/update user flows.
  - [ ] Result/feedback messaging remains accurate and localized.

  **QA Scenarios**:
  ```
  Scenario: Happy path - user pull and set in one tab
    Tool: Playwright
    Steps: Open Users tab; run pull users; submit valid set-user form.
    Expected: Actions enqueue/complete with success feedback and no console errors.
    Evidence: .sisyphus/evidence/task-7-users-tab.mp4

  Scenario: Failure/edge - invalid user input
    Tool: Playwright
    Steps: Submit set-user form with missing/invalid required fields.
    Expected: Validation or server error displayed gracefully; UI remains usable.
    Evidence: .sisyphus/evidence/task-7-users-tab-error.png
  ```

  **Commit**: YES | Message: `refactor(machine): move user operations into users manipulation tab` | Files: `app/machine/page.jsx`

- [ ] 8. Build Device Info & Time tab from existing info/time/sync blocks (PS1-aligned)

  **What to do**:
  - Move device info/time actions and result cards into dedicated Device Info & Time tab.
  - Keep current machine-time sync request behavior unchanged.
  - Keep task-12 device info artifact access within this tab context.
  **Must NOT do**:
  - Must not change server-side action semantics.
  - Must not introduce duplicated result state containers.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: deterministic section migration.
  - Skills: `[]` — Reason: no additional framework needed.
  - Omitted: `testing` — Reason: dedicated QA in scenario block and Task 13.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13 | Blocked By: 1, 3

  **References**:
  - Existing device info/time controls and result cards: `app/machine/page.jsx:643-760,1036-1063`.
  - Task-12 devinfo artifact region: `app/machine/page.jsx:933-950`.
  - PS1 functions: `docs/learning/easylink.ps1` (`Get-DeviceInfo`, `Sync-DateTime`).

  **Acceptance Criteria**:
  - [ ] Device Info & Time tab contains all existing info/time controls and outputs.
  - [ ] Admin JSON view appears correctly after Task 1 fix.

  **QA Scenarios**:
  ```
  Scenario: Happy path - fetch info and sync time
    Tool: Playwright
    Steps: Open Device tab; trigger info/time/sync-time actions with valid values.
    Expected: Queue/actions complete and device/time outputs update.
    Evidence: .sisyphus/evidence/task-8-device-time-tab.mp4

  Scenario: Failure/edge - device communication failure
    Tool: Playwright
    Steps: Simulate failed backend/device response for info/time action.
    Expected: Error messaging shown; tab remains stable.
    Evidence: .sisyphus/evidence/task-8-device-time-tab-error.png
  ```

  **Commit**: YES | Message: `refactor(machine): move device info and time operations into dedicated tab` | Files: `app/machine/page.jsx`

- [ ] 9. Add Danger Zone tab placeholder (no destructive execution changes)

  **What to do**:
  - Add Danger Zone tab label and placeholder panel content.
  - Keep current destructive actions disabled/unmoved unless already present; display explicit “placeholder / future work” messaging.
  - Keep confirmation phrase mechanics unchanged where existing.
  **Must NOT do**:
  - Must not add new destructive actions/endpoints.
  - Must not remove existing confirmation safeguards.

  **Recommended Agent Profile**:
  - Category: `implementation` — Reason: limited UI structuring task.
  - Skills: `[]` — Reason: local page update.
  - Omitted: `security-auditor` — Reason: no policy expansion here.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13 | Blocked By: 3

  **References**:
  - Existing danger section: `app/machine/page.jsx:1013-1029`.
  - Confirmation modal mechanics: `app/machine/page.jsx:525-610,1178-1278`.
  - PS1 danger operations catalog: `docs/learning/easylink.ps1` (menu actions 8-13).

  **Acceptance Criteria**:
  - [ ] Danger Zone tab exists and clearly marked placeholder.
  - [ ] No new destructive behavior is introduced.

  **QA Scenarios**:
  ```
  Scenario: Happy path - placeholder visible
    Tool: Playwright
    Steps: Open Machine page; switch to Danger Zone tab.
    Expected: Placeholder guidance renders; no new destructive controls appear.
    Evidence: .sisyphus/evidence/task-9-danger-placeholder.png

  Scenario: Failure/edge - accidental destructive trigger regression
    Tool: Playwright
    Steps: Scan UI for newly exposed destructive controls and attempt accidental interaction.
    Expected: Existing confirmation protections remain intact; no unintended execution path.
    Evidence: .sisyphus/evidence/task-9-danger-placeholder-error.png
  ```

  **Commit**: YES | Message: `feat(machine): add danger zone tab placeholder` | Files: `app/machine/page.jsx`, i18n labels if applicable

- [ ] 10. Simplify non-admin JSON viewer UX while preserving admin-only raw data policy

  **What to do**:
  - Keep raw JSON `<pre>` admin-only as policy-consistent behavior.
  - For non-admin views, replace repetitive hidden blocks with concise summary/fallback copy and key non-sensitive status values.
  - Ensure seeded/admin users see raw JSON after Task 1 fix.
  **Must NOT do**:
  - Must not expose raw machine/scanlog payloads to non-admin users.
  - Must not create inconsistent behavior between cards.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UX simplification and consistency.
  - Skills: `[]` — Reason: no backend change required.
  - Omitted: `implementation` — Reason: mostly presentational harmonization.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13 | Blocked By: 1, 3

  **References**:
  - Repeated non-admin hidden text blocks: `app/machine/page.jsx:950,1047,1068,1082,1098`.
  - Admin policy source: `docs/learning/role-capability-matrix.md` (machine/scanlog admin-only).
  - Backend guard references: `app/api/machine/route.js`, `app/api/scanlog/route.js`, `app/api/scanlog/sync/route.js`, `app/api/scanlog/stream/route.js`.

  **Acceptance Criteria**:
  - [ ] Non-admin experience is simplified and consistent across result cards.
  - [ ] Raw JSON remains visible only for admin sessions.

  **QA Scenarios**:
  ```
  Scenario: Happy path - admin retains raw JSON visibility
    Tool: Playwright
    Steps: Login admin001; open Machine tabs with result cards.
    Expected: Raw JSON `<pre>` visible where applicable.
    Evidence: .sisyphus/evidence/task-10-json-ux-admin.png

  Scenario: Failure/edge - non-admin cannot access raw JSON
    Tool: Playwright
    Steps: Login non-admin account; inspect same result cards and attempt direct admin-only API calls.
    Expected: UI shows simplified fallback; APIs return 403 for admin-only routes.
    Evidence: .sisyphus/evidence/task-10-json-ux-nonadmin-error.json
  ```

  **Commit**: YES | Message: `refactor(machine): simplify non-admin result views while keeping raw-json admin-only` | Files: `app/machine/page.jsx`, related translations

- [ ] 11. Harden overlay interactions (z-index, focus, escape, modal coexistence)

  **What to do**:
  - Validate/fix stacking order between right sidebar overlay and machine confirmation modal.
  - Ensure focus behavior is predictable when sidebar opens/closes.
  - Ensure ESC and close actions work without trapping users.
  **Must NOT do**:
  - Must not break existing modal confirmation flow.
  - Must not allow pointer/focus leaks through overlay-covered region.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: interaction-layer robustness.
  - Skills: `[]` — Reason: local UI behavior checks.
  - Omitted: `security` — Reason: no auth-policy modification.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 13 | Blocked By: 4, 5, 3

  **References**:
  - Sidebar container: `components/right-ops-sidebar.jsx:218+`.
  - Main/layout wrapper classes: `components/app-shell.jsx:272-286`.
  - Machine confirm modal: `app/machine/page.jsx:1178-1278`.

  **Acceptance Criteria**:
  - [ ] Overlay and modal stack correctly in all supported breakpoints.
  - [ ] Keyboard and pointer interactions are deterministic.

  **QA Scenarios**:
  ```
  Scenario: Happy path - overlay + modal coexistence
    Tool: Playwright
    Steps: Open right sidebar; trigger machine confirm modal; interact with both close paths.
    Expected: Correct top-layer element gets focus; no deadlock.
    Evidence: .sisyphus/evidence/task-11-overlay-modal.mp4

  Scenario: Failure/edge - ESC/focus trap regression
    Tool: Playwright
    Steps: Use keyboard-only navigation with sidebar open and modal active.
    Expected: ESC closes expected layer, focus returns to trigger, no trapped focus.
    Evidence: .sisyphus/evidence/task-11-overlay-modal-error.mp4
  ```

  **Commit**: YES | Message: `fix(layout): harden right-overlay interaction and modal layering` | Files: `components/app-shell.jsx`, `components/right-ops-sidebar.jsx`, optional machine modal wrappers

- [ ] 12. Reconcile pending machine-connect tasks from docs and existing plans into execution checklist

  **What to do**:
  - Audit `.sisyphus/plans/machine-connect-tabs-performance.md` and docs follow-up notes.
  - Produce a reconciliation section mapping each relevant pending item to: implemented now / deferred / out-of-scope.
  - Attach this mapping to PR notes or plan execution evidence.
  **Must NOT do**:
  - Must not silently drop pending items relevant to machine/rightbar/schedule scope.
  - Must not include unrelated architecture cleanup items as mandatory in this execution.

  **Recommended Agent Profile**:
  - Category: `review` — Reason: traceability and scope control.
  - Skills: `[]` — Reason: documentation reconciliation task.
  - Omitted: `implementation` — Reason: no code changes required.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 13 | Blocked By: none

  **References**:
  - Pending source plan: `.sisyphus/plans/machine-connect-tabs-performance.md`.
  - Related pending docs: `docs/learning/pagination_rollout_metrics.md`, `docs/learning/more_deep_restructure.md`.

  **Acceptance Criteria**:
  - [ ] Reconciliation artifact exists with explicit status for each relevant pending item.
  - [ ] Deferred items include rationale and follow-up owner/path.

  **QA Scenarios**:
  ```
  Scenario: Happy path - complete reconciliation map
    Tool: Bash
    Steps: Generate checklist mapping from source docs/plans into evidence artifact.
    Expected: Every relevant pending item has a disposition and rationale.
    Evidence: .sisyphus/evidence/task-12-pending-reconciliation.md

  Scenario: Failure/edge - missing source coverage
    Tool: Bash
    Steps: Validate reconciliation against source file list.
    Expected: Validation flags any source item not mapped.
    Evidence: .sisyphus/evidence/task-12-pending-reconciliation-error.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: evidence/report only

- [ ] 13. Integrated regression verification for auth roles, tabs, overlay layout, and schedule width

  **What to do**:
  - Execute end-to-end validation matrix across admin and non-admin sessions.
  - Verify machine tabs, JSON visibility policy, queue behaviors, overlay layout, and schedule full-width.
  - Capture evidence artifacts and summarize pass/fail with remediation notes.
  **Must NOT do**:
  - Must not conclude completion without evidence files.
  - Must not skip non-admin negative tests.

  **Recommended Agent Profile**:
  - Category: `testing` — Reason: cross-cutting verification task.
  - Skills: `[]` — Reason: QA execution and evidence only.
  - Omitted: `implementation` — Reason: this task validates, not builds.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: none | Blocked By: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

  **References**:
  - Auth contract and parsing: `app/api/auth/me/route.js:10`, `app/machine/page.jsx:372-378`, `components/app-shell.jsx:167-171`.
  - Admin policy/API guards: `app/api/machine/route.js`, `app/api/scanlog/route.js`, `app/api/scanlog/sync/route.js`, `app/api/scanlog/stream/route.js`.
  - Tabs/layout targets: `app/machine/page.jsx`, `components/app-shell.jsx`, `components/right-ops-sidebar.jsx`, `app/schedule/page.jsx`.

  **Acceptance Criteria**:
  - [ ] Full QA matrix executed with evidence for both admin and non-admin personas.
  - [ ] `npm run typecheck` and `npm run build` pass.
  - [ ] No blocker/sev1 regressions remain.

  **QA Scenarios**:
  ```
  Scenario: Happy path - admin full flow
    Tool: Playwright + Bash
    Steps: Login admin001; validate all machine tabs/actions, right overlay, schedule width; run typecheck/build.
    Expected: All flows pass and commands succeed.
    Evidence: .sisyphus/evidence/task-13-integrated-regression-admin.md

  Scenario: Failure/edge - non-admin policy enforcement
    Tool: Playwright + Bash
    Steps: Login non-admin; verify simplified UI and API 403 on admin-only endpoints.
    Expected: No raw JSON exposure, no unauthorized machine API execution.
    Evidence: .sisyphus/evidence/task-13-integrated-regression-nonadmin-error.md

  Scenario: Failure/edge - session expiry or role downgrade during active machine page
    Tool: Playwright
    Steps: Open /machine as admin, then invalidate session or downgrade role and refresh/re-poll.
    Expected: UI re-evaluates role correctly, admin-only JSON/actions disappear, backend remains 401/403 consistent.
    Evidence: .sisyphus/evidence/task-13-session-transition-error.md
  ```

  **Commit**: NO | Message: `n/a` | Files: evidence/report only

## Final Verification Wave (4 parallel agents, ALL must APPROVE)
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Atomic commits by concern:
  - `fix(machine): align auth me envelope parsing for admin gating`
  - `refactor(machine): split machine operations into ps1-aligned tabs`
  - `feat(layout): switch right ops sidebar to overlay behavior`
  - `feat(schedule): expand schedule page content width`
  - `docs(plan): reconcile pending machine-connect backlog references`

## Success Criteria
- `ADMIN001` session consistently resolves as admin when fixtures are correctly applied.
- Machine JSON/result visibility behavior matches role policy and backend guards.
- Right bar overlay UX does not reduce page content width and passes interaction regressions.
- Schedule page uses available screen space effectively.
- Pending machine-connect items have explicit reconciliation status in execution outputs.
