# F1 — Plan Compliance Audit

**Auditor**: oracle agent (claude-opus-4.6)
**Date**: 2026-04-25
**Canonical Plan**: .sisyphus/plans/easylink-architecture-clean-slate.md
**Master Board**: docs/agent-context/next-session-master-board.md
**Scope**: Tasks 16, 17, 18 — acceptance criteria vs actual codebase

---

## Task 16: Leader/Employee Scope Partition Implementation

**Plan Status**: Checkbox unchecked (all 3 criteria open)
**Master Board Status**: impl_state: partial, evidence_state: present, gate_state: pending

### Acceptance Criterion 16.1 — Leader scope contains planning/schedule management plus cumulative + monthly prediction

**Verdict: PASS**

Evidence in code:
- pp/attendance/page.jsx lines 1239-1269: Leader-only section renders schedule planning panel with links to /schedule (current month) and /schedule?month=next (upcoming month).
- pp/attendance/page.jsx lines 1271-1391: Shared leader+employee block renders cumulative hours panel and monthly prediction panel.
- lib/authz/authorization-adapter.ts line 31: getAttendanceScope() returns leader when can_schedule || is_leader.
- pp/api/attendance/route.js lines 188-323: Non-admin path attaches cumulative_summary and prediction_context per row.
- Evidence file .sisyphus/evidence/task-16-leader.json confirms: schedule_management current/upcoming month true, cumulative_hours_panel true, monthly_prediction_panel true.

### Acceptance Criterion 16.2 — Employee scope contains group schedule + cumulative + monthly prediction

**Verdict: PASS**

Evidence in code:
- pp/attendance/page.jsx line 231: isEmployee = attendanceScope === 'employee'.
- pp/attendance/page.jsx lines 1271-1391: Employee sees cumulative + prediction panels (same block as leader, gated by isLeader || isEmployee).
- pp/attendance/page.jsx line 1239: Leader-only schedule planning section is gated by isLeader — employee does NOT see it. Correct.
- lib/authz/authorization-adapter.ts line 32: Employee scope returns mployee when can_dashboard || canonical_roles.includes('employee').
- Evidence file .sisyphus/evidence/task-16-employee.json confirms: group_schedule_view true, cumulative_hours_panel true, monthly_prediction_panel true, leader_schedule_management_panel hidden.

### Acceptance Criterion 16.3 — Discipline/review details hidden for non-admin

**Verdict: PASS**

Evidence in code:
- pp/api/attendance/route.js lines 258-271: review_controls, note_status, note_catatan, reviewed_status, has_review, note_manual_hours, note_manual_approved are only attached when xposeReviewControls (admin-only, line 187).
- pp/api/attendance/review/route.js lines 140-142: Review queue GET is gated by canAccessAttendanceReviewQueue(auth) which resolves to admin-only.
- pp/api/attendance/review/route.js line 288: Review POST is gated by canAccessRawAttendance(auth) — admin-only.
- pp/attendance/page.jsx lines 42-43: ADMIN_TABS includes dashboard and raw; MEMBER_TABS only includes summary and quick_summaries.
- pp/attendance/page.jsx lines 395-399: Non-admin redirected away from raw and dashboard tabs.
- components/sidebar.jsx line 76: Attendance review nav item requires auth: admin.
- Evidence files confirm: review_queue_access: forbidden_non_admin, discipline_review_mutation_controls: true (hidden).

### Evidence Files

| File | Exists | Valid |
|---|---|---|
| .sisyphus/evidence/task-16-leader.json | YES | YES — covers scope visible/hidden and API partition |
| .sisyphus/evidence/task-16-employee.json | YES | YES — covers scope visible/hidden and API partition |

### Task 16 Gaps

1. **Bug — quickSummariesLoading undeclared**: pp/attendance/page.jsx uses quickSummariesLoading (lines 334, 359, 1441) and setQuickSummariesLoading but never declares const [quickSummariesLoading, setQuickSummariesLoading] = useState(false). This will cause a runtime ReferenceError when the quick_summaries tab is activated. **Severity: HIGH** — functional regression.
2. **Dashboard redirect for non-admin**: pp/page.jsx line 185-187 redirects non-admin users to /attendance. This is correct scope behavior and aligns with plan intent.

### Task 16 Overall: **PARTIAL**

