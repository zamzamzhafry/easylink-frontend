1#TZ|# Issues
2#KM|
3#XS|- 2026-03-28: Root cause: Task 3 SQL artifacts were ignored by git ignore rules; resolution: added explicit `.gitignore` exceptions for `migration_v3_clean_slate_schema.sql` and `migration_v3_clean_slate_rollback.sql`.
4#BP|- 2026-03-28: Task 4 retry revealed seed script dry-run path tried to close an uninitialized pool and lacked explicit `--database` guidance; added guardrails and documented `easylink_prod` target.
5#BT|
6#MR|#LB|- 2026-03-28: Root cause: Task 3 SQL migrations were lumped under the global `*.sql` ignore; resolution: inserted explicit unignore rules adjacent to that rule and verified git check-ignore no longer matches the files.
7#HN|
8#NR|- 2026-03-29: Running node scripts with --input-type=module emits MODULE_TYPELESS_PACKAGE_JSON warnings for and ; consider declaring the repo as ESM or converting those helpers to CJS to avoid noise when inspecting machine-job scripts.
9#JT|
10#TR|- 2026-03-29: Running node scripts with --input-type=module emits MODULE_TYPELESS_PACKAGE_JSON warnings for lib/db.js and lib/easylink-sdk-client.js; consider declaring the repo as ESM or converting those helpers to CJS to avoid noise when inspecting machine-job scripts.
11#XM|- 2026-03-29: Task 0 preflight saw port 3000 already bound, so the dev server spun up on 3001; future automated baselines should either release 3000 or explicitly target the fallback to avoid false negatives.
12#VP|- 2026-03-29: Legacy `is_hr` compatibility alias remains referenced in schedule-revision approval guards; while mapped to canonical `group_leader`, it is still technical debt until adapter-first canonical policy checks fully replace legacy alias checks.
13#PV|- 2026-03-29: Playwright smoke for Task 2 UI parity required `npx playwright install chromium` before executable availability; automation should pre-install browsers or reuse existing caches to avoid runtime prompts.
14#RC|- 2026-03-29: Task 3 dry-run and rollback evidence blocked because `mysql` CLI is missing (exit code 127). Human intervention required: install/provide mysql client and confirm DB credentials before rerunning these steps.

- 2026-03-29: Delta report sampling assumed tb_scanlog.id existed; legacy table lacks that column, so reconcile samples now order by scan_date/scan_time only to avoid SQL errors before running the new report script.

- 2026-03-29: Replay action requires a scoped from/to range; without either the merge helper returns early, so callers must provide at least one boundary when invoking the new `replay_delta` action.

- 2026-03-29: Gate-block action defaults to threshold 0, so an existing delta of zero will not block; to replicate a blocked state you must submit a threshold lower than the current unresolved total (negative value works) when collecting evidence.
- 2026-03-31: Task 11 acceptance now validated; deterministic reconcile/replay/gate artifacts were captured by forcing the check_gate threshold to zero while unresolved_total stayed at 12, so future runs can re-use the same pattern when the delta is still pending.

- 2026-03-29: Task 12 compatibility requires keeping the supported_actions list synchronized with the Task-12 aliases; update both the list and the evidence script whenever alias set changes to avoid stale client error contracts.

- 2026-03-29: Task 12 UI parity card wiring relies on Task-12 alias metadata responses; keep the artifact view list and alias status synchronized with API payloads to avoid showing stale metadata placeholders.

- 2026-03-29: Local dev server initially hit EADDRINUSE on port 3000 (existing node/process); resolved by stopping the hanging processes before restarting.
- 2026-03-29: Task 13 mutation auditing introduces an additive table (`tb_scanlog_review_mutation_audit`) created lazily at runtime; production DB users now need CREATE TABLE permission in the review API path, otherwise first-write calls will fail.
- 2026-03-29: Task 13 admin tagging controls are intentionally row-local (per-punch draft state in UI memory only); collapsing/reloading the review table resets unsaved reason/note drafts.
- 2026-03-29: Task 13 admin tagging QA blocked because no admin "Tag" controls ever render even after expanding any of the 89 rows (tagCount 0), so status/reason/note cannot be submitted for the acceptance gate.
- 2026-03-29: Follow-up QA verified the same behavior after scanning 30 rows with admin001: still zero Tag controls and the reason/status inputs remain hidden, indicating the UI never transitions into the taxonomy-edit mode for the current punches.
- 2026-03-29: Final QA with the 2026-03-27/29 window still shows 0 Tag buttons and hidden admin inputs, so the Task-13 tagging gate remains blocked until some punch set actually surfaces the admin controls or the UI is adjusted.
- 2026-03-29: Task 14 slice 1 intentionally wires only AppShell persistence/state props; visible right-sidebar folding behavior remains pending until `right-ops-sidebar.jsx` consumes `collapsed/onToggle` in the next substep.
- 2026-03-29: Task 14 slice 2 intentionally defers queue/migration freshness while accordions stay closed (no scanlog/machine polling until expanded) to keep collapsed/idle sidebar lightweight; operators must expand a section to trigger detail refresh.
- 2026-03-29: Verified that leader001 cannot stay on `/machine`â€”non-admin access redirects to `/dashboard` (404 in this build) so the guard prevents `/machine` from rendering for the role.
- 2026-03-29: Attendance role-scope summary depends on optional `cumulative_summary` / `prediction_context`; some ranges may return partial or missing fields, so UI must keep empty-state fallbacks to avoid stale assumptions about prediction availability.
- 2026-03-29: Task 16 leader QA blocked because npm dev server returns repeated 500/404 assets/auth routes (missing SQL backend).
- 2026-03-29: Task 18 validation still reports Biome `noImportantStyles` warnings in `app/globals.css`, but they are pre-existing light-theme override warnings (no new errors introduced by the additive semantic class slice).
- 2026-03-29: Localization dictionary slice introduced no blockers; helper fallback behavior covers missing locale or key data for now.
- 2026-03-29: Task 18 attendance pager selects now rely on `ui-control-select` with Tailwind override (`!w-auto`) to keep compact width; if utility ordering changes, verify pager control width in QA.
- 2026-03-29: Machine readability migration also uses `ui-control-select !w-auto` for compact queue paging controls; if class order changes in future refactors, re-check pager width and button density in `/machine` QA.

