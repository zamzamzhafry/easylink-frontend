# Roadmap: N+1 Reduction + Database Normalization (Later Version)

This is a staged plan for improving query scalability and schema quality without breaking current behavior.

## Problem statement

Current attendance/performance endpoints perform multi-join + per-request aggregation directly from transactional tables (notably `tb_scanlog`).

Risks:

- Growing latency as scan volume increases
- N+1 style follow-up lookups when API surface expands
- Hard-to-maintain SQL duplicated across multiple routes

## Target outcomes

1. Predictable API latency under larger scanlog volume.
2. Reduced redundant joins and repeated per-request aggregation.
3. Clear normalized model for employee identity, group membership, schedule, and attendance events.
4. Backward-compatible migration path.

---

## Phase 0 — Baseline & observability

**Goal:** know where cost is before refactor.

Tasks:

- Add query timing logs around:
  - `GET /api/attendance`
  - `GET /api/performance`
  - dashboard stats query path (`app/page.jsx`)
- Capture P50/P95 latency and row counts.
- Inventory top SQL statements by runtime and frequency.

Deliverable: baseline report in `docs/perf-baseline.md`.

## Phase 1 — Eliminate obvious N+1 patterns in API layer

**Goal:** avoid repeated lookups done row-by-row.

Tasks:

- Ensure group/schedule/note enrichment is batched via joins or preloaded maps.
- Extract shared attendance SQL builder to one domain module (single source of truth).
- Reuse auth scope calculation once per request (avoid recomputing in nested paths).

Acceptance criteria:

- No loop-driven DB query calls in attendance/performance handlers.
- Query count per request remains constant with result size.

## Phase 2 — Introduce projection tables for reads

**Goal:** shift expensive runtime aggregation to ingestion/projection pipeline.

Tasks:

- Materialize daily projection table (example: `attendance_daily`).
- Optional monthly rollup (`attendance_monthly`).
- Backfill projections from existing scanlog history.
- Add parity endpoint to compare current vs projected results during shadow mode.

Acceptance criteria:

- Dashboard/attendance reads primarily from projection tables.
- Shadow parity mismatch < agreed threshold.

## Phase 3 — Schema normalization pass

**Goal:** improve relational clarity and prevent duplicate/ambiguous entities.

Normalization direction:

- Canonical employee identity table (single source for person metadata).
- Explicit mapping table for machine identity (`device_sn`, `pin`) -> canonical employee.
- Separate auth account concerns from employee profile concerns.
- Standardize group membership table with validity windows (`effective_from`, `effective_to`) if needed.

Migration approach:

- Add new tables first (non-breaking)
- Dual-write or sync scripts
- Read switch by feature flag
- Decommission legacy columns/tables in final cleanup phase

## Phase 4 — Index and query plan hardening

**Goal:** keep performance stable after schema evolution.

Candidate indexes (validate with real EXPLAIN):

- `tb_scanlog(pin, scan_date)`
- `tb_schedule(karyawan_id, tanggal)`
- `tb_employee_group(karyawan_id, group_id)`
- projection table indexes aligned with API filters (`tanggal`, `group_id`, `karyawan_id`)

Acceptance criteria:

- EXPLAIN plans show index usage for critical queries.
- P95 latency reduced vs baseline under same dataset.

## Phase 5 — Cutover + cleanup

Tasks:

- Enable new read path by default.
- Keep fallback switch for one release window.
- Remove dead SQL branches after stability period.
- Update runbooks and onboarding docs.

---

## Risk controls

- Keep feature flags for each read-path migration step.
- Use parity checks before final cutover.
- Avoid big-bang migration.
- Maintain rollback instructions per phase.

## Suggested implementation order (short)

1. Baseline metrics
2. Query count cleanup (N+1 removal)
3. Projection tables + shadow read
4. Normalized schema rollout
5. Full cutover and cleanup
