---
name: bake-design
description: Anti-slop gate for EasyLink UI. Force a committed design direction + semantic-token check BEFORE writing component/page code. Use whenever adding or restyling any UI surface (page, component, modal, table, badge, chart).
---

# Bake Design (EasyLink)

Adapted from `~/public/ai-design-skills-guide.md`. This repo **already committed** a design direction — this skill enforces it.

## Direction (locked)

- **Vibe:** operational calm, editorial dashboard. NOT generic AI slop.
- **Fonts:** DM Sans (`--font-sans`) + DM Mono (`--font-mono`). Data cells use `.font-data` / `font-mono`.
- **Palette:** teal-green primary (`--primary: 158 67% 35%` light / `174 72% 40%` dark) + warm orange accent. Dark `#020617` base, light `#ecfdf5` base. Status: emerald=ok, amber=warn, rose=danger.
- **Theme:** dual dark/light via `html[data-theme='dark'|'light']`. User-toggled, persisted `easylink_theme`.
- **Density:** data-dense tables, restrained whitespace, strong section dividers.

## The gate — run BEFORE writing code

1. **Name the direction** in one line. If you can't, you're about to emit slop.
2. **Reject slop signals** (hard fail any of these):
   - purple/indigo/violet gradients as accents (except `Perangkat Aktif` legacy violet card — known debt)
   - default system font stack
   - layout-sameness: identical card grids w/o hierarchy
   - scroll-reveal animations that aren't GPU transforms (`translate`/`scale`/`opacity` only)
3. **Semantic tokens only.** Never hardcode `text-white`, `bg-slate-900`, `text-slate-*`, `border-slate-*`. Use:
   - `text-foreground` / `text-muted-foreground` (not `text-white` / `text-slate-400`)
   - `bg-card` / `bg-muted` / `bg-background` (not `bg-slate-900`)
   - `border-border` (not `border-slate-700`)
   - Status: `.ui-status-badge-success/-warning/-danger` or `text-emerald-400`-family
4. **Pick the component class** before writing JSX:
   - page shell → `ui-page-shell`; card → `ui-card-shell` / `.panel-card`
   - table → `.table-shell` + `.table-head-cell` / `.table-cell`; empty/loading → `TableEmptyRow` / `TableLoadingRow`
   - buttons → `.btn-action` (primary) / `.btn-outline` / `.btn-danger`; or `<Button tone=… variant=…>`
   - inputs → `.control-input` / `.control-select`; labels → `.ui-control-label`
   - status/error banner → `<InlineStatusPanel variant=error|warning|success message=… />`
5. **Loading/error/empty are first-class.** Retained data + sectional skeleton; retryable inline banner; distinguish empty vs stale vs failed. Redirect to `/login` only on confirmed auth failure (repo rule).

## Critical: dark/light parity

Every color must work on BOTH themes. `text-white` is **invisible in light mode**. This is the #1 recurring bug here. Tokens flip automatically — hardcoded values don't.

## Animation rules

- GPU-friendly transforms only (`translate`/`scale`/`opacity`).
- Honor `@media (prefers-reduced-motion: reduce)` — `globals.css` already disables `.modal-shell-panel` + `.bell-ring-subtle`.
- No layout-thrashing anims (animating `width`/`height`/`top`).

## When you touch a page

1. Check it against this list.
2. Replace any hardcoded `text-white` / `bg-slate-*` / `text-slate-*` with semantic tokens.
3. Confirm both themes render (toggle `html[data-theme]` mentally or via dev server).
4. Leave no `console.log` / `debugger` / `TODO` cruft.

## Quick grep (run on any PR touching UI)

```bash
grep -rn "text-white\b\|bg-slate-900\b\|text-slate-\|bg-slate-\|border-slate-" --include="*.jsx" --include="*.tsx" app components
```

Zero matches = gate passed. Non-zero = debt to clear.
