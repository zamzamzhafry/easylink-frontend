# Improvement Backlog — Off-Screen Loop Work

**Date:** 2026-06-24  
**Purpose:** Captured improvement areas for future loop sessions. Each item has measured payoff + YAGNI gate. Work these off-screen (cron loops) rather than interactive.

## Status Snapshot

- **Bug-hunt:** COMPLETE. 18+ bugs fixed, 0 found in last 6 scan iterations (static + runtime + edge cases).
- **Token migration:** COMPLETE. 226 → 17 (all 17 legit saturated-bg button labels).
- **Shared libs:** 4 created (csv, time, date-range, format-date) + 24 lock-in tests.
- **Security-lib tests:** COMPLETE. 3 more libs covered (pagination, request-json, password) +29 tests. See P1 below — original list was stale.
- **`npm test` script:** ADDED. Suite 172 tests, **171 pass / 1 fail** (the 1 = known `ALLOW_INSECURE_COOKIES=true` env baseline in `auth-session-compat`, documented). See "Test infra" below.
- **Test infra fixed:** 5 test files using top-level `await import()` renamed `.js`→`.mjs` (hop-b-status, hop-b-ingest-route, hop-b-cutover-read-source, id-holidays-fallback, use-auth-session). tsx loader dedups by path ignoring URL query-bust — `.mjs` forces fresh ESM module graph per load. Recovered +38 tests (133/141→171/172). `use-auth-session.test.mjs` also rewritten to use `resetSessionCache()` instead of fragile `?t=` module reload (same fix reason).
- **Runtime regression:** Fixed (`inferShiftIconKey` duplicate def — only caught by runtime smoke, not tsc).
- **tsc:** clean. **Server:** all 13 pages 200, all API routes 401 (unauthed correct).

## Improvement Backlog (ordered by payoff)

### P1 — Split complexity hotspots (4 files >1000 LOC)
**Files:**
- `app/attendance/page.jsx` (1,706 LOC) — 8 useEffect, mixed fetch+transform+render
- `lib/localization/ui-texts.js` (1,561 LOC) — monolith i18n, 17 importers load ALL strings
- `app/machine/page.jsx` (1,467 LOC) — complex polling/SSE + multi-action
- `app/schedule/page.jsx` (1,264 LOC) — drag-drop + import + export

**Action:** Extract `useAttendanceData()` hook, split i18n per-page (`localization/attendance.js` etc.), extract machine sub-panels, split schedule into filter/grid/export. Target each <400 LOC.
**YAGNI gate:** Split when a file causes merge conflicts or is hard to reason about. No split without measured pain.

### P1 — Test remaining security-critical libs ✅ DONE (2026-06-24 loop)
**Original list was STALE** — all 4 libs already had test files (id-holidays-fallback, easylink-sdk-client, hop-b-ingest-handler, auth-audit). Real gaps found instead, 3 libs newly covered:

- `lib/pagination.js` (81 LOC) — coercion caps (limit/page/offset). Boundary: prevents unbounded LIMIT DoS. `tests/pagination.test.js` 14 tests.
- `lib/request-json.js` (24 LOC) — safe JSON parse + error-field extraction. Boundary: all API client responses. `tests/request-json.test.js` 7 tests (fetch stubbed).
- `lib/password.ts` (38 LOC) — `verifyPassword` empty-guard footgun + bcrypt/legacy rehash path. `tests/password.test.js` 8 tests.

**Total +29 tests, all green.** `npm test` script added. YAGNI skip: `auth-login-helpers.js` (37 LOC, thin wrapper over tested `hasPrivilegeMismatch`).

**Still untested, gated:** `lib/karyawan-schema.js` (DB-coupled, information_schema cache — low risk, trivial). `lib/db.js`, `lib/auth-session.ts` decode branches (covered indirectly).

