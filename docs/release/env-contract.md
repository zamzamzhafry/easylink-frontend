# Environment Contract (Production)

Last updated: 2026-04-19

## Purpose

Authoritative env-variable reference for production deploys.
Use this with Windows/Linux runbooks in `docs/release/`.

## Required Runtime Variables

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | Yes | Must be strong and unique per environment. |
| `DB_HOST` | Yes | MySQL host. |
| `DB_PORT` | Yes | MySQL port. |
| `DB_USER` | Yes | MySQL user. |
| `DB_PASSWORD` | Yes | MySQL password. |
| `DB_NAME` | Yes | Primary runtime DB name. |
| `EASYLINK_DEVICE_SN` | Yes | Target machine serial number. |
| `EASYLINK_WSDK_BASE_URL` or `EASYLINK_WSDK_IP` | Yes | At least one required for windows-sdk adapter. |

## Required UAT-Hold Defaults

| Variable | Default During UAT Hold |
|---|---|
| `EASYLINK_POLICY_SOURCE_MODE` | `legacy` |
| `EASYLINK_DATA_SOURCE_CUTOVER_MODE` | `legacy_only` |
| `EASYLINK_MACHINE_PARITY_EXPOSURE_MODE` | `off` |
| `EASYLINK_REPORTING_INTERACTION_MODE` | `legacy` |
| `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK` | `true` |
| `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` | `true` |

## Security-Critical Variables

| Variable | Production Rule |
|---|---|
| `ALLOW_INSECURE_COOKIES` | Unset or `false`. |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Do not set to `0` in production. |
| `EASYLINK_DEFAULT_USER_PASSWORD` | Set strong non-default value; never `1234`. |

Known risk to track:

1. `lib/easylink-sdk-client.js` currently forces `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` at runtime. Treat this as a production hardening blocker and do not rely on environment settings alone.

## Optional but Recommended

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Runtime mode (`production` expected in prod). |
| `AUTH_COOKIE` | Script/manual QA helper cookie name/value source. |
| `DB_CONNECTION_LIMIT` | Tune pool size. |
| `DB_TIMEZONE` | DB timezone alignment. |
| `EASYLINK_DEVICE_IP` | Required when using `fingerspot-easylink-ts` adapter path. |
| `EASYLINK_DEVICE_PORT` | Required when using `fingerspot-easylink-ts` adapter path. |
| `EASYLINK_WSDK_PORT` | SDK port override (default `8090`). |
| `EASYLINK_SCANLOG_WORKERS` | Scanlog queue concurrency. |
| `EASYLINK_MACHINE_WORKERS` | Machine queue concurrency. |
| `EASYLINK_SCANLOG_LIMIT` | Per-request scanlog cap. |
| `EASYLINK_SCANLOG_MAX_PAGES` | Scanlog pagination ceiling. |
| `EASYLINK_SCANLOG_MAX_PAGES_NEW` | New-scanlog mode page ceiling. |
| `EASYLINK_USER_MAX_PAGES` | User paging ceiling. |
| `EASYLINK_MACHINE_POLLING_DRY_RUN` | Dry-run switch for machine polling tests only. |

## SDK Endpoint Variables (Canonical)

| Variable | Default Endpoint List |
|---|---|
| `EASYLINK_WSDK_ENDPOINT_SCANLOGS` | `/scanlog/new,/scanlog/all/paging,/getScanLogs` |
| `EASYLINK_WSDK_ENDPOINT_USERS` | `/user/all/paging,/getUsers` |
| `EASYLINK_WSDK_ENDPOINT_INFO` | `/dev/info,/getDeviceInfo` |
| `EASYLINK_WSDK_ENDPOINT_TIME` | `/dev/info,/getDeviceTime,/getDeviceInfo` |
| `EASYLINK_WSDK_ENDPOINT_SETTIME` | `/dev/settime` |
| `EASYLINK_WSDK_ENDPOINT_SETUSER` | `/user/set,/setUser` |
| `EASYLINK_WSDK_ENDPOINT_INIT` | `/dev/init` |

## SDK Timeout and Retry Variables

| Variable | Purpose |
|---|---|
| `EASYLINK_WSDK_TIMEOUT_MS` | Default SDK request timeout. |
| `EASYLINK_WSDK_PAGING_TIMEOUT_MS` | Paging request timeout. |
| `EASYLINK_WSDK_INFO_TIMEOUT_MS` | Device info request timeout. |
| `EASYLINK_WSDK_TIME_TIMEOUT_MS` | Device time request timeout. |
| `EASYLINK_WSDK_SETTIME_TIMEOUT_MS` | Device set-time request timeout. |
| `EASYLINK_WSDK_RETRY_ATTEMPTS` | Default retry attempts. |
| `EASYLINK_WSDK_SETTIME_RETRY_ATTEMPTS` | Retry attempts for set-time. |
| `EASYLINK_WSDK_RETRY_DELAY_MS` | Delay between retries. |

## Legacy/Fallback Aliases

These are still recognized as fallback inputs and should be documented explicitly:

1. `EASYLINK_LAN_HOST` and `EASYLINK_API_HOST` are fallback host sources when `EASYLINK_WSDK_BASE_URL`/`EASYLINK_WSDK_IP` are not set.
2. `EASYLINK_DB_NAME` is used by migration/seed scripts, while runtime uses `DB_NAME`.
3. `EASYLINK_WSDK_ENDPOINT_DEVICE_INFO` and `EASYLINK_WSDK_ENDPOINT_DEVICE_TIME` are historical names in old docs; canonical runtime keys are `EASYLINK_WSDK_ENDPOINT_INFO` and `EASYLINK_WSDK_ENDPOINT_TIME`.

## Script-Only Variables

| Variable | Used By |
|---|---|
| `EASYLINK_DB_NAME` | `scripts/migration-v3-orchestrator.mjs`, `scripts/seed-v3-role-fixtures.mjs` |

## Validation Checklist

Before deploy:

1. Every required variable is set in target environment.
2. UAT-hold flags are set to compatibility defaults.
3. No security-critical variable violates production rule.
4. Runtime and script DB targets are intentionally aligned (`DB_NAME` vs `EASYLINK_DB_NAME`), or explicitly documented if different.
