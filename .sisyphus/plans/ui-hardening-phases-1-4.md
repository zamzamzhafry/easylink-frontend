# UI Hardening Plan — Phases 1–4

## Project context

Next.js 14 app router, JSX (no TypeScript in app layer), Tailwind CSS, MySQL via `pool`, `lucide-react` icons.
No machine/backend work in scope. No whole-app redesign. Reuse existing semantic CSS patterns.

---

## Phase 1 — Shell width + route discoverability

### Files changed
- `components/app-shell.jsx`
- `components/sidebar.jsx`
- `lib/localization/ui-texts.js`
- `app/page.jsx`

### Changes made
1. `app-shell.jsx` line 282: changed `showRightSidebar && 'xl:mr-80'` → `showRightSidebar && !rightSidebarCollapsed && 'xl:mr-80'`
   - Right margin now only applies when right sidebar is expanded, not when collapsed.
2. `sidebar.jsx`: added `FileBarChart` import from lucide-react; added `/report` nav item in the `planning` section with `auth: 'dashboard'`.
3. `ui-texts.js`: added `report: 'Reports'` (EN) and `report: 'Laporan'` (ID) to `sidebar.items` in both locale blocks.
4. `app/page.jsx`: added Reports shortcut button in the header action row (teal accent, `canDashboard` gated).

### Success criteria
- Admin desktop: collapsing the right sidebar recovers ~320px of horizontal content space.
- `/report` appears in the sidebar Planning section for admins, leaders, and HR.
- Dashboard header shows Reports → button for users with `canDashboard`.
- No LSP errors on any changed file.

---

## Phase 2 — Compact dashboard

### Files changed
- `app/page.jsx`
- `components/dashboard-ops-panel.jsx`

### Changes made
1. `app/page.jsx` layout rewrite:
   - Header: compressed from 3-line block to single-line with inline action buttons (Attendance, Schedule, Reports →).
   - Stat cards: changed from tall vertical cards (`p-4`, icon above number) to compact horizontal strips (`px-4 py-3`, icon + number + label in one row).
   - Quick links: changed from large padded cards (`p-4`, 4-col grid) to tight pill grid (`px-3 py-2.5`, 6-col, label only with `title` tooltip for desc).
   - Removed duplicate report/attendance/schedule entries from quick links (now in header buttons).
2. `dashboard-ops-panel.jsx`:
   - Added `open` state, defaulting to `false`.
   - Wrapped content in `{open && ...}` conditional.
   - Changed `useEffect(() => { loadStatus(); }, [loadStatus])` to `useEffect(() => { if (open && !payload) { loadStatus(); } }, [open, payload, loadStatus])`.
   - Header is now a `<button>` with ChevronDown toggle.
   - Result: `/api/ops/recovery` is NOT called on dashboard mount — only when admin explicitly expands the panel.

### Success criteria
- Dashboard page loads without firing `/api/ops/recovery` (no 500 noise on non-Windows dev machines).
- Stat cards are visually compact — all 5 fit in one row on lg screens.
- Quick links are a dense pill row, not a large card grid.
- No LSP errors on any changed file.

---

## Phase 3 — Attendance + review UX normalization

### Files changed
- `components/attendance/attendance-table.jsx`
- `app/attendance/review/page.jsx`

### Changes made
1. `attendance-table.jsx` name cell: added `block max-w-[160px] truncate` + `title={row.nama}` to both the Link and span variants. Long names now truncate with tooltip instead of blowing out the table column.
2. `attendance/review/page.jsx`:
   - Added `PRESET_RANGE` to the import from `@/lib/attendance-helpers`.
   - Added preset range buttons (`PRESET_RANGE.map(...)`) below the Apply button in the filter grid, spanning `col-span-full`. Each button calls `setFrom(startOfRange(range.key))` and `setTo(isoDate())`.
   - Matches the preset pattern already used in `components/attendance/attendance-filters.jsx`.

### Success criteria
- Long employee names in the attendance table truncate at ~160px with full name visible on hover.
- Attendance Review filter section shows today/week/month preset buttons.
- Preset buttons update `from`/`to` state and trigger a re-fetch (via the existing `useEffect` on `[from, to, ...]`).
- No LSP errors on any changed file.

---

## Phase 4 — Schedule orientation + density hardening

### Files changed
- `components/ui/table-shell.jsx`
- `app/schedule/page.jsx`

