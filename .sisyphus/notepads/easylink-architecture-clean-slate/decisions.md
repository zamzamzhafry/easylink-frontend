# Decisions

- 2026-03-28: Canonical role taxonomy is fixed as exactly three tiers: `admin`, `group_leader`, `employee`; no fourth active role is introduced.
- 2026-03-28: Legacy role labels are mapped for compatibility (`leader/scheduler -> group_leader`, `viewer -> employee`, `hr -> group_leader` as temporary alias) and documented for deprecation planning.
- 2026-03-28: Legacy auth flags remain runtime authority for now; canonical helpers are additive-only in this task to avoid behavior changes prior to centralized adapter migration.
- 2026-03-28: We'll keep role semantics untouched while routing all UI and attendance API gate checks through the adapter so future policy tweaks happen once rather than repeatedly per consumer.
- 2026-03-28: Compatibility bridge default role projection is fixed to `admin`, `group_leader`, and `viewer` via `cs_legacy_role_alias_map.is_default_projection`, while deprecated aliases remain stored for transitional mapping only.
- 2026-03-28: Runtime cutover is explicitly deferred; Task 3 ships schema + compatibility contracts only, gated by later shadow-read reconciliation before any API table swap.
- 2026-03-29: The auth bridge will remain compatibility-first—new `canonical_roles` and the fallback counter are additive helpers that sit alongside the legacy boolean flags so we can route consumers based on canonical semantics without touching existing guards.
- 2026-03-29: Standardized migration/cutover env contracts to `EASYLINK_*_MODE` flags with safe defaults locked to legacy-compatible modes; non-default modes are treated as explicit operator opt-in.
- 2026-03-29: Admin observability for cutover posture is delivered through existing `/api/scanlog/sync` + right sidebar surfaces to avoid broader API/UI churn while still enabling gate-aware operations.
- 2026-03-29: Machine user polling now writes checkpoints/chunks when the tables exist and rejects malformed records per chunk so pull jobs can be resumed without blowing up the queue or the downstream API contract.

- 2026-03-29: F1 gate decision set to NO-GO for F2/F3/F4 until Task 13 runtime blocker and downstream evidence gaps (16/17/18) are resolved.
- 2026-03-30: Kept Task 18 localization compatibility-first by extending the existing `ui-texts` dictionary (no new i18n dependency) and wiring translations only through existing locale context consumers.
- 2026-03-30: Readability hardening stays token-driven (semantic classes + HSL variables) and avoids introducing new global overrides with additional `!important` rules.

- 2026-03-30: Kept Task 18 retry additive-only by layering localization keys and semantic classes instead of refactoring API or auth contracts; used blocked-session-safe evidence strategy while preserving role guards and route behavior.
- 2026-03-30: For this retry slice, deferred authenticated Playwright evidence regeneration and limited scope to code-gap closure + build/typecheck verification per orchestrator instruction.
- 2026-03-30: Expanded localization dictionary in-place (`ui-texts`) for EN/ID parity rather than introducing new translation plumbing, so existing `useAppLocale` + `getUIText` remains single source of truth.
- 2026-03-30: For single-file evidence delegation, preserved product-code freeze and regenerated only `.sisyphus/evidence/task-18-i18n-readability.json` with explicit blocked-route/auth contexts instead of fabricating EN/ID protected-surface observations.
- 2026-03-30: Kept this delegation scoped to evidence-only refresh by replacing just `.sisyphus/evidence/task-18-i18n-readability.json` and recording runtime anomalies in notepads without changing product code.
- 2026-03-30: Kept stress delegation evidence-only by regenerating only `.sisyphus/evidence/task-18-stress.log` with curl-derived authenticated metrics; no code or other evidence artifacts changed.
- 2026-03-30: Kept UI perf delegation evidence-only by regenerating only `.sisyphus/evidence/task-18-ui-perf.json` using authenticated admin runtime probes with no product-code edits.
- 2026-03-30: Kept this pass strictly evidence-only by regenerating only `.sisyphus/evidence/task-18-stress.log` plus append-only notepad updates.
- 2026-03-30: Regenerated only `.sisyphus/evidence/task-18-ui-perf.json` using machine/log-heavy scoped interactions per Task18 requirement, explicitly excluding report-route measurements.
