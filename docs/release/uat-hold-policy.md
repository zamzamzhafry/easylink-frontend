# UAT Hold Policy

Last updated: 2026-04-19

## Goal

Keep production stable while UAT is still collecting real user feedback.
During this period, use compatibility-first rollout defaults and defer aggressive cutover.

## Required Runtime Defaults

Keep these values in production unless an explicit UAT exception is approved:

1. `EASYLINK_POLICY_SOURCE_MODE=legacy`
2. `EASYLINK_DATA_SOURCE_CUTOVER_MODE=legacy_only`
3. `EASYLINK_MACHINE_PARITY_EXPOSURE_MODE=off`
4. `EASYLINK_REPORTING_INTERACTION_MODE=legacy`
5. `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=true`
6. `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT=true`

## Allowed Changes During UAT

1. Non-breaking bug fixes.
2. Documentation and runbook improvements.
3. Performance/readability tuning with no contract changes.
4. Print/PDF presentation fixes that do not alter API payload contracts.

## Disallowed Changes During UAT

1. Enabling `canonical_read` in production.
2. Enabling non-default policy/reporting cutover modes in production.
3. Dropping legacy tables/columns.
4. Irreversible auth/session contract changes without rollback validation.

## Promotion Gate to Non-Default Modes

All must pass before changing any cutover flag in production:

1. Fresh parity evidence exists and is reviewed.
2. Rollback procedure has been tested in staging.
3. Smoke checks pass for admin and non-admin access flows.
4. Incident owner and rollback owner are explicitly assigned.

## Rollback Trigger Conditions

Immediate rollback to default compatibility flags when any condition is true:

1. Auth/session regressions (unexpected 401/403 increases).
2. Role-scope visibility regressions for attendance/reporting.
3. Print/PDF regressions in critical attendance/schedule reports.
4. API error-rate or latency regression above approved threshold.

## Operational Notes

1. Keep `.sisyphus/evidence` and `docs/agent-context/next-session-master-board.md` synchronized with latest status.
2. Do not mark final-wave verification complete unless corresponding evidence artifacts exist and match current code state.
3. Keep production to one active app instance while queue state remains in-process for `/api/machine` and `/api/scanlog/sync`.