### Changes made
1. `table-shell.jsx`: added `bodyRef` prop to `TableShell`; forwarded it as `ref={bodyRef}` on the inner `overflow-x-auto` div. Previously `ScheduleGrid` passed `bodyRef={tableRef}` but `TableShell` silently ignored it, so the today-scroll `holder.scrollTo(...)` call targeted `null`.
2. `schedule/page.jsx`:
   - Added `useSearchParams` import from `next/navigation`.
   - Changed `useState(() => monthStart(new Date()))` to read `searchParams?.get('month')`:
     - `'next'` → `monthStart(addDays(monthEnd(new Date()), 1))`
     - `'prev'` → `monthStart(addDays(monthStart(new Date()), -1))`
     - `'YYYY-MM'` → `monthStart(new Date(`${monthParam}-01T00:00:00`))`
     - fallback → `monthStart(new Date())`
   - Fixes the broken `/schedule?month=next` shortcut linked from the attendance page.

### Success criteria
- `ScheduleGrid` today-scroll actually fires: on mount, the grid scrolls horizontally to show today's column.
- Navigating to `/schedule?month=next` opens the schedule on next month, not current month.
- `/schedule?month=2026-06` opens June 2026.
- No LSP errors on any changed file.

---

## Final Verification Wave

All QA steps below use the running dev server (`npm run dev`) and browser devtools unless noted.

### Phase 1 — Shell + discoverability

Tool: browser devtools + visual inspection

1. Log in as admin. Open `/`. Confirm the sidebar shows a "Reports" item in the Planning section with a bar-chart icon.
2. Collapse the right ops sidebar (click the chevron button). Confirm the main content area expands — the `xl:mr-80` margin is gone. Expand it again and confirm the margin returns.
3. Log in as a group leader (non-admin with `can_dashboard`). Confirm "Reports" appears in the sidebar Planning section. Note: non-admins are redirected from `/` to `/attendance` by `app/page.jsx:185-187`, so the dashboard header button is not reachable by leaders — sidebar nav is the only entry point for them.
4. Log in as a plain employee (no `can_dashboard`). Confirm "Reports" does NOT appear in the sidebar.
5. Log in as admin. On the dashboard header (`/`), confirm the "Reports →" button is visible. This button is admin-only in practice because non-admins cannot reach `/`.

Tool: `lsp_diagnostics` (already run — zero errors on `app-shell.jsx`, `sidebar.jsx`, `ui-texts.js`, `app/page.jsx`)

### Phase 2 — Compact dashboard

Tool: browser devtools + Network tab

1. Open `/` as admin. Open the Network tab. Confirm NO request to `/api/ops/recovery` fires on page load.
2. Click the "Operations Control" accordion header. Confirm it expands and a request to `/api/ops/recovery` fires exactly once.
3. Collapse and re-expand. Confirm the request does NOT fire again (payload is cached in state).
4. Visually confirm stat cards are compact horizontal strips (icon + number + label in one row, not tall vertical cards).
5. Visually confirm quick links are a tight pill row (label only, no description text visible, description in `title` tooltip on hover).

Tool: `lsp_diagnostics` (already run — zero errors on `app/page.jsx`, `dashboard-ops-panel.jsx`)

### Phase 3 — Attendance + review normalization

Tool: browser devtools + visual inspection

1. Open `/attendance` with a dataset that includes employees with long names (>20 chars). Confirm names truncate at ~160px with the full name visible on hover (`title` attribute).
2. Open `/attendance/review`. Confirm the filter section shows preset buttons (Today, This Week, This Month, or equivalent labels from `PRESET_RANGE`).
3. Click a preset button (e.g. "Today"). Confirm `from` and `to` date inputs update and the table reloads with the new range.
4. Compare with `/attendance` — confirm the preset button labels and behavior are consistent between the two pages.

Tool: `lsp_diagnostics` (already run — zero errors on `attendance-table.jsx`, `attendance/review/page.jsx`)

### Phase 4 — Schedule orientation

Tool: browser devtools + visual inspection

1. Navigate to `/schedule?month=next`. Confirm the schedule opens on next month (not current month). The month label in the header should show next month's name.
2. Navigate to `/schedule?month=prev`. Confirm previous month.
3. Navigate to `/schedule?month=2026-06`. Confirm June 2026.
4. Navigate to `/schedule` (no param). Confirm current month.
5. On the plan tab with current month data, confirm the grid auto-scrolls horizontally to show today's column on mount (today column should be visible without manual scrolling).

Tool: `lsp_diagnostics` (already run — zero errors on `table-shell.jsx`, `schedule/page.jsx`)

- No machine/backend changes.
- No test deletions.
- No `as any` / `@ts-ignore`.
- No new markdown summary files unless explicitly requested.
- All changes verified with `lsp_diagnostics` — zero errors on all touched files.