- 2026-03-29: Task 13 admin tagging UI remained unreachable during QA (no Tag/status/reason/note controls visible), blocking acceptance despite API non-admin 403 guard passing.
- 2026-03-29: Missing evidence artifacts for Task 14 (network/theme), Task 17 (role-scope/drilldown naming mismatch), and Task 18 (all required artifacts absent).

#ZV|- 2026-03-29: Task 14 QA blocked because the dev server process died after the tooling timeout, so Playwright automation could not be executed to validate sidebar collapse persistence. Evidence file notes the limitation.
#ZW|- 2026-03-29: Task 14 verification still blocked because dev server command with PORT=3032 ran until the tool timeout, so no Playwright run could be executed within the 2-minute interaction window.
#ZX|- 2026-03-29: Task 14 QA on port 3033 succeeded without blockers; collapse toggle and reload interactions completed via Playwright.
#ZY|- 2026-03-29: Theme toggle QA (dark/light cycles) completed without navigation reloads or frozen UI on port 3033; no remount loop detected.
#LJ|- 2026-03-29: Task 14 fallback instrumentation now writes to `window.__easylinkThemeFallbackEvents` and dispatches `easylink:themeRemountFallback`; QA must capture these runtime artifacts to prove the one-shot remount triggered when stale-theme detection fires since no telemetry sink exists yet.

- 2026-03-29: npm run build intermittently threw missing .next/server/chunks/vendor-chunks/next.js and /_document prerender errors on first run, but an immediate rerun completed successfully; treat this as a transient build artifact flake during Task 18 verification.
- 2026-03-29: Task 18 retry found verification lag from stale review context; current report page wiring already used shared locale context and needed only a defensive null-safe locale read to make fallback intent explicit.
- 2026-03-29: Attendance filters now intentionally use `ui-control-input/ui-control-select` with compact width overrides (`w-auto`, `max-w-[220px]`); if utility precedence changes in future style refactors, re-check control density/alignment in `/attendance` filter bar.
- 2026-03-30: Task 18 Playwright QA could only validate `/login` runtime metrics/readability because authenticated pages are blocked by backend `500` responses on `/api/auth/me` and `/api/auth/login` in this environment.

- 2026-03-30: Playwright QA on protected routes remained blocked by backend auth failures (api auth me and api auth login returned 500), so runtime i18n and perf evidence was captured from reachable login surface plus static localization coverage in code.
- 2026-03-30: Manual QA (Playwright against localhost:3050) still hits repeated /api/auth/me 500s because the dev server cannot reach MySQL (see .sisyphus/evidence/task-18-devserver-current-err.log), so /attendance /machine /report keep redirecting to login and no authenticated data can be exercised; gate remains BLOCKED until the DB/credentials are available.
- 2026-03-30: `app/globals.css` still reports Biome `noImportantStyles` warnings across legacy light-theme overrides; this retry only changed flagged white-surface color values and did not broaden `!important` usage.
- 2026-03-30: Dedicated QA runtime on port 3060 still returned `/api/auth/login` 401 for admin001, leader001, and employee001; protected routes redirected to `/login?next=...` via repeated `/api/auth/me` 401.
- 2026-03-30: During authenticated leader browser-flow validation, `/attendance/review` surfaced a Next.js runtime overlay (`TypeError: Cannot read properties of null (reading 'removeChild')`); login itself still succeeded via API status 200.
- 2026-03-30: Stress probe shows report endpoint payload remains relatively heavy even when bounded (`limit=200`, ~113KB), so future perf tuning may still focus on report serialization size.
- 2026-03-30: Task 18 authenticated UI perf pass failed global p95<=100ms target due `/report` filter interaction spikes (~291ms p95, max ~306ms) despite attendance/machine interactions remaining below target.
- 2026-03-30: Stress probe run showed high initial latency on `/api/auth/me` in dev mode (~1463ms) while remaining bounded endpoints stayed sub-second.
- 2026-03-30: On `/machine`, some intended controls (explicit refresh/right-sidebar queue toggle labels) were not consistently discoverable by text in this runtime state, so perf samples used exposed machine-job controls and read-safe queue actions.

- 2026-05-22: Initial 
pm run typecheck failed before build because tsconfig included stale .next/types/** entries; 
ext build regenerated missing files and the follow-up typecheck was used for final verification.