All 3 acceptance criteria are met in the code logic, but a runtime bug (quickSummariesLoading undeclared) creates a functional regression that would block the quick_summaries tab for all roles.

---

## Task 17: Interactive Reporting Upgrade (Pie/Bar/Drilldown)

**Plan Status**: Checkbox unchecked (all 4 criteria open)
**Master Board Status**: impl_state: partial, evidence_state: present, gate_state: pending

### Acceptance Criterion 17.1 — Pie/bar charts support click drilldown and monthly target/prediction overlays

**Verdict: PASS**

Evidence in code:
- pp/report/page.jsx lines 247-291: SVG-based pie chart with click handler (handlePieClick) that sets drilldownState.status.
- pp/report/page.jsx lines 320-325: handlePieClick toggles status filter and resets page.
- pp/report/page.jsx lines 327-332: handleBarClick toggles group filter and resets page.
- pp/report/page.jsx lines 512-517: Monthly target line rendered on bar chart when config.scheduling.monthly_target_hours > 0.
- pp/report/page.jsx lines 540-546: Target line overlay on each bar row using CSS absolute positioning.
- Drilldown state drives API re-fetch via drilldownState.status and drilldownState.group params.

### Acceptance Criterion 17.2 — Role-scoped reporting payloads are enforced

**Verdict: PASS**

Evidence in code:
- pp/api/report/route.js lines 218-221: Auth gate requires auth.is_admin or auth.can_dashboard.
- pp/api/report/route.js lines 247-251: Group filter validated against allowedGroupIds.
- pp/api/report/route.js lines 156-158: formatDrilldownRow strips flags field for non-admin users.
- Evidence file .sisyphus/evidence/task-17-api-contract.json confirms role-scoped endpoint.

### Acceptance Criterion 17.3 — Drilldown endpoints are bounded and paginated

**Verdict: PASS**

Evidence in code:
- pp/api/report/route.js line 14: DRILLDOWN_LIMIT = 400 default.
- pp/api/report/route.js line 231: Limit capped at Math.min(1000, ...).
- pp/api/report/route.js lines 163-176: buildDrilldownPayload implements server-side pagination with page, limit, total, totalPages, truncated.
- pp/report/page.jsx lines 695-717: Client-side pagination controls with Previous/Next buttons.

### Acceptance Criterion 17.4 — Chart target lines/bands read from config-driven monthly target source with visible source attribution

**Verdict: PARTIAL**

Evidence in code:
- pp/report/page.jsx lines 154-157: Fetches /api/config alongside report data.
- pp/report/page.jsx lines 512-517: Displays target value from config.scheduling.monthly_target_hours.
- **Gap**: The target line label shows the value (e.g., Target: 160h) but does NOT show source attribution (whether from group override or global fallback). The plan requires visible source attribution for the monthly target source. The config API returns a flat value without provenance metadata.

### Evidence Files

| File | Exists | Valid |
|---|---|---|
| .sisyphus/evidence/task-17-report-ui.json | YES | YES — confirms pie/bar interactive + drilldown |
| .sisyphus/evidence/task-17-api-contract.json | YES | YES — confirms role-scoped + paginated endpoint |

### Task 17 Gaps

1. **Missing target source attribution**: Bar chart target line shows the hours value but not the source (group override vs global fallback). Plan criterion 17.4 requires visible source attribution.
2. **Hardcoded status labels**: STATUS_LABELS at line 723 of pp/report/page.jsx are English-only, not localized via getUIText(). Minor i18n gap.

### Task 17 Overall: **PARTIAL**

Criteria 17.1-17.3 are fully met. Criterion 17.4 is partially met — target line exists but lacks source attribution display.

---

## Task 18: Performance, Localization, and Readability Hardening

**Plan Status**: Checkbox unchecked (all 8 criteria open)
**Master Board Status**: impl_state: partial, evidence_state: present, gate_state: pending

### Acceptance Criterion 18.1 — Payload budget policy enforced by API responses

**Verdict: PASS**

Evidence in code:
- pp/api/report/route.js line 14: DRILLDOWN_LIMIT = 400, line 231: capped at 1000.
- Attendance raw endpoint uses server-side pagination (lines 296-311).
- Machine API uses page/limit pagination (confirmed by stress evidence).
- Evidence file .sisyphus/evidence/task-18-stress.log confirms bounded responses.

### Acceptance Criterion 18.2 — Large list/log rendering uses incremental/virtualized strategy

