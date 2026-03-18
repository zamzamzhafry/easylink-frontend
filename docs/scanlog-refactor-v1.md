# Scanlog Refactor V1 (Fresh DB)

This blueprint keeps machine PIN for ingestion identity and moves app authentication to employee-side accounts/roles.

## Objectives

- Keep device fetch/pull logic based on machine user PIN.
- Make scanlog storage immutable and idempotent.
- Reduce frontend load by serving projection tables instead of heavy live aggregation.
- Separate machine identity from app auth identity.

## Identity Model

- Machine identity: `(device_sn, pin)` from device SDK payload.
- App identity: `employee_auth_accounts` and `employee_roles`.
- Link table: `employee_machine_identity` maps machine PIN to employee.

## Read/Write Model

- Write path:
  1. SDK pull from machine (date-range + pagination/cursor)
  2. Normalize payload
  3. Upsert device and sync metadata
  4. Insert into immutable `scanlog_events` using unique `source_event_key`
  5. Update projection tables (`attendance_daily`, `attendance_monthly`)

- Read path:
  - Frontend dashboard/list screens read `attendance_daily` and `attendance_monthly`.
  - Raw events endpoint is only for drill-down.

## API Direction (No heavy frontend processing)

- `GET /api/attendance/daily?from&to&group_id&cursor&limit`
- `GET /api/attendance/monthly?month&group_id&cursor&limit`
- `GET /api/attendance/events?employee_id&from&to&cursor&limit`

Cursor recommendation:

- Event cursor: `(event_time, event_id)`.
- Daily cursor: `(work_date, employee_id)`.

## SDK Strategy

- Primary runtime adapter: `fingerspot-easylink-ts` (newer and typed).
- Fallback adapter: `easylink-js` for incompatible devices/commands.
- Application uses a local `MachineGateway` interface so SDK can be swapped without touching business logic.

## Rollout Guardrails

- Keep old endpoints while new projection endpoints run in shadow mode.
- Validate parity by day and employee before cutover.
- Keep rollback switch on read path until parity and lag SLO pass.
