# Project Context (for Human + AI Handoff)

## 1) What this app is

EasyLink attendance management app built with **Next.js App Router** and **MySQL**.

- Frontend pages live in `app/**/page.jsx`
- Backend API handlers live in `app/api/**/route.js`
- Shared modules are in `lib/**`
- SQL migrations are stored in repository root (`migration*.sql`)

## 2) Runtime architecture

### Main flow

1. UI page calls internal API route (`/api/...`)
2. API route checks auth context from cookie (`lib/auth-session.ts`)
3. API route queries MySQL through pooled connection (`lib/db.js`)
4. For machine operations, API route uses SDK adapter (`lib/easylink-sdk-client.js`)

### Key modules

- `lib/db.js`
  - MySQL2 pool from env vars (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- `lib/auth-session.ts`
  - Cookie session signing/verification
  - NIP-based auth context via `tb_karyawan_auth` + roles
  - Legacy PIN fallback via `tb_user`
  - Group-based capability checks (`schedule`, `dashboard`, `leader`)
- `lib/easylink-sdk-client.js`
  - Adapter selection (`auto`, `windows-sdk`, `fingerspot-easylink-ts`)
  - Windows SDK endpoint mapping is now **configurable** and supports fallback
  - Default endpoint lists:
    - Scanlogs: `/scanlog/new,/scanlog/all/paging,/getScanLogs` (env: `EASYLINK_WSDK_ENDPOINT_SCANLOGS`)
    - Users: `/user/all/paging,/getUsers` (env: `EASYLINK_WSDK_ENDPOINT_USERS`)
    - Device Info: `/dev/info,/getDeviceInfo` (env: `EASYLINK_WSDK_ENDPOINT_INFO`)
    - Device Time: `/dev/info,/getDeviceTime,/getDeviceInfo` (env: `EASYLINK_WSDK_ENDPOINT_TIME`)
  - For device info/time/scanlog/users, adapter can try fallback request strategies (`query` -> `form` -> `json`) and retries alternate endpoint candidates when command-style responses fail.

## 3) Current auth/permission model

- Login route: `app/api/auth/login/route.js`
  - Validates `nip` + `password`
  - Issues `easylink_session` cookie
- Session check route: `app/api/auth/me/route.js`
- App shell (`components/app-shell.jsx`) fetches `/api/auth/me` and redirects to `/login` if session invalid
- Most API routes enforce:
  - `unauthorizedResponse` when no session
  - `forbiddenResponse` when capability missing

## 4) Attendance and reporting behavior

- `app/api/attendance/route.js`
  - Aggregates daily attendance from `tb_scanlog`
  - Derives first/last scan (`masuk`, `keluar`) per day
  - Joins schedule/group/note tables to compute attendance status
  - Supports note updates with manual hour overrides
- `app/api/performance/route.js`
  - Builds per-employee summary (late/early/anomaly/on-time)
  - Supports CSV export

## 5) Device + scanlog integration

- Machine API route: `app/api/machine/route.js`
- Scanlog sync API route: `app/api/scanlog/sync/route.js`
- UI control page: `app/machine/page.jsx`

### Scanlog sync request controls

- `POST /api/scanlog/sync` now supports optional request controls:
  - `mode` (default `new`)
  - `from`, `to` (date range)
  - `limit` (default 100, capped 1000)
  - `page` (default 1)
  - `max_pages` / `maxPages` (default 3, capped 200)
- These values are forwarded to SDK pull adapter to reduce request surge and enable controlled paging windows.
- Route now enqueues long-running pulls with bounded concurrency. The handler returns `202 Accepted` with a `batch_id`, and a GET `?batch_id=` poll endpoint surfaces live status plus debug payload.
- Client UI (scanlog page) renders a right sidebar queue monitor with expandable raw JSON detail per batch. Default sync mode is "New" to protect the SDK; selecting "All" shows a warning banner.

### Machine UI response rendering notes

- `app/machine/page.jsx` now prefers raw SDK body for "Get Device Info" display.
- Device time rendering is object-safe (JSON stringified when needed) so `[object Object]` no longer appears.
- `/api/machine` GET (`action=info|time`) forwards SDK wrapper output including `raw` field, enabling direct troubleshooting from UI.

### Environment priorities for Windows SDK base URL

`lib/easylink-sdk-client.js` resolves Windows SDK target with this order:

1. `EASYLINK_WSDK_BASE_URL`
2. `EASYLINK_WSDK_IP` + `EASYLINK_WSDK_PORT`
3. fallback host derived from `EASYLINK_LAN_HOST` or `EASYLINK_API_HOST` + `EASYLINK_WSDK_PORT`

Postman LAN alignment currently uses:

- `EASYLINK_LAN_HOST=192.168.1.111:3001`
- `EASYLINK_API_HOST=192.168.1.111:3001`

## 6) Known technical pressure points

1. Heavy aggregate queries in attendance/performance routes can become expensive as scan volume grows.
2. Some API handlers combine business logic + SQL + response shaping in one file.
3. N+1 risks exist in user/group/schedule joins when expanding features.
4. Schema contains mixed legacy + new auth models, requiring careful compatibility strategy.

## 7) Safe change strategy

When implementing features/fixes:

1. Preserve auth checks first.
2. Reuse existing role/group helpers in `lib/auth-session.ts`.
3. For large query changes, gate by feature flag or shadow compare mode.
4. Run `npm run typecheck` and `npm run build` before finishing.
