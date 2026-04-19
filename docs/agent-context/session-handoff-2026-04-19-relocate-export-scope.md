# Session Handoff - Relocate Export Scope Control (April 19, 2026)

## User Feedback Addressed

- The `Current group / All groups` control in Quick Summaries looked like an in-table filter and caused confusion because toggling it does not call API immediately.
- Requested change: relocate this control so intent is clear.

## Change Made

- Moved quick-summary export scope control from Quick Summaries card header to top action area near:
  - `Export Excel`
  - `Export CSV`
  - `Print / PDF`
- Added explicit label: `Export Scope` (`attendancePage.actions.exportScopeTitle`) to make behavior clear.
- Removed duplicate scope toggle from Quick Summaries card section.
- Kept existing behavior:
  - Scope toggle is local state only.
  - API call happens during export when scope is `All groups`.

## File Updated

- `app/attendance/page.jsx`

## UX Outcome

- Better mental model: scope toggle now clearly belongs to export actions.
- Quick Summaries card is cleaner and focused on data view.
- No behavior regression in export flow expected.

## Recommended Follow-up Checks

1. `/attendance` -> Quick Summaries tab:
   - confirm toggle appears only in top action controls.
2. Export CSV/Excel/PDF with each scope:
   - `Current group` uses current filtered scope.
   - `All groups` fetches all-group quick summaries.

