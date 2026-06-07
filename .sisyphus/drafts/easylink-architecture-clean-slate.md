# Draft: EasyLink Architecture Clean-Slate Finalization

## Requirements (confirmed)

- Continue from `.sisyphus/plans/easylink-architecture-clean-slate.md` without unnecessary interruption.
- Prioritize light-mode UX/readability fixes (tables, modals, transparent buttons), sticky header blur polish, and auto-scroll to current day.
- Use combined QA stack (Chrome DevTools MCP + Next DevTools MCP + Playwright) with evidence files for each acceptance.
- If blocked, record blocker and continue with next executable task.
- Add clean-schema comparison context from `docs/learning/demo_easylink clean structure export.md` into Sisyphus planning artifacts.
- Preserve production data and structure safety during any migration/cleanup (no destructive drops without validated cutover path).
- Real-data tables explicitly in scope for comparison: `scanlog_events`, `tb_scanlog` (legacy), `tb_template`, `tb_schedule` (possibly incomplete), `tb_scanlog_safe_events`, `tb_user`, `tb_karyawan`, `tb_employee_group`, `tb_group`.

## Technical Decisions

- Plan remains single-track in existing file; no split plans.
- Task closure requires evidence-backed runtime verification, not code-only completion.
- Final close sequence is: Task 18 → F1 → F2 → F3 → F4.
- Localization rule locked: **Strict now** — Task 18 cannot close until EN/ID switch is exposed and runtime-verified.
- Migration posture locked: **compatibility-first, data-preserving** (backup/snapshot + bridge/view period + delayed-drop policy).
- Cleanup policy confirmed by user: **Delayed Drop** (no immediate physical drop of legacy tables/columns).

## Research Findings

- Current plan status: Tasks 0-17 are checked; Task 18 and F1-F4 are still unchecked.
- Task 18 evidence files exist:
  - `.sisyphus/evidence/task-18-stress.log`
  - `.sisyphus/evidence/task-18-ui-perf.json`
  - `.sisyphus/evidence/task-18-i18n-readability.json`
- Light-mode/readability work was implemented in expected areas (attendance table, settings modal, create-group modal, schedule grid, global CSS, app shell/loading).
- Remaining acceptance ambiguity: Task 18 requires EN/ID localization coverage, but current evidence indicates locale switch exposure may still be incomplete.
- Recheck confirmed `docs/learning/demo_easylink clean structure export.md` now contains the `demo_easylinksdk` SQL export with canonical `cs_*` tables, compatibility views (`vw_compat_*`), and legacy tables carrying real data.
- Canonical + compatibility coexistence indicates phased cutover is required; immediate hard-drop of legacy real-data tables is unsafe due active FKs/views/code dependencies.
- Dependency mapping confirms hard runtime reads/writes still target `tb_scanlog`, `tb_scanlog_safe_events`, `tb_schedule`, `tb_user`, `tb_karyawan`, `tb_employee_group`, and `tb_group` across auth/attendance/scanlog/schedule/users/group APIs.
- `tb_template` appears low/no runtime reference candidate (subject to final grep/AST verification before any deprecation action).
- External guidance aligns with phased `expand -> migrate/validate -> contract` plus backup/binlog anchors, compatibility views, parity window, and delayed-drop gates.

## Open Questions

- None blocking for migration safety posture.

## Scope Boundaries

- INCLUDE: Final acceptance decisions, verification sequencing, and final-wave planning.
- EXCLUDE: Direct implementation in this planning session.

## Safe Migration Matrix (initial)

- KEEP (active runtime dependencies):
  - `tb_scanlog`, `tb_scanlog_safe_events`, `tb_schedule`, `tb_user`, `tb_karyawan`, `tb_employee_group`, `tb_group`
- TRANSITIONAL (limited-path dependency):
  - `scanlog_events` (appears tied to admin migration flow; validate real runtime access logs before demotion)
- CANDIDATE DEPRECATE (needs final verification):
  - `tb_template` (no strong app-runtime references found in current scan; verify DB-level triggers/procs/jobs before any action)

### Delayed-Drop Guardrails
- No physical DROP in current wave.
- Required before any DROP:
  1. Backup + restore test evidence
  2. Code dependency scan = zero active references
  3. DB dependency scan (FK/view/proc/trigger/event) = zero inbound dependencies
  4. Parity window success (read/write behavior unchanged)
  5. Rollback script approved and tested

## Immediate Next-Step Packet

1. Re-verify latest state after recent UI edits: `npm run typecheck` and `npm run build`.
2. Implement/verify visible EN/ID switch exposure and regenerate `.sisyphus/evidence/task-18-i18n-readability.json` with passing locale toggle checks.
3. Close Task 18 only after all acceptance criteria pass, then execute final verification wave F1-F4 with explicit evidence outputs.
4. Build schema-diff plan packet: map clean canonical schema vs listed real-data tables, classify keep/bridge/deprecate candidates, and define non-destructive migration sequence.