### P1 — Pre-commit token grep gate
**STATUS:** ❌ SKIPPED 2026-06-24 loop — failed its own YAGNI gate. See evidence below.
**Premise was WRONG:** Audit of last 5 commits shows 1 color addition total — `bg-rose-500/10 text-rose-300` (legit status-tint, not violation). Bug-hunt did NOT add saturated token debt.
**Evidence against gate:**
- Dominant raw-color usage = `bg-X-500/10` tinted status badges (online/degraded/offline), intentional semantic, NOT theme tokens.
- `tailwind.config.js` has NO `success`/`warning`/`danger` semantic tokens — status colors hardcoded BY NECESSITY, no token alternative exists.
- 12 files use raw status colors (machine 52 hits, inline-status-panel 36, schedule 35, scanlog 34, performance 33).
- A grep gate blocking `bg-(teal|amber|rose|emerald|sky|violet|cyan)-N` would false-positive storm on every legitimate status badge.
**Prerequisite (not done, needs human eyes):** add `--success`/`--warning`/`--danger` CSS vars + tailwind tokens (light+dark), then migrate 12 files. Visual regression risk = not viable in loop.
**Reconsider only after:** (a) semantic status tokens exist in theme AND (b) new-code actually introduces saturated-token debt (none currently).

### P2 — a11y label audit (false-positive check)
**Finding:** 67 inputs flagged by grep, but spot-check shows multi-line inputs w/ `id`+`htmlFor` pairing. Likely 0 real missing labels.
**Action:** Run `a11y-audit` skill or Playwright axe-core to get authoritative count. Fix only real gaps.
**YAGNI gate:** Skip if axe-core reports 0 violations.

### P2 — Race condition: `saveCustomHolidays` sync FS
**Why:** `lib/id-holidays-fallback.js` `writeFileSync` — read-modify-write non-atomic. Concurrent POST could lose data.
**Risk:** Low (admin-only, single admin typically).
**Action:** If multi-admin becomes real, add file lock or move to DB table.
**YAGNI gate:** Skip until concurrent-admin data loss reported.

### P2 — Config route `passthrough()` zod
**Why:** `app/api/config/route.js` uses `z.object({}).passthrough()` — accepts arbitrary keys.
**Risk:** Low (admin-only, config.json not executed, shallow merge).
**Action:** If config schema stabilizes, narrow to explicit keys.
**YAGNI gate:** Skip — admin trusted, no execution surface.

## Patterns Established (follow for new work)

1. **Transaction pattern:** `getConnection` + `beginTransaction` + `commit/rollback` + `finally release`. All multi-write routes.
2. **Date range protection:** `resolveDateRange()` w/ 366-day cap. All date-bounded routes.
3. **Shared libs:** Extract dup logic → `lib/*.js` + tests. Single source of truth.
4. **Token discipline:** Semantic tokens only (`text-foreground`, `bg-card`, `border-border`). `text-white`/slate only on saturated colored-bg.
5. **Runtime verification:** Run dev server + smoke pages. tsc misses runtime-only bugs (the `inferShiftIconKey` dup proved this).
6. **Test module isolation under tsx:** tsx loader dedups by file path — it IGNORES URL query strings (`?t=...` cache-bust does NOT reload the module). Tests that need per-test module state must (a) be `.mjs` if they use top-level `await import()`, and (b) call the module's own reset/export to clear module-level state — never rely on import-query busting.

## What NOT to touch (YAGNI — no measured pain)

- `requestJson` — safe JSON parse, throws w/ message. Working.
- `middleware.ts` — rate-limit + CSRF + security headers. Solid.
- `lib/db.js` — prod env validation, parameterized pool. Solid.
- `lib/authz/authorization-adapter.ts` — pure null-guarded functions. Solid.
- `lib/pagination.js` — bounded coercion. Solid.

## Loop Instructions

For off-screen cron loops targeting this backlog:
1. Pick ONE item from P1 (highest payoff).
2. Work it to completion (extract + test + verify tsc + smoke).
3. Update this file: mark done, note any new findings.
4. Commit if the session is meant to persist work (otherwise leave in working tree).

**Anti-pattern:** Don't restart bug-hunt — surface is exhausted (6 clean iterations). Pivot to the backlog above.
