# Session Handoff — Shared UI Layer (Candidate 2)

**Date**: 2026-06-07
**Status**: Foundation built + proof page migrated + gate passed. Fan-out remaining.

## What the user asked for

> "i kinda want to polish css and ui. since some of the component render at mobile resolution or landscape kinda sucks. and i want to have more themed colored button, grouping with outline rounded border radius etc... while u refactor the component structure mess and grid etc"

Then granted: *"you have my permission to use your best judgement. i prefer simplicity yet powerful and not too complex where it might be hard to debug if problem arise"* and *"i kinda at my limit. aim for quick finish and then handoff"*.

An architecture review picked **Candidate 2**: lift shared table/filter/button chrome into reusable modules. User sequenced: C2 first, then C1 (useQuickSummaries hook), then C3 (split machine page), then C4–C5 cleanups.

## What was built this session (DONE + verified)

| File | What |
|---|---|
| `hooks/use-persisted-preference.js` | NEW. Defensive localStorage hook: versioned key + `validate()` on every read + silent fallback + self-heal + SSR-safe + never throws. **Reason it exists**: user reported raw localStorage previously retained stale data and broke the app until hard-reload/cache-clear. |
| `hooks/use-view-mode.js` | NEW. Global table view mode `auto/table/cards`, built on usePersistedPreference. Key `easylink:v1:view-mode`. Exports `useViewMode()` → `{viewMode, setViewMode, cycleViewMode}`. |
| `components/ui/button.jsx` | NEW. CVA `<Button>` + `<ButtonGroup>`. Axes: `variant` (solid/outline/ghost/soft) x `tone` (primary/success/danger/neutral) x `size` (sm/md/lg/icon). All colors from `globals.css` tokens. NO purple, NO free-form color. ButtonGroup = outlined rounded-`--radius` divided container (this is the user's "grouping with outline rounded border radius"). |
| `components/ui/data-table.jsx` | NEW. Column-driven `<DataTable>`. Props: `columns[{key,header,render?,align?,priority?,mobileLabel?,className?}]`, `rows`, `loading`, `error`, `emptyLabel`, `loadingLabel`, `rowKey`, `view='auto'`. Desktop = scroll table; mobile (`<768px`) = each row reflows to label/value cards (label = `mobileLabel ?? header`); `priority:'hide'` drops a column from mobile cards. **This is where the mobile/landscape overflow bug is solved** — no more `min-w-[...]` hacks. |
| `components/app-shell.jsx` | EDITED. Added `useViewMode()`, passes `viewMode` + `onViewModeCycle` to `<Sidebar>` (mirrors the existing theme toggle wiring). |
| `components/sidebar.jsx` | EDITED. Added view-mode toggle button next to the theme (Sun/Moon) button in the footer. Cycles auto→table→cards. Icons: Monitor/Table/LayoutGrid. |
| `app/users/page.jsx` | MIGRATED (proof page). Table → `<DataTable>` with declarative columns; row actions → `<ButtonGroup>` of ghost icon `<Button>`s (Pencil edit / KeyRound password / BarChart3 profile Link / Trash2 delete tone=danger); Add User → solid primary Button; modal Cancel/Save → outline/solid Buttons; pagination Prev/Next → ButtonGroup. Deleted `min-w-[180px]`/`min-w-[160px]` overflow hacks. `rfid` + `scan_days` columns get `priority:'hide'` on mobile. |
| `docs/CONTEXT.md` | EDITED. Added "Shared UI module layer" section + rule: persisted client prefs MUST use versioned+validated `usePersistedPreference`, never raw localStorage. Bumped Last updated to 2026-06-07. |

**Gate (docs/agent-restrictions.md REQUIRED)**: `npm run typecheck` clean, `npm run build` succeeded (full route table incl `/users`). LSP diagnostics clean on all touched files.

`table-shell.jsx` was deliberately LEFT untouched (other pages still import it) — DataTable is a new parallel layer, not a replacement. Old globals.css button/table classes deprecate gradually.

## Awaiting user review

User wanted to review **mobile + landscape** rendering of the migrated `/users` page before fan-out. Recommend they resize browser / use device toolbar to confirm the card-collapse looks right, and test the sidebar view-mode toggle (auto/table/cards persists across reload).

## Fan-out remaining (next session)

Repeat the `/users` migration pattern (delegate to a `visual-engineering` agent per page, spec mirrors the one used for users):

1. `app/attendance/review/page.jsx` (741 lines) — next, similar table shape
2. `app/schedule/page.jsx` (1269 lines) — table `min-w-[720px]` overflows mobile; bigger, has BulkAssignModal + CSV import + zoom + pagination
3. `app/report/page.jsx` (779 lines) — export/print controls → convert to Button/ButtonGroup
4. `app/attendance/page.jsx` (1674 lines) — largest; do last

For each: convert HEADERS/table → DataTable columns array, drop `min-w-[...]`, convert buttons to `<Button>`/`<ButtonGroup>`, leave fetch/`usePaginatedResource`/modals untouched, run typecheck+build gate.

## Then (later candidates, user's stated order)

- **C1**: `useQuickSummaries(from,to,groupId)` hook — collapse the duplicated fetch-loading-error triad that appears verbatim in BOTH `app/attendance/page.jsx` and `app/schedule/page.jsx`.
- **C3**: split `app/machine/page.jsx` (1457 lines) into hooks: useCurrentUser / useMachineHealth / useMachineSync / usePageVisibility / useAddUserForm. Note: machine page has polling — project prefers event-driven; flag during split.
- **C4**: move attendance pure transforms (lines 44–189: normalizePredictionContext, formatMinutesToHours, buildDateRange, buildYearRange, compactDateWithDay, filterQuickSummaryRowsByEmployee) into `lib/attendance/`.
- **C5**: one holiday-aware `<CompactDateHeader>` + `useHolidayMap`, dedupe across attendance+schedule.

## Design source of truth (where the design docs live — answers user's first question)

- `.codex/skills/ui-ux-pro-max/SKILL.md` — PRIMARY north-star (scan speed, obvious primary actions, STRONG grouping not card walls, restrained accent AVOID PURPLE, motion only to clarify state, sectional skeletons not full-page spinners).
- `app/globals.css` — THE theme token source of truth (teal `--primary:174 72% 40%` dark / green `158 67% 35%` light, `--radius:0.5rem`, shift badge classes `.badge-pagi/.siang/.malam/.middle/.libur/.cuti/.nonshift`).
- `docs/CONTEXT.md` — canonical spine (now includes the shared-UI-layer section).
- `docs/release/vm-apache-landing-page.md`, `docs/app-current-state-graph.md`, `ops/landing-page/styles.css`.

## Architecture review artifact

`%TEMP%\architecture-review-20260607-134720.html` (self-contained HTML, the 5-candidate report).
