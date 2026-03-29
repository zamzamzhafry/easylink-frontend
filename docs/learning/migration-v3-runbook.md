# Migration v3 Runbook

## Prerequisites

- Ensure `demo_easylinksdk` contains the legacy schema plus `migration.sql` and `auth_group_shift_revision.sql` artifacts.
- Run `npm install` so the CLI scripts can import `mysql2/promise` via `lib/db.js`.
- Both scripts default to `demo_easylinksdk`; override the target by passing `--database <name>` or setting `EASYLINK_DB_NAME`. Use `easylink_prod` for UAT/prod deployments.

## Feature flags + cutover gates (Task 6)

Defaults are compatibility-first. Runtime behavior should remain legacy-compatible unless an explicit flag is set.

| Gate domain                  | Env flag                                | Allowed modes                                  | Safe default  | Cutover meaning                                                                                | Immediate rollback                                  |
| ---------------------------- | --------------------------------------- | ---------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Policy source mode           | `EASYLINK_POLICY_SOURCE_MODE`           | `legacy`, `compat_view`, `canonical`           | `legacy`      | Move policy reads from legacy flag semantics toward compatibility view/canonical policy source | `set EASYLINK_POLICY_SOURCE_MODE=legacy`            |
| Data-source cutover mode     | `EASYLINK_DATA_SOURCE_CUTOVER_MODE`     | `legacy_only`, `shadow_read`, `canonical_read` | `legacy_only` | Control read path progression from legacy-only toward canonical read path                      | `set EASYLINK_DATA_SOURCE_CUTOVER_MODE=legacy_only` |
| Machine parity exposure mode | `EASYLINK_MACHINE_PARITY_EXPOSURE_MODE` | `off`, `admin_only`, `all_users`               | `off`         | Controls whether machine parity signal is exposed (diagnostic visibility only)                 | `set EASYLINK_MACHINE_PARITY_EXPOSURE_MODE=off`     |
| Reporting interaction mode   | `EASYLINK_REPORTING_INTERACTION_MODE`   | `legacy`, `compat_bridge`, `canonical`         | `legacy`      | Shift reporting interaction model to compatibility/canonical interaction contracts             | `set EASYLINK_REPORTING_INTERACTION_MODE=legacy`    |

### Gate checks before enabling any non-default mode

1. Confirm clean deploy baseline:
   - `npm run typecheck`
   - `npm run build`
2. Confirm migration artifacts exist and validate cleanly:
   - `npm run migration:v3 -- --mode validate`
3. Confirm parity gates from schema/compatibility contracts:
   - identity parity
   - role/capability parity
   - group scope parity
   - scanlog parity
   - prediction target parity

### Rollback criteria

Rollback any non-default flag immediately if one or more happens:

- auth/role outcomes diverge from legacy expectations for admin/leader/employee smoke tests
- group-scoped access boundaries differ from baseline
- scanlog parity checks show count/order drift outside accepted reconciliation window
- reporting totals/source labels diverge from expected `override -> global` behavior
- operator queues or admin diagnostics regress after gate change

### Rollback commands (Windows shell)

Set all gates back to compatibility defaults:

```bash
set EASYLINK_POLICY_SOURCE_MODE=legacy
set EASYLINK_DATA_SOURCE_CUTOVER_MODE=legacy_only
set EASYLINK_MACHINE_PARITY_EXPOSURE_MODE=off
set EASYLINK_REPORTING_INTERACTION_MODE=legacy
```

Then restart the app process and re-run baseline checks:

```bash
npm run typecheck
npm run build
```

If database object rollback is required (only after explicit migration execution), run:

```bash
npm run migration:v3 -- --mode rollback --execute
```

## Migration orchestrator

- **Dry run** (preview statements):
  ```bash
  npm run migration:v3 -- --mode apply
  ```
- **Apply** (destructive only with `--execute`):
  ```bash
  npm run migration:v3 -- --mode apply --execute
  ```
- **Validate canonical objects**:
  ```bash
  npm run migration:v3 -- --mode validate
  ```
- **Rollback v3 objects**:
  ```bash
  npm run migration:v3 -- --mode rollback --execute
  ```
- Add `--database <name>` (or `EASYLINK_DB_NAME=<name>`) when pointing at `easylink_prod` (UAT/prod).

## Seed role fixtures

- **Dry run** (default):
  ```bash
  npm run seed:v3:roles
  ```
- **Apply fixtures**:
  ```bash
  npm run seed:v3:roles -- --execute
  ```
- Pass `--database easylink_prod` when you need to seed non-dev databases.
- The script is idempotent: it upserts legacy (`tb_karyawan`, `tb_user`, `tb_karyawan_roles`, `tb_user_group_access`, `tb_schedule`) and canonical (`cs_*`) rows for `admin001`, `leader001`, and `employee001`.

## Notes

- Dry runs are safe: no DB connection is opened unless `--execute` is provided.
- Runbook safety relies on the `--execute` gate and explicit logging before mutating data.
