# Machine SDK env cleanup (SDK-first mode)

This project now routes machine operations through the Windows SDK path first (`windows-sdk`) for API actions in `/api/machine` and `/api/scanlog/sync`.

## Keep (active)

- `EASYLINK_DEVICE_SN`
- `EASYLINK_WSDK_BASE_URL` (preferred)
- `EASYLINK_WSDK_IP` + `EASYLINK_WSDK_PORT` (fallback when base URL is not provided)
- `EASYLINK_WSDK_ENDPOINT_SCANLOGS` (optional override)
- `EASYLINK_WSDK_ENDPOINT_USERS` (optional override)
- `EASYLINK_WSDK_ENDPOINT_DEVICE_INFO` (optional override)
- `EASYLINK_WSDK_ENDPOINT_DEVICE_TIME` (optional override)
- `EASYLINK_SCANLOG_LIMIT` (optional)
- `EASYLINK_SCANLOG_MAX_PAGES` (optional)
- `EASYLINK_SCANLOG_WORKERS` (optional)

## Legacy-looking (safe to review/remove when no direct-device fallback is needed)

- `EASYLINK_DEVICE_MODEL`
- `EASYLINK_DEVICE_ACTIVATION`
- `EASYLINK_DEVICE_PASSWORD`
- `EASYLINK_DEVICE_NUMBER`

## Optional direct-device fallback vars (only if you still run direct adapter paths)

- `EASYLINK_DEVICE_IP`
- `EASYLINK_DEVICE_PORT`

If you are fully committed to SDK-only flow and no longer call direct adapter paths, keep these only for rollback readiness.
