# Demo EasyLink SDK Schema Research

Last reviewed: 2026-04-23

## Source snapshot

- Canonical raw dump: `docs/demo_easylinksdk 23_04_26.sql`
- Navigation aid: `docs/learning/demo_easylink clean structure export.md`
- Repo usage cross-check: `app/**`, `app/api/**`, `lib/**`, `scripts/**`

This note is intentionally research-oriented. It documents the current schema shape, the tables the app still touches, and the safest trim targets before a larger cleanup or cutover.

## Table inventory by domain

### App core tables

- `tb_karyawan`
  - employee master data
  - still joined by attendance, report, performance, schedule, groups, employees, dashboard
- `tb_group`
  - organizational group or unit catalog
  - still used by groups, schedule, attendance scope, report scope
- `tb_employee_group`
  - employee-to-group mapping
  - still critical for every scoped query
- `tb_schedule`
  - day-level schedule assignments
  - still used heavily by schedule UI and attendance/report derivations
- `tb_shift_type`
  - shift definitions, working hours, colors, scan requirements
  - still core to schedule and attendance interpretation
- `tb_attendance_note`
  - note/status overrides for attendance rows
  - still used by attendance summary flows

### Machine-owned or machine-adjacent tables

- `tb_device`
  - machine endpoint registry
  - used by dashboard device count and machine flows
- `tb_user`
  - machine user mirror
  - still used as a compatibility join for display names and machine-user management
- `tb_scanlog`
  - raw scan events from the device
  - still the main attendance/report/performance source table
- `tb_scanlog_safe_batches`
  - safer sync batch tracking
  - used by newer scanlog ingestion flow
- `tb_scanlog_safe_events`
  - normalized raw event stream
  - part of the safer ingest path, but not yet the primary read model for all screens

### Current auth and scope tables

- `tb_karyawan_auth`
  - current employee-bound login table
  - directly used by `/api/auth/login` and `lib/auth-session.ts`
- `tb_karyawan_roles`
  - current role grants (`admin`, `hr`, `group_leader`, `scheduler`, `viewer`)
  - currently used to derive elevated flags and group-scoped access
- `tb_user_group_access`
  - legacy PIN/group permission bridge
  - still used by legacy auth fallback and some group/user admin flows

### Review and audit tables

- `tb_scanlog_hidden`
  - hides raw scan rows from review flows
- `tb_scanlog_review_mutation_audit`
  - tracks review actions
- `tb_scanlog_review_tag`
  - stores tag status for reviewed scan rows

### Transitional or experimental canonical tables

- `cs_attendance_daily_computed`
- `cs_employee_auth_identity`
- `cs_employee_identification_methods`
- `cs_employee_role_bindings`
- `cs_group_ownership`
- `cs_legacy_role_alias_map`
- `cs_monthly_prediction_target_global`
- `cs_monthly_prediction_target_group_override`
- `cs_role_policy_catalog`
- `cs_scanlog_raw_events`
- parallel experimental tables like `employees`, `employee_auth_accounts`, `employee_machine_identity`, `scanlog_events`

These `cs_*` and parallel normalized tables look like clean-slate or compatibility experiments. They should be treated as research material, not adopted automatically.

## Current app-used tables

The current repo still actively references these tables in application code:

- `tb_karyawan`
- `tb_group`
- `tb_employee_group`
- `tb_schedule`
- `tb_shift_type`
- `tb_scanlog`
- `tb_attendance_note`
- `tb_device`
- `tb_user`
- `tb_karyawan_auth`
- `tb_karyawan_roles`
- `tb_user_group_access`
- `tb_scanlog_hidden`
- `tb_scanlog_review_mutation_audit`
- `tb_scanlog_review_tag`
- `tb_scanlog_safe_batches`
- `tb_scanlog_safe_events`

## Machine-owned tables to keep untouched first

These should be treated conservatively until the PHP bridge fully owns device polling and ingestion:

- `tb_device`
- `tb_user`
- `tb_scanlog`
- `tb_scanlog_safe_batches`
- `tb_scanlog_safe_events`

The app can reduce direct ownership of these flows before physically trimming them.

## Auth and account direction

The current auth shape is split across employee-bound and legacy-PIN models:

- employee-bound login through `tb_karyawan_auth`
- role derivation through `tb_karyawan_roles`
- legacy fallback and some approval flows through `tb_user_group_access`

The implementation target in this repo is to move to standalone account tables:

- `auth_accounts`
- `auth_account_group_scope`

That lets login stop depending on employee identity while keeping employee/group/schedule data separate.

## Candidate drop list

These are the strongest drop candidates once the new auth and simplified review model are live:

- `tb_karyawan_auth`
- `tb_karyawan_roles`
- `tb_user_group_access`
- `tb_scanlog_hidden`
- `tb_scanlog_review_mutation_audit`
- `tb_scanlog_review_tag`

## Candidate archive-first list

These deserve an export or rollback snapshot before deletion:

- `tb_karyawan_auth`
- `tb_karyawan_roles`
- `tb_user_group_access`
- `tb_scanlog_hidden`
- `tb_scanlog_review_mutation_audit`
- `tb_scanlog_review_tag`
- the `cs_*` experimental tables if the team no longer intends to use them

## Query simplification opportunities

### 1. Remove auth joins from read paths

Attendance, report, and performance queries should only need:

- employee
- group membership
- schedule
- shift
- scanlog
- attendance notes where needed

They should not need auth tables once standalone accounts are in place.

### 2. Collapse group joins before wide reads

Repeated display risk is highest where queries join `tb_employee_group` directly and then fan out rows. Prefer:

- a single-group projection per employee when UI only needs one display group
- scoped subqueries or pre-collapsed group sets before joining heavy scanlog reads

### 3. Prefer normalized read-model ownership by responsibility

- PHP bridge / machine layer owns raw device pulls
- DB stores normalized machine outputs
- React app reads DB-backed attendance, schedule, employee, and report data

### 4. Keep schedule quick summaries as the simpler reference path

The quick-summary route already behaves closer to the desired shape:

- one employee row
- deduped row map
- narrow scope contract

That shape is a better target than the older auth-heavy attendance/report queries.

## Unresolved questions

- Which of the `cs_*` clean-slate tables are still part of the intended future architecture versus abandoned experiments?
- Will `tb_attendance_note` survive as the only correction surface, or should corrections move into a new normalized attendance table later?
- Should HR have schedule-edit capability globally, or remain global read/review only?
- When the PHP bridge is ready, should `tb_scanlog_safe_events` become the main read source instead of `tb_scanlog`?
- Is any production flow still dependent on `tb_group_schedule`, or can it be retired with the older group-level scheduling model?

## Recommended trim order

1. Move login and session creation to standalone accounts.
2. Stop route guards and read queries from depending on employee-bound auth tables.
3. Move machine polling and restart orchestration behind the PHP bridge plus Task Scheduler.
4. Remove review-tag and hidden-scanlog flows from the UI and API surface.
5. Archive then drop legacy auth and review tables.
6. Reassess `cs_*` tables only after the production path is stable.
