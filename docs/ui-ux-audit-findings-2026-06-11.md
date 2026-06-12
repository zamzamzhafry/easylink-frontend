# UI/UX Audit Findings — 2026-06-11

Audit scope: design flaws, usability, readability. Codebase at `080248c` (branch `sync/ai-knowledge-2026-06-07`).
Status: **findings only — no fixes applied yet.** Each item has an ID for tracking.

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low

---

## A. Accessibility (Readability for Assistive Tech)

### A1 🔴 Form inputs not associated with labels
Screen readers cannot announce what a field is for.

| Location | Problem |
|---|---|
| `components/employees/edit-employee-modal.jsx` L59-72 (`Field`) | `<label>` has no `htmlFor`, `<input>` has no `id`. Affects Full Name, NIP, Awal Kontrak, Akhir Kontrak (L149, 215, 221, 228) |
| `components/employees/edit-employee-modal.jsx` L155 | Device User Relation search input — no `id`/`htmlFor` |
| `components/settings/settings-modal.jsx` L11-18 (`Field`) | Uses `<span>` instead of `<label>` — ALL settings/device/holiday fields (L256-419) unassociated |
| `components/schedule/bulk-assign-modal.jsx` L53, 69, 87, 96 | Labels without `htmlFor`; selects/inputs without `id` |
| `components/ui/search-input.jsx` L6-18 | No label, no `aria-label`, placeholder only |

Reference for correct pattern (already in repo): `components/attendance/attendance-filters.jsx` L77-138, `app/login/page.jsx` L81-93.

### A2 🟠 Icon buttons have no accessible name
`title=` only — unreliable for screen readers and touch.

- `components/sidebar.jsx` L169-182 (collapse toggle), L284-295 (settings), L296-316 (theme/view/locale), L407-417 (logout — nothing at all)
- `components/employees/employees-table.jsx` L121-128 (icon delete)

Good examples already in repo: `right-ops-sidebar.jsx` L258-263, L285-292 use `aria-label` correctly.

### A3 🟠 Active nav link has no `aria-current="page"`
`components/sidebar.jsx` L207-219, L259-274. Sighted users see teal highlight; screen reader users get nothing.

### A4 🟡 Settings toggle is a `<button>` pretending to be a switch
`components/settings/settings-modal.jsx` L234-253. Needs `role="switch"` + `aria-checked`.

### A5 🟡 Custom dropdown without ARIA roles
`components/schedule/schedule-grid.jsx` L46-113 (`ShiftPicker`) — stacked `<button>`s, no listbox/combobox semantics, unknown keyboard behavior.

### A6 ⚪ List rendered as div soup
`components/groups/unassigned-panel.jsx` L17-29 — employee list should be `<ul>/<li>`.

---

## B. Readability (Contrast & Type Size)

### B1 🔴 WCAG AA contrast failures (hardcoded slate on dark bg)

| Location | Token | Ratio |
|---|---|---|
| `components/groups/unassigned-panel.jsx` L13, L24 | `text-slate-600` on `bg-slate-900` | ~2.9:1 FAIL |
| `components/employees/edit-employee-modal.jsx` L69, L209 | `text-slate-600` hint text | ~2.9:1 FAIL |
| `components/sidebar.jsx` L419 | `text-xs text-slate-600` version string | ~2.9:1 FAIL |
| `components/sidebar.jsx` L386 | `text-[11px] text-slate-500` role badge | fails size + contrast |
| `components/dashboard/DashboardNeedsReview.jsx` L23-26, L32 | `text-slate-500` at `text-xs` | <4.5:1 at small size FAIL |
| `app/globals.css` L78 | `.badge-libur` `#9ca3af` on translucent gray | low contrast dark theme |

Fix direction: replace hardcoded slate with `text-muted-foreground` (dark `--muted-foreground` is 85% lightness — passes). These components also break theme switching (see D2).

