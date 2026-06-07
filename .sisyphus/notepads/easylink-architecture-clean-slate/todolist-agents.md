# Remaining TODO List with Agent Assignments

Plan: `.sisyphus/plans/easylink-architecture-clean-slate.md`  
Session: `ses_2bc6ef232ffe5rmoSSEmjh9z7p`  
Updated: 2026-03-31

## Progress Snapshot
- Completed checkboxes: **59**
- Remaining checkboxes: **32**
- First unchecked checkbox: **Task 11 Acceptance #1** (`Reconciliation produces deterministic delta report`)

---

## Remaining Work (Grouped by Task)

### Task 11 — Deterministic Safe/Legacy Reconciliation Service
**Recommended agent**: `testing`

- [ ] Reconciliation produces deterministic delta report.
- [ ] Replay resolves known deltas idempotently.
- [ ] Cutover blocked when deltas above threshold.

### Task 12 — Machine Core Parity Cards (`easylinkv2.ps1` Set)
**Recommended agent**: `visual-engineering`

- [ ] One card per approved `easylinkv2.ps1` function.
- [ ] Card actions map one-to-one to API handlers.
- [ ] Streaming user paging exposes progress + partial-save checkpoints + bounded queue behavior.

### Task 13 — Admin Punch Review, Normalization, and Tagging Workflow
**Recommended agent**: `security`

- [ ] Admin can set/modify review normalization and tagging fields with reason notes.
- [ ] Audit metadata persisted for every tagging/normalization mutation.
- [ ] Non-admin review mutation requests always forbidden.

### Task 14 — Foldable Admin Right Sidebar + Lazy Accordion Logs
**Recommended agent**: `visual-engineering`

- [ ] Sidebar folds/unfolds and state persists.
- [ ] Collapsed mode suppresses heavy polling.
- [ ] Accordion loads details on demand.
- [ ] Theme source-of-truth remains root-level class/token state (no component-local color authority drift).
- [ ] Table fallback remount runs at most once per failed toggle check and logs fallback event.

### Task 15 — Enforce Admin-Only Machine Module End-to-End
**Recommended agent**: `security`

- [ ] Non-admin users cannot see machine nav entry.
- [ ] Non-admin route access to `/machine` is blocked/redirected.
- [ ] Non-admin machine API calls return 403 consistently.

### Task 16 — Leader/Employee Scope Partition Implementation
**Recommended agent**: `implementation`

- [ ] Leader scope contains planning/schedule management plus cumulative + monthly prediction.
- [ ] Employee scope contains group schedule + cumulative + monthly prediction.
- [ ] Discipline/review details hidden for non-admin.

### Task 17 — Interactive Reporting Upgrade (Pie/Bar/Drilldown)
**Recommended agent**: `visual-engineering`

- [ ] Pie/bar charts support click drilldown and monthly target/prediction overlays.
- [ ] Role-scoped reporting payloads are enforced.
- [ ] Drilldown endpoints are bounded and paginated.
- [ ] Chart target lines/bands read from config-driven monthly target source with visible source attribution.

### Task 18 — Performance, Localization, and Readability Hardening
**Recommended agent**: `review`

- [ ] Payload budget policy enforced by API responses.
- [ ] Large list/log rendering uses incremental/virtualized strategy.
- [ ] EN/ID localization coverage meets required screen/key thresholds.
- [ ] Readability standards (contrast + minimum font-size) pass in light and dark mode.
- [ ] Light theme text tokens avoid gray-on-light primary text and meet contrast threshold for table/body text.
- [ ] Light background token uses slightly off-white value for readability comfort.
- [ ] Key table/filter/button/select surfaces consume global semantic classes instead of repeated page-level utility chains.
- [ ] p95 latency/frame-budget targets meet defined thresholds.

---

## Execution Order (Critical)
1. Task 11 closeout (acceptance evidence + gate checks)
2. Task 12 acceptance closure
3. Task 13 acceptance closure
4. Task 14 acceptance closure
5. Tasks 15 → 18 acceptance closure sequence

## Notes
- This checklist tracks **unchecked plan checkboxes** (acceptance criteria), not task header status alone.
- Before each delegation, read:
  - `.sisyphus/notepads/easylink-architecture-clean-slate/learnings.md`
  - `.sisyphus/notepads/easylink-architecture-clean-slate/decisions.md`
  - `.sisyphus/notepads/easylink-architecture-clean-slate/issues.md`
  - `.sisyphus/notepads/easylink-architecture-clean-slate/problems.md`
