# Scanlog Cutover Runbook

This runbook assumes a fresh target model and phased adoption in an existing app.

## Phase 0: Baseline

- Keep existing API behavior unchanged.
- Define SLO targets:
  - Daily endpoint p95 latency target.
  - Projection lag threshold.
  - Data parity threshold.

## Phase 1: Schema Deployment

- Apply PostgreSQL schema (`migration_postgres_v1.sql`).
- Create at least one month partition for `scanlog_events` before ingest starts.
- Seed `employee_roles` (`admin`, `leader`, `scheduler`, `viewer`).

Rollback:

- Stop here; no application path is switched yet.

## Phase 2: Ingest in Shadow Mode

- Run pull job from machine using `MachineGateway`.
- Insert into `scanlog_events` with `source_event_key` dedupe.
- Do not switch frontend reads.

Checks:

- Duplicate check on `source_event_key` remains zero conflict failures beyond expected idempotent collisions.
- `sync_batches` shows healthy success ratio.

Rollback:

- Disable ingest worker. Existing app behavior stays intact.

## Phase 3: Projection Build

- Build and run projection updater for `attendance_daily` and `attendance_monthly`.
- Rebuild projection for selected date windows to validate deterministic output.

Checks:

- Daily parity by employee/date against legacy report for sample windows.
- Monthly parity by employee/month against legacy report.

Rollback:

- Keep old reads. Projection tables can be truncated and rebuilt.

## Phase 4: Dual-Read (Shadow)

- Keep legacy endpoint response as source of truth.
- In background, execute new read-model query and log diff statistics.

Checks:

- Parity threshold passes for soak period.
- Projection lag remains below threshold.

Rollback:

- Disable shadow compare job.

## Phase 5: Controlled Read Cutover

- Switch read path behind feature flag by cohort (internal admin first, then broader groups).
- Keep rollback flag for immediate legacy fallback.

Checks:

- Endpoint p95 and error rate stable.
- Cursor pagination continuity verified (no gaps/duplication across pages).

Rollback:

- Toggle read flag to legacy source.
- Keep ingest/projection running for investigation.

## Phase 6: Auth Migration (Employee-side)

- Introduce employee account login using `employee_auth_accounts`.
- Keep machine PIN only in `employee_machine_identity` for ingest linking.
- Map privileges through `employee_roles` and role assignments.

Checks:

- API permission checks based on employee roles only.
- No route still depends on `tb_user.privilege` for new auth flow.

Rollback:

- Re-enable old auth route/cookie parsing temporarily while keeping mapping tables updated.