### B2 🟠 Sub-12px body text everywhere
`text-[10px]`: `sidebar.jsx` L339, 357, 370; `right-ops-sidebar.jsx` L59, 108, 248, 325; `quick-summaries-table.jsx` L87, 166; `attendance-table.jsx` L115, 119; `schedule-grid.jsx` L218; `settings-modal.jsx` L496, 500; `dashboard-ops-panel.jsx` L83.
`text-[11px]`: `sidebar.jsx` L386; `right-ops-sidebar.jsx` L67, 70, 79, 104, 281, 329; `data-table.jsx` L82; `queue/scanlog-queue-sidebar.jsx` L40, 93, 96, 110, 116.
10px body-weight text fails WCAG regardless of contrast. Audit each: decorative → keep; informational → upsize to 12px+.

---

## C. Loading / Error / Empty States

### C1 🔴 Loading row and empty row are pixel-identical
`components/ui/table-shell.jsx` — `TableLoadingRow` and `TableEmptyRow` render the same `px-4 py-10 text-center text-xs` plain text. Users cannot distinguish "loading" from "no data". **Zero skeletons exist in the entire codebase.** Skill standard (`ui-ux-pro-max`): retained data + sectional skeletons.

### C2 🔴 Silent data failures show wrong data with no signal

| Location | Behavior |
|---|---|
| `app/page.jsx` L78, 94, 116, 118, 132, 163 | Dashboard RSC: every DB error `.catch(() => fallback)` — shows zeroed stats silently |
| `app/attendance/page.jsx` L384, 456 | Groups + holidays fetch fail → silent `[]`/`{}` |
| `app/schedule/page.jsx` L273 | Holidays fail → silent empty map |
| `app/analytics/page.jsx` L78, 96 | Employees + groups fail → silent `[]` |
| `app/performance/page.jsx` L82 | Groups fail → silent `[]` |

User sees zeros/missing filters and assumes that's the truth. Violates skill rule "distinguish empty state, stale state, and failed refresh".

### C3 🟠 No error recovery on most pages
Ephemeral toast is the only error surface on: employees, groups, shifts, schedule, attendance, attendance/review, analytics, performance, scanlog. Toast auto-dismisses → error gone, no retry.
**Reference implementations already in repo:** `app/users/page.jsx` L570 (`InlineStatusPanel` banner + retry) and `components/schedule/quick-summaries-table.jsx` L100-113 (inline retry). Replicate.

### C4 🟠 Refetch invisible on analytics/performance/report
- `app/analytics/page.jsx` L254-257, `app/performance/page.jsx` L254-257: only the Refresh button text changes; stale charts/tables remain with no in-flight indication.
- `app/report/page.jsx`: drilldown has loading row, but pie/bar charts have no loading treatment.
(Retained-data-while-refetch is correct per skill — but needs a visible "refreshing" indicator + `last updated` timestamp.)

### C5 🟡 Empty states are bare one-liners
No CTA, no guidance anywhere. Best-in-repo: `users/page.jsx` L578 differentiates "no users for current filter" vs "no users". Worst: dashboard (`app/page.jsx`) — empty DB renders zeroed stat cards with no explanation. Hardcoded English in `shifts/page.jsx` L348, `analytics/page.jsx` L469, `performance/page.jsx` L507 (i18n gap).

### C6 🟡 Inconsistent loading vocabulary
One true spinner exists (`app/employees/[id]/page.jsx` L428-437, full-page) — everything else is text-in-cell or button-text swap. Pick one system (recommend: skeletons + retained data) and normalize.

### C7 🟡 Aggressive 2s polling on machine page
`app/machine/page.jsx` L474-480: 2 000 ms active-job poll for entire job duration; L450-456: 10 s queue poll. Repo default is event-driven refresh. Scanlog already uses SSE (`app/api/scanlog/stream/route.js`) — same approach fits here.

---

## D. Layout & Visual Consistency

### D1 🔴 No mobile support at all
`components/sidebar.jsx` L164 + `components/app-shell.jsx` L264: fixed sidebar (80/240px) + `ml-20`/`ml-60` margins, zero breakpoint classes, no hamburger/drawer. Right ops sidebar is desktop-only (`hidden xl:flex`). App unusable on narrow viewports.