**Verdict: PARTIAL**

Evidence in code:
- components/right-ops-sidebar.jsx: Uses LazyAccordionSection for on-demand log expansion.
- Attendance table uses client-side pagination (rowsPerPage state, pagedSummaryRows slicing).
- Raw tab uses server-side pagination.
- **Gap**: No actual list virtualization library (react-window, react-virtualized) is used. Large datasets rely on pagination rather than virtualization. Pagination qualifies as incremental, but true virtualization is absent.

### Acceptance Criterion 18.3 — EN/ID localization coverage meets required screen/key thresholds

**Verdict: PASS**

Evidence in code:
- lib/localization/ui-texts.js: Contains both en and id locale blocks (1074 lines total).
- ID block starts at line 520 with full translations for loginPage, reportPage, attendancePage, sidebar, etc.
- All major pages use locale-aware t() function.
- Evidence file .sisyphus/evidence/task-18-i18n-readability.json confirms localization keys verified.

### Acceptance Criterion 18.4 — Readability standards (contrast + minimum font-size) pass in light and dark mode

**Verdict: PASS**

Evidence in code:
- pp/globals.css line 92: Light mode --background: 210 20% 98% (off-white, approx #f5f7fa).
- pp/globals.css line 93: Light mode --foreground: 222 47% 11% (dark text, approx #0f172a).
- pp/globals.css line 103: Light mode --muted-foreground: 220 9% 42% (approx #64748b, ~4.6:1 contrast ratio).
- .ui-readable-body uses clamp(0.9375rem, ...) (15px floor), .ui-readable-muted uses clamp(0.8125rem, ...) (13px floor).
- Evidence confirms minimum_font_size_px: 13.

### Acceptance Criterion 18.5 — Light theme text tokens avoid gray-on-light primary text and meet contrast threshold

**Verdict: PASS**

Evidence in code:
- pp/globals.css lines 155-170: Light mode overrides map slate utilities to darker values (text-white to rgb(15 23 42), text-slate-400/500 to rgb(71 85 105)).
- --muted-foreground in light mode is 220 9% 42% — medium-dark gray, not low-contrast.
- --foreground in light mode is 222 47% 11% — near-black, high contrast.

### Acceptance Criterion 18.6 — Light background token uses slightly off-white value for readability comfort

**Verdict: PASS**

Evidence in code:
- pp/globals.css line 92: --background: 210 20% 98% — HSL(210, 20%, 98%) resolves to approximately #f5f7fa, a slightly blue-tinted off-white. NOT pure #FFFFFF.
- Evidence confirms light_mode_background_hex: 210 20% 98%.

### Acceptance Criterion 18.7 — Key table/filter/button/select surfaces consume global semantic classes

**Verdict: PASS**

Evidence in code:
- pp/globals.css lines 496-549 and 820-888: Defines .panel-card, .table-shell, .table-head-cell, .table-cell, .control-input, .control-select, .pill-button, .btn-action, .btn-outline, .btn-danger — all 10 required classes.
- pp/globals.css lines 552-796: Defines ui-prefixed semantic primitives (ui-page-shell, ui-card-shell, ui-table-shell, ui-table-head-cell, ui-table-cell, ui-control-input, ui-control-select, ui-btn-primary, ui-btn-secondary).
- Report and attendance pages consume these classes throughout.
- Evidence file .sisyphus/evidence/task-18-ui-perf.json confirms components refactored and using global classes.

### Acceptance Criterion 18.8 — p95 latency/frame-budget targets meet defined thresholds

**Verdict: PARTIAL**

Evidence in code:
- No explicit p95 latency threshold is defined or measured in the codebase.
- .sisyphus/evidence/task-18-stress.log shows probe latencies (e.g., 1463ms for /api/auth/me, 643ms for /api/machine) but these are dev-server measurements, not production p95 benchmarks.
- .sisyphus/evidence/task-18-ui-perf.json lists refactored components but contains no frame-budget or latency measurements.
- **Gap**: No formal p95 latency or frame-budget measurement exists.

### Evidence Files

| File | Exists | Valid |
|---|---|---|
| .sisyphus/evidence/task-18-i18n-readability.json | YES | YES — confirms contrast, font-size, semantic classes, localization keys |
| .sisyphus/evidence/task-18-ui-perf.json | YES | PARTIAL — lists refactored components but no perf measurements |
| .sisyphus/evidence/task-18-stress.log | YES | YES — confirms bounded API responses |

### Task 18 Gaps

1. **No list virtualization**: Pagination is used instead of virtualization. Acceptable as incremental but not virtualized.
2. **No p95/frame-budget measurement**: Evidence lacks formal performance benchmarks.
3. **Dashboard page not localized**: pp/page.jsx contains hardcoded Indonesian/English strings (Dashboard Absensi, Total Karyawan, Hadir Hari Ini) not routed through getUIText().

### Task 18 Overall: **PARTIAL**

Criteria 18.3-18.7 are fully met. Criterion 18.1 is met. Criteria 18.2 and 18.8 are partially met due to missing virtualization and formal perf benchmarks.

---

## Cross-Task Issues

1. **quickSummariesLoading undeclared state** (Task 16): pp/attendance/page.jsx calls setQuickSummariesLoading() and reads quickSummariesLoading but never declares the state variable. This is a runtime crash bug affecting the quick_summaries tab for all roles.
2. **Dashboard page (app/page.jsx) not localized** (Task 18): Hardcoded strings bypass the localization system.
3. **Report page STATUS_LABELS not localized** (Task 17): English-only status labels in pp/report/page.jsx.

---

## Summary Verdict Table

| Task | Criterion | Verdict | Notes |
|---|---|---|---|
| 16 | 16.1 Leader scope | **PASS** | Schedule planning + cumulative + prediction all present |
| 16 | 16.2 Employee scope | **PASS** | Group schedule + cumulative + prediction present, no leader panel |
| 16 | 16.3 Discipline hidden | **PASS** | Review controls admin-only in API and UI |
| 16 | Evidence files | **PASS** | Both task-16-leader.json and task-16-employee.json exist and are valid |
| 16 | **Overall** | **PARTIAL** | Runtime bug: quickSummariesLoading undeclared |
| 17 | 17.1 Pie/bar drilldown | **PASS** | SVG pie + bar with click handlers + target overlay |
| 17 | 17.2 Role-scoped payloads | **PASS** | Auth gate + field stripping for non-admin |
| 17 | 17.3 Bounded drilldown | **PASS** | Server-side pagination with limit cap |
| 17 | 17.4 Target source attribution | **PARTIAL** | Target line present but no source provenance display |
| 17 | Evidence files | **PASS** | Both task-17-report-ui.json and task-17-api-contract.json exist |
| 17 | **Overall** | **PARTIAL** | Missing target source attribution |
| 18 | 18.1 Payload budget | **PASS** | Pagination and limits enforced |
| 18 | 18.2 Virtualization | **PARTIAL** | Pagination yes, virtualization no |
| 18 | 18.3 EN/ID localization | **PASS** | Both locales present with coverage |
| 18 | 18.4 Readability standards | **PASS** | Contrast and font-size thresholds met |
| 18 | 18.5 Light text contrast | **PASS** | No gray-on-light primary text |
| 18 | 18.6 Off-white background | **PASS** | HSL(210, 20%, 98%) — not pure white |
| 18 | 18.7 Global semantic classes | **PASS** | All 10 required classes defined and consumed |
| 18 | 18.8 p95/frame-budget | **PARTIAL** | No formal measurement exists |
| 18 | Evidence files | **PASS** | All 3 evidence files exist |
| 18 | **Overall** | **PARTIAL** | Missing virtualization and perf benchmarks |

---

## Overall Audit Verdict: **PARTIAL**

All three tasks have their core acceptance criteria substantially met in the codebase, but each has at least one gap preventing a full PASS:

- **Task 16**: Runtime bug (quickSummariesLoading undeclared) — fix is a one-line useState addition.
- **Task 17**: Missing target source attribution on chart overlay — requires config API to return provenance metadata.
- **Task 18**: No list virtualization and no formal p95/frame-budget measurement.

### Recommended Actions to Close

1. Add const [quickSummariesLoading, setQuickSummariesLoading] = useState(false); to pp/attendance/page.jsx.
2. Add target source attribution to the bar chart target line label in pp/report/page.jsx.
3. Localize hardcoded strings in pp/page.jsx and STATUS_LABELS in pp/report/page.jsx.
4. Add formal p95 latency measurement to evidence (or document acceptance of pagination-as-incremental strategy).
