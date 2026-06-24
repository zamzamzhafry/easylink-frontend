# UI Table Bug Fixes (audit 2026-06-11)

## Goal
Fix 4 audited UI bugs (docs/ui-ux-audit-findings-2026-06-11.md: D3, D4, D6, C1) in attendance/employees tables + shared table-shell.

## Summary
- D3 table clipping: raw `<div className="table-shell">` (overflow:hidden in globals.css .ui-table-shell L663) replaced with `<TableShell>` component (adds inner overflow-x-auto). Matches schedule-grid / quick-summaries usage.
- D4 duplicate delete: removed text delete button in employees-table; kept icon button; added aria-label.
- D6 long names: name cells already had `max-w-[200px] truncate` + title in both tables (no change needed beyond confirming).
- C1 loading vs empty: TableLoadingRow now renders animate-pulse skeleton bars (3 rounded bg-muted divs varying width) + aria-busy. TableEmptyRow untouched. Props/API unchanged.

## Changes
- components/attendance/attendance-table.jsx: import TableShell; `<div className="table-shell">` -> `<TableShell>` (open + close).
- components/employees/employees-table.jsx: import TableShell; div -> TableShell; removed second (text) delete button; added `aria-label={t('employeesTable.actions.delete')}` to kept icon delete button.
- components/ui/table-shell.jsx: TableLoadingRow → animate-pulse skeleton + aria-busy. Only this function changed; TableEmptyRow and all component APIs untouched.

## Files
- components/attendance/attendance-table.jsx
- components/employees/employees-table.jsx
- components/ui/table-shell.jsx

## Verification
- `npm run typecheck` (tsc --noEmit): clean.
- `npm run build`: fails only on pre-existing env error (Missing DB_HOST/DB_USER/DB_NAME, /api/admin/migrate-scanlog) — unrelated to JSX changes; all touched files compiled.
- LSP diagnostics unavailable (typescript-language-server not installed).
- Grep confirmed all TableLoadingRow callers (schedule-grid, quick-summaries, attendance-review, scanlog, employees, attendance) pass only colSpan/label — no API break.
- i18n key `employeesTable.actions.delete` confirmed present (lib/localization/ui-texts.js L703).

## Follow-up
- Remaining audit items (B1, D2, A1-A5, C2-C7, D1, etc.) not in scope.
