# Session Handoff: `final.ps1` Discussion + Remaining TODOs

Last updated: 2026-03-31
Primary active plan: `.sisyphus/plans/easylink-architecture-clean-slate.md`

## 1) Re-read Findings: `docs/learning/final.ps1`

`docs/learning/final.ps1` is **not executable PowerShell deployment code** in its current content.
It contains a migration guide/spec (markdown-style text) intended for AI-agent implementation guidance.

### What `final.ps1` specifies
- SQL tables to implement:
  - `Devices`
  - `Users`
  - `Scanlogs`
  - `SyncJobs`
- API strategy (resource-style):
  - `GET /api/devices/{sn}/info`
  - `POST /api/devices/{sn}/sync-time`
  - `POST /api/users/sync`
  - `POST /api/users/push`
  - `POST /api/scanlog/sync/new`
  - `POST /api/scanlog/sync/all`
  - danger operations with strict RBAC
- Critical integration rules:
  - machine requests should use `application/x-www-form-urlencoded`
  - `/scanlog/new`: `from/to` in query, `sn` in body
  - long timeout windows (60–200s)
  - graceful offline handling (503/504)
  - explicit datetime normalization before SQL insert

## 2) `external-discussion.md` + `final.ps1` vs current app (high-level)

### Current app already has strong parity in behavior
- Machine query/actions implemented via `/api/machine` action broker (queue-based).
- Scanlog sync has advanced controls:
  - `mode` sync
  - reconciliation report (`report=delta`)
  - replay (`replay_delta`)
  - cutover gate check (`check_gate`)
- Admin-only guards are present across machine/scanlog control routes.
- SDK layer supports urlencoded/query/json fallback strategies + timeout controls + endpoint fallback.

### Main divergence
- Docs describe **resource-centric endpoint model**; app uses **action-centric queue model**.
- `final.ps1` acts as architecture reference text, not executable deployment script.

## 3) Remaining TODO Checklist (not yet executed)

Source: `.sisyphus/plans/easylink-architecture-clean-slate.md`

### Task 16 (3)
- [ ] Leader scope contains planning/schedule management plus cumulative + monthly prediction.
- [ ] Employee scope contains group schedule + cumulative + monthly prediction.
- [ ] Discipline/review details hidden for non-admin.

### Task 17 (4)
- [ ] Pie/bar charts support click drilldown and monthly target/prediction overlays.
- [ ] Role-scoped reporting payloads are enforced.
- [ ] Drilldown endpoints are bounded and paginated.
- [ ] Chart target lines/bands read from config-driven monthly target source with visible source attribution.

### Task 18 (8)
- [ ] Payload budget policy enforced by API responses.
- [ ] Large list/log rendering uses incremental/virtualized strategy.
- [ ] EN/ID localization coverage meets required screen/key thresholds.
- [ ] Readability standards (contrast + minimum font-size) pass in light and dark mode.
- [ ] Light theme text tokens avoid gray-on-light primary text and meet contrast threshold for table/body text.
- [ ] Light background token uses slightly off-white value for readability comfort.
- [ ] Key table/filter/button/select surfaces consume global semantic classes instead of repeated page-level utility chains.
- [ ] p95 latency/frame-budget targets meet defined thresholds.

## 4) Current progress snapshot
- Checked items: 76
- Unchecked items: 15

## 5) Next execution order
1. Close Task 16 (scope/visibility partitioning)
2. Close Task 17 (reporting + drilldown + target attribution)
3. Close Task 18 (performance, localization, readability hardening)