### D2 🟠 Theme system bypassed by hardcoded slate components
`components/dashboard/DashboardNeedsReview.jsx`, `components/groups/unassigned-panel.jsx`, `components/employees/edit-employee-modal.jsx`, `components/schedule/bulk-assign-modal.jsx` hardcode `slate-*` colors → broken/illegible in light mode. Token system in `globals.css` exists and is good — these components just don't use it. (Matches QA note 10.4: "dark mode might want to consult designer".)

### D3 🟠 Table overflow clipping (data loss)
`.ui-table-shell` (`globals.css` L663) sets `overflow: hidden`. Components using raw `<div className="table-shell">` clip columns with no scroll:
- `components/attendance/attendance-table.jsx` L67 — 11 columns, clips on medium viewports
- `components/employees/employees-table.jsx` L34 — 8 columns
Correct pattern exists: `<TableShell>` component adds inner `overflow-x-auto` (used by schedule-grid, quick-summaries). Root cause: two APIs, one broken.

### D4 🟠 Duplicate delete button per row
`components/employees/employees-table.jsx` L111-136: icon delete + text delete, both call `handleDelete`. Refactor artifact. Remove one.

### D5 🟡 Right ops sidebar reserves dead space when folded
`app-shell-main ... ml-60 xl:mr-80` — main content doesn't reclaim width when right sidebar folds. **Directly reported in QA-FEEDBACK.md (§2 + §3 notes):** folded sidebar should overlay; main shell should take full width.

### D6 🟡 Long names break table cells
QA-FEEDBACK.md §3: e.g. "Akbar Waskitojati Pamungkas,S.Tr.Kes" breaks attendance cell layout. Needs `truncate` + `max-w-*` + `title`/tooltip for full value.

### D7 ⚪ Dead duplicate root layout
`/layout.jsx` at repo root — stale, hardcodes `bg-slate-950`, ignored by app router. Delete.

---

## E. Navigation & IA

### E1 🟠 Report page unreachable from nav
QA-FEEDBACK.md §5: "no visible access button to the pages. add to left sidebar too". Sidebar audit found Report listed under Planning section — verify role-gating (`canSeeNavItem`) isn't hiding it from admin, or QA tested before `4092365`. Confirm at fix time.

### E2 🟡 13 nav items for admin, 3 sections
Within reason, but Planning (6) + Master (6) at `text-xs uppercase` section labels with low-contrast inactive state (`text-slate-400`) hurts scan speed. Tie into B1/B2 fixes.

### E3 🟡 Attendance review lacks quick filters
QA-FEEDBACK.md §4: wants quick date ranges (this week/month/last month) + anomaly checkboxes. Usability gap, not bug.

---

## F. Carried over from QA-FEEDBACK.md (human-reported, confirmed relevant)

- F1: `/api/ops/recovery` 500 spams console on dashboard load (Windows scheduled task missing). QA asks: don't load at init, load on explicit refresh only. → ties into C2/C4 patterns.
- F2: Machine page approach pending hardware; 15s status poll should fail silently when SDK unconfigured (§6.3) — verify alongside C7.

---

## Suggested Fix Order (when we start fixing)

1. **C1 + C6** — skeleton/loading system (one shared component, biggest perceived-quality win)
2. **B1 + D2** — replace hardcoded slate with theme tokens (fixes contrast AND light mode in one pass)
3. **A1 + A2 + A3** — label associations + aria-labels + aria-current (mechanical, low risk)
4. **D3** — table overflow: migrate raw `table-shell` divs to `<TableShell>`
5. **C2 + C3** — surface silent failures via `InlineStatusPanel` pattern from users page
6. **D4, D6, D7** — quick wins (duplicate button, name truncation, dead file)
7. **D1** — mobile drawer (largest effort, schedule separately)
8. **D5, E1, E3, C7** — product decisions needed, confirm scope first
