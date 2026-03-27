# Machine SDK Routing and Debug Notes

## Why this document exists

This note captures the machine-connect troubleshooting and fixes for Windows SDK integration, so future workers can continue safely without repeating the same routing mistakes.

## Reported Symptoms (before fix)

1. Machine Connect `Get Device Info` returned:

```json
{
  "source": "windows-sdk",
  "sn": "Fio66208021230737",
  "name": "EasyLink Device",
  "info": {
    "Result": false,
    "message": "Command not found"
  }
}
```

2. UI showed: `Device time: [object Object]`

## Root Cause

- Windows SDK adapter had single hardcoded command paths (`/getDeviceInfo`, etc.) and JSON-only request style.
- Actual target machine accepts `POST /dev/info?sn=...` and returns raw `DEVINFO` payload.
- Frontend rendered `deviceTime` inline as text; object payload became `[object Object]`.

## Implemented Fixes

### 1) Non-hardcoded endpoint mapping + fallback strategies

File: `lib/easylink-sdk-client.js`

- Added configurable endpoint lists via env:
  - `EASYLINK_WSDK_ENDPOINT_SCANLOGS` (default `/getScanLogs`)
  - `EASYLINK_WSDK_ENDPOINT_USERS` (default `/getUsers`)
  - `EASYLINK_WSDK_ENDPOINT_INFO` (default `/dev/info,/getDeviceInfo`)
  - `EASYLINK_WSDK_ENDPOINT_TIME` (default `/dev/info,/getDeviceTime,/getDeviceInfo`)
- Added request fallback chain for info/time requests:
  - `query` -> `form` -> `json`
- Added guard that retries next endpoint/strategy when SDK responds with command-style errors (e.g. `Result:false`, `message: "Command not found"`).
- Added raw passthrough in SDK wrappers:
  - `getDeviceInfoFromSdk()` now returns `{ source, info, raw }` (when available)
  - `getDeviceTimeFromSdk()` now returns `{ source, time, raw }` (when available)

### 2) Machine page rendering fixes

File: `app/machine/page.jsx`

- `Get Device Info` now prefers raw body (`data.raw`) to show direct SDK payload in `<pre>`.
- Device time display now uses object-safe formatter (JSON stringify for object values), preventing `[object Object]`.
- Time actions now support fallback fields from both normalized and raw responses.

## Verified Response Pattern from target machine

Successful command observed:

```bash
curl -sS -m 10 -X POST "http://192.168.1.111:8090/dev/info?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
```

Example response:

```json
{
  "Result": true,
  "DEVINFO": {
    "Jam": "27/03/2026 00:44:55",
    "Admin": "1",
    "User": "133",
    "FP": "132",
    "Face": "134",
    "Vein": "134",
    "CARD": "0",
    "PWD": "0",
    "All Operasional": "0",
    "All Presensi": "55598",
    "New Operasional": "0",
    "New Presensi": "0"
  }
}
```

## Commands to give user when agent environment cannot reach LAN target

If network/guardrails block direct LAN access from the agent, ask user to run these commands and share output.

### A) Query-string mode

```bash
curl -sS -m 10 -X POST "http://192.168.1.111:8090/dev/info?sn=Fio66208021230737" -H "Content-Type: application/x-www-form-urlencoded"
```

### B) Form-urlencoded body mode

```bash
curl -sS -m 10 -X POST "http://192.168.1.111:8090/dev/info" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "sn=Fio66208021230737"
```

### C) PowerShell alternative (if curl argument parsing differs)

```powershell
Invoke-RestMethod -Method Post -Uri "http://192.168.1.111:8090/dev/info?sn=Fio66208021230737" -ContentType "application/x-www-form-urlencoded"
```

## Verification checklist (used in this session)

1. `lsp_diagnostics` clean for:
   - `lib/easylink-sdk-client.js`
   - `app/machine/page.jsx`
2. `npm run typecheck` passed.
3. `npm run build` passed.
4. Direct SDK curl query returned `Result: true` with `DEVINFO` body.

## SDK parity update (aligned to `docs/learning/easylink.ps1`)

This repository now follows the PowerShell reference behavior more closely for long-running paging and device time operations.

### Timeout and retry tolerance

File: `lib/easylink-sdk-client.js`

- Request timeout is now configurable instead of fixed for all calls:
  - `EASYLINK_WSDK_TIMEOUT_MS` (default `30000`)
  - `EASYLINK_WSDK_PAGING_TIMEOUT_MS` (default `120000`)
  - `EASYLINK_WSDK_INFO_TIMEOUT_MS` (default `30000`)
  - `EASYLINK_WSDK_TIME_TIMEOUT_MS` (default `30000`)
  - `EASYLINK_WSDK_SETTIME_TIMEOUT_MS` (default `45000`)
- Sync time now retries like script-style tolerance:
  - `EASYLINK_WSDK_SETTIME_RETRY_ATTEMPTS` (default `3`)
  - `EASYLINK_WSDK_RETRY_DELAY_MS` (default `3000`)

### Paging behavior tolerance (scanlog/users)

- `getScanlogs(mode='all')` and `getUsers()` now use high safe defaults and continue paging until terminal conditions are reached.
- Pagination continuation logic no longer assumes `next_page = current + 1` when server does not send paging metadata.
- Empty page (`Data: []`) now ends loop immediately.
- `all` mode defaults to larger page-window tolerance:
  - `EASYLINK_SCANLOG_MAX_PAGES` default `1000`
  - `EASYLINK_USER_MAX_PAGES` default `1000`

### Device time sync / get time hardening

- Device time retrieval now includes safer normalization fallback from both parsed payload and raw payload.
- Sync time request now sends `sn` plus time aliases (`time`, `datetime`, `jam`) for wider SDK compatibility.

## Docs cleanup performed

- Renamed response fixture to expected path:
  - `docs/learning/response_from_easylink_script.txt`
- Removed legacy PHP docs under `docs/learning/*.php` per cleanup request.
