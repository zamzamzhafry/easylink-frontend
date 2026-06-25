# PDF Export + MySQL Pool Leak Fixes

**Date:** 2026-06-25
**Branch:** `fix/bug-hunt-and-hardening`
**Commit:** `520e4e9` ("fix(db,pdf): pool-leak singleton + jspdf-autotable v5 API")
**Agent:** @claude
**Status:** Complete

## Goal
Restore PDF export on `/report`, `/analytics`, `/performance` (broken by jspdf-autotable v5 API change) and eliminate MySQL pool exhaustion that caused login 500 + API 401s under Next dev HMR.

## Summary
Two production-blocking bugs fixed, then full-site dogfood QA run (13 pages as admin001). PDF export restored on all 3 pages. Pool leak eliminated (1 conn stable across HMR cycles, was 120+ leaked). All pages render clean post-fix. One low-severity dead-anchor finding filed (dashboard "Perangkat Aktif" card `href="#"` → should be `/machine`).

## Changes

### 1. PDF export fix — `lib/export-pdf.js`
- `jspdf-autotable` v5 dropped auto side-effect registration; bare `import 'jspdf-autotable'` no longer sets `doc.autoTable`.
- Rewrote 10 call sites: `doc.autoTable(opts)` → `autoTable(doc, opts)` + explicit `import { autoTable }`.
- Affected pages: `/report` (4-page PDF), `/analytics` (2-page), `/performance` (6-page).

### 2. MySQL pool leak fix — `lib/db.js`
- Root cause: dev HMR re-evaluates the pool module on every recompile; mysql2 does NOT close the prior pool's connections on module GC → orphaned conns accumulate → saturate `max_connections=151` → login 500, API 401s.
- Fix: `globalThis`-cached singleton; `pool.end()` on prior pool when HMR swaps; `idleTimeout: 60_000` / `maxIdle` / `enableKeepAlive` on pool config.
- `idleTimeout` only reaps within a live pool — does not help GC'd pools, hence the singleton + explicit `.end()`.

### 3. Dogfood QA run
- Full site (13 pages) as admin001. Report: `dogfood-output/dogfood-report.md`. 15 screenshots: `dogfood-output/screenshots/`.
- Findings: 1 critical (MySQL pool exhaustion — fixed by change #2), 1 low (dashboard "Perangkat Aktif" card dead anchor `href="#"` → should be `/machine`).

## Files
- `lib/export-pdf.js` — 10 call sites rewritten to functional `autoTable(doc, opts)` form + explicit import.
- `lib/db.js` — globalThis singleton + `.end()` on HMR swap + pool config tuning.
- `dogfood-output/dogfood-report.md` — QA report (generated).
- `dogfood-output/screenshots/*` — 15 screenshots (generated).

## Verification
- PDF: all 3 exports produce valid `%PDF-1.3` (4/2/6 pages) verified via Playwright.
- Pool: 1 conn held stable across 2 HMR cycles (was 120+ leaked pre-fix).
- Site: 13 pages render clean post-fix as admin001.

## Key Facts (persist)
- `jspdf-autotable` v5+ requires either `applyPlugin(jsPDF)` or functional `autoTable(doc, opts)` form — bare `import 'jspdf-autotable'` no longer registers `doc.autoTable`.
- mysql2 pools are NOT closed on module GC in Next dev HMR — must globalThis-cache + `.end()` the prior pool. `idleTimeout` only reaps within a live pool.
- MySQL `max_connections=151` (default) too low for this VM (9router + prod pm2 + dev + agents share it). Operate: raise it + lower `wait_timeout`.

## Follow-up
- Dashboard "Perangkat Aktif" card: change `href="#"` → `/machine` (low priority).
- Operate MySQL: raise `max_connections` + lower `wait_timeout` for VM sharing.
