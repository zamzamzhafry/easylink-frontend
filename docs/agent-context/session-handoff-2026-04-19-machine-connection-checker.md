# Session Handoff - Machine Connection Checker Behavior

## Status

This note explains the new role-aware machine connection checker.
Machine controls remain admin-only, but connection health is now visible to any authenticated user.

## What the page checks

`app/machine/page.jsx` fetches `/api/auth/me` first and then switches into one of two modes:

- Admin mode: show connection checker + queue state + live job progress + result panes.
- Non-admin mode: show connection checker only and hide queue/task/result/danger-zone controls.

## Connection-checker behavior

The page polls `GET /api/machine/status`:

- Endpoint is authenticated-only (`/api/auth/me` session required), not admin-only.
- Backend probes SDK with two non-sensitive checks:
  - `device_info`
  - `device_time`
- Backend returns aggregate status:
  - `online` when all checks pass
  - `degraded` when partial checks pass
  - `offline` when all checks fail

UI displays green/amber/red pills plus per-check pills.

## Polling and refresh rules

Connection checker auto-refreshes while:

- user is authenticated
- the tab is visible

Refresh cadence:

- machine status polling: every 15 seconds
- queue summary refresh: every 10 seconds
- active machine job polling: every 2 seconds
- active scanlog batch stream: EventSource stream while a batch is active

The page listens to `visibilitychange` so it stops polling when the browser tab is hidden.

## Admin-only controls and safety

- `GET /api/machine` and `POST /api/machine` remain admin-only.
- `initialize_machine` requires exact confirmation phrase.
- `cancel_job` is supported for queued/running jobs.
- Full scanlog pull keeps explicit warning before queueing.

## Source anchors

- `app/machine/page.jsx`
- `app/api/machine/status/route.js`
- `app/api/machine/route.js`
- `app/api/scanlog/sync/route.js`
- `lib/easylink-sdk-client.js`
