# Clean-Slate Compatibility Contract (Legacy Bridge)

Status: **bridge definition only**. Existing APIs continue using current legacy tables in this task.

## canonical entities

Compatibility bridge depends on canonical entities defined in `migration_v3_clean_slate_schema.sql`:

- `cs_employee_auth_identity`
- `cs_employee_identification_methods`
- `cs_role_policy_catalog`
- `cs_employee_role_bindings`
- `cs_group_ownership`
- `cs_scanlog_raw_events`
- `cs_attendance_daily_computed`
- `cs_monthly_prediction_target_global`
- `cs_monthly_prediction_target_group_override`
- `cs_legacy_role_alias_map`

These are additive and do not replace legacy storage yet.

## legacy mapping strategy

### Bridge objects (additive, non-destructive)

| Bridge object                    | Legacy contract it emulates        | Mapping rule                                                                                              |
| -------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `vw_compat_karyawan_auth`        | `tb_karyawan_auth` shape           | `identity_status='active' -> is_active=1`; exposes NIP/password/login timestamps from canonical identity. |
| `vw_compat_karyawan_roles`       | `tb_karyawan_roles` shape          | Canonical role bindings projected via default alias map (`admin`, `group_leader`, `viewer`).              |
| `vw_compat_user_group_access`    | `tb_user_group_access` shape       | Group-scoped canonical grants mapped to `can_schedule/can_dashboard/is_leader`.                           |
| `vw_compat_scanlog_safe_events`  | `tb_scanlog_safe_events` shape     | Canonical raw event fields projected to safe-event column names.                                          |
| `vw_prediction_target_effective` | Monthly target resolution contract | Effective minimum hours resolved by `group override -> global fallback`.                                  |

### Legacy API/table usage impact inventory (from AST/grep exploration)

- AST pattern `await pool.query($SQL, $$$)` appears across API routes (74 call sites in `app/api/**/route.js`), confirming SQL-table coupling is widespread.
- Dynamic table-selection pattern in `app/api/scanlog/route.js`:
  - `const baseTable = useSafe ? 'tb_scanlog_safe_events' : 'tb_scanlog'`
- High-frequency legacy tables in current API queries include:
  - `tb_user`, `tb_karyawan`, `tb_user_group_access`, `tb_karyawan_auth`, `tb_karyawan_roles`
  - `tb_employee_group`, `tb_group`, `tb_schedule`, `tb_shift_type`
  - `tb_scanlog`, `tb_scanlog_safe_events`, `tb_scanlog_safe_batches`, `tb_scanlog_hidden`
  - `tb_attendance_note`, `tb_schedule_revision_requests`

Implication: compatibility views are required before any runtime table swap to avoid route-by-route breakage.

## cutover prerequisites

1. **Shadow-read validation**
   - For representative endpoints, compare current result vs equivalent query against `vw_compat_*` objects.
2. **Role/capability parity tests**
   - Validate admin/group leader/employee behavior remains identical under alias projection.
3. **Group scope parity tests**
   - Validate group-filtered endpoints return same group boundaries.
4. **Scanlog parity tests**
   - Validate legacy-safe and compatibility-safe projections match count/order windows.
5. **Prediction target parity tests**
   - Validate `group override -> global fallback` for selected months/groups.

No runtime cutover should occur until all prerequisites pass.

## rollback steps

Rollback is object-level and reversible via `migration_v3_clean_slate_rollback.sql`:

1. remove bridge views (`vw_prediction_target_effective`, `vw_compat_*`)
2. remove canonical additive tables (`cs_*`)
3. keep legacy tables untouched

## data reconciliation checkpoints

1. **Identity reconciliation**
   - one canonical identity per employee; canonical NIP uniqueness; legacy auth row parity checks.
2. **Role reconciliation**
   - compare effective legacy flags to canonical role + scope derivation.
3. **Group access reconciliation**
   - compare existing approved group access rows against `vw_compat_user_group_access` output.
4. **Raw scanlog reconciliation**
   - compare unique event keys and sampled event windows between legacy safe table and compatibility view.
5. **Monthly target reconciliation**
   - for each sampled month/group: ensure source and minimum-hours values are identical to business rule expectations.
