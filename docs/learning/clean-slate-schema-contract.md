# Clean-Slate Schema Contract (Task 3)

Status: **design + migration artifacts only**. No runtime cutover in this task.

## canonical entities

The migration `migration_v3_clean_slate_schema.sql` introduces additive canonical entities (prefix `cs_`) without dropping legacy structures.

| Entity                                        | Purpose                                                                    | Key constraints / invariants                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `cs_employee_auth_identity`                   | Canonical 1:1 employee-auth account (`tb_karyawan`-bound).                 | `PRIMARY KEY(employee_id)` enforces 1:1; `login_nip` unique; FK to `tb_karyawan(id)` with cascade delete.                                 |
| `cs_employee_identification_methods`          | Identification-method metadata (NIP/PIN/RFID/Face/custom).                 | Unique `(employee_id, method_type, method_value)`; validity range check (`valid_to >= valid_from`).                                       |
| `cs_role_policy_catalog`                      | Canonical role policy definitions for `admin`, `group_leader`, `employee`. | Enum PK `role_key`; seeded JSON policy payloads.                                                                                          |
| `cs_employee_role_bindings`                   | Role grants scoped globally or per group.                                  | Scope check (`global -> NULL group`, `group -> non-NULL group`); admin cannot be group-scoped; FK to policy catalog, employee, and group. |
| `cs_group_ownership`                          | Explicit group ownership/leader stewardship history.                       | FK to `tb_group` + `tb_karyawan`; ownership window check (`ends_at >= starts_at`).                                                        |
| `cs_scanlog_raw_events`                       | Immutable canonical raw scan stream.                                       | Unique `source_event_key`; indexed device/pin time lookup.                                                                                |
| `cs_attendance_daily_computed`                | Computed daily attendance read model separated from raw events.            | Unique `(employee_id, work_date)`; FK to employee.                                                                                        |
| `cs_monthly_prediction_target_global`         | Global monthly minimum-hours baseline.                                     | `PRIMARY KEY(year_month)`; `minimum_hours >= 0`.                                                                                          |
| `cs_monthly_prediction_target_group_override` | Group override for monthly minimum-hours target.                           | Unique `(year_month, group_id)`; FK to global month + group; `minimum_hours >= 0`.                                                        |
| `cs_legacy_role_alias_map`                    | Legacy-role label bridge to canonical roles.                               | Mapping table with default projection flag for compatibility views.                                                                       |

### Monthly prediction target source rule

`vw_prediction_target_effective` codifies source precedence:

1. group override (`cs_monthly_prediction_target_group_override`)
2. global fallback (`cs_monthly_prediction_target_global`)

The view also emits a `target_source` field: `group_override`, `global_fallback`, or `global_default`.

## legacy mapping strategy

No legacy table is removed or rewritten. Bridge objects are additive:

- `vw_compat_karyawan_auth` (projects canonical identity to legacy `tb_karyawan_auth` shape)
- `vw_compat_karyawan_roles` (projects canonical role bindings to legacy role rows using default alias projection)
- `vw_compat_user_group_access` (projects group-scoped canonical role grants to legacy access flags)
- `vw_compat_scanlog_safe_events` (projects canonical raw events to safe-event legacy shape)

This keeps compatibility-first migration sequencing possible while existing routes remain unchanged.

## cutover prerequisites

Before any runtime switch to canonical tables/views:

1. **Identity parity**: every active `tb_karyawan_auth` row has one `cs_employee_auth_identity` row.
2. **Role parity**: legacy capability interpretation (`is_admin`, `is_leader`, `can_schedule`, `can_dashboard`, `is_hr`) is reproducible from canonical role bindings + alias map.
3. **Group ownership parity**: existing leader semantics are represented in `cs_group_ownership`.
4. **Scanlog parity**: raw-event counts and dedupe behavior are validated between legacy safe events and canonical raw events.
5. **Prediction target parity**: for sampled months/groups, effective target in `vw_prediction_target_effective` matches business expectation (`override > global`).

## rollback steps

Rollback artifact: `migration_v3_clean_slate_rollback.sql`

Execution order encoded in rollback file:

1. drop compatibility views (`vw_prediction_target_effective`, `vw_compat_*`)
2. drop v3 tables in reverse dependency order
3. preserve all legacy tables unchanged

## data reconciliation checkpoints

Recommended reconciliation gates prior to cutover:

1. **1:1 identity cardinality**
   - count active identities vs active auth rows
   - detect duplicate/NULL NIP candidates before backfill
2. **role policy parity by employee**
   - compare canonical effective role set vs legacy-derived role set
3. **group scope parity**
   - compare canonical group-scoped grants with existing `tb_user_group_access` and `tb_employee_group`
4. **raw/computed integrity**
   - raw event uniqueness (`source_event_key`) and daily computed uniqueness (`employee_id + work_date`)
5. **prediction target source correctness**
   - verify `vw_prediction_target_effective` reports `group_override` where overrides exist, else `global_fallback`
