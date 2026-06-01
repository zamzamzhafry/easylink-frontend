# HOP B Direct Cutover Observability + Alarms (Scanlog)

Purpose: operator-visible monitoring rules for HOP B direct cutover (Windows bridge buffers locally, retries with backoff, raises visible alarms). Covers backlog growth, auth failures, transport failures, Linux ingest failures, retry exhaustion, dead-letter.

Scope: scanlog sync only.

Non-goals: observability platform redesign, UI-only manual checks.

## Architecture recap (direct cutover)

```text
Device -> FService.exe on Windows (HTTP)
  -> Windows sync worker (PHP) writes local staging DB queue
  -> Windows pushes batches to Linux VM ingest API
  -> Linux VM app DB canonical
```

Reference: `ops/fservice-sync/FULL-SETUP-STEPS.md`.

## Operator contract

Operator must have:

- fast status output without browser clicking
- clear alarm thresholds + what evidence to collect
- one recovery path (restart bridge/app stack) plus safe rollback path

Preferred operator surfaces:

1. CLI commands (PowerShell / curl)
2. Local status JSON files (Windows host)
3. Linux VM API status endpoints
4. Log export bundles (Windows + Linux)

## Primary status outputs (no browser)

### Windows bridge host

1. FService health

PowerShell:

```powershell
# Replace IP/port if non-default
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8090/dev/info" -ContentType "application/x-www-form-urlencoded" -Body "sn=$env:EASYLINK_DEVICE_SN" -TimeoutSec 10
```

Expected signal:

- HTTP reachable
- response contains `Result: true`

Risk note: FService sometimes returns non-JSON or truncated responses. Treat parse errors as a health failure.

2. Sync worker health (proposed minimal)

Windows sync worker must write status snapshot file on each run:

- Path: `C:\EasyLinkOps\status\hop-b-sync-status.json`
- Write pattern: atomic write (write temp then rename)
- Update cadence: every sync loop run (on schedule or manual trigger)

Recommended JSON keys:

```json
{
  "ts": "2026-05-29T10:00:00+07:00",
  "device_sn": "Fio...",
  "bridge": {
    "base_url": "http://127.0.0.1:8090",
    "last_ok_ts": "2026-05-29T09:59:55+07:00",
    "last_error": null
  },
  "queue": {
    "pending": 0,
    "sending": 0,
    "sent": 120,
    "failed": 0,
    "dead_letter": 0,
    "oldest_pending_age_seconds": 0
  },
  "remote": {
    "vm_base_url": "http://<vm>:3000",
    "last_push_ok_ts": "2026-05-29T09:59:57+07:00",
    "last_push_http_status": 200,
    "last_push_error": null
  },
  "cursor": {
    "last_fservice_cursor": "<opaque>",
    "last_ingested_event_time": "2026-05-29T09:58:00+07:00"
  },
  "last_run": {
    "result": "success",
    "duration_ms": 1200,
    "fetched": 50,
    "pushed": 50,
    "deduped": 0
  }
}
```

3. Recovery task status (already supported)

Reference: `docs/release/server-machine-task-scheduler-setup.md`.

App expects:

- `EASYLINK_OPS_STATUS_PATH=C:\EasyLinkOps\status\recovery-status.json`

Operator can inspect file directly:

```powershell
Get-Content -Raw "C:\EasyLinkOps\status\recovery-status.json" | ConvertFrom-Json | Format-List
```

### Linux VM app

1. App auth health

```bash
curl -sS -m 10 http://127.0.0.1:3000/api/auth/me
```

Expected:

- 200 if logged in (cookie required)
- 401 if not authenticated

2. Scanlog sync endpoint reachability

```bash
curl -sS -m 20 http://127.0.0.1:3000/api/scanlog/sync
```

Expected:

- responds (even if it reports no work)
- no 500

Note: this endpoint shape may change. Contract for observability: provide at least one machine-readable status JSON response.

## Alarm signals (what to watch)

### A) Backlog growth (Windows local buffer)

Signal sources:

- `hop-b-sync-status.json` queue counts
- Windows staging DB counts (authoritative)

Definitions:

- backlog = `pending + failed` (exclude `sent`)
- dead letter = rows marked `dead_letter`

Alarm thresholds (start conservative, tune after first week):

- WARNING: backlog > 1,000 OR oldest_pending_age_seconds > 15 minutes
- CRITICAL: backlog > 10,000 OR oldest_pending_age_seconds > 60 minutes
- CRITICAL: dead_letter > 0 (any)

Evidence to collect:

- status file content (copy as evidence)
- DB query output (row counts)
- last 200 lines of worker log

### B) Auth failures (Linux ingest API)

Symptoms:

- Windows push HTTP status 401/403
- repeated auth errors with no successful push

Alarm thresholds:

- WARNING: >= 3 consecutive 401/403 in 10 minutes
- CRITICAL: any 401/403 lasting > 15 minutes

Evidence to collect:

- last 20 push attempts (timestamp, endpoint, status)
- Linux VM app logs around those timestamps

Policy note: do not treat generic 5xx/timeout as auth expiry.

### C) Transport failures (Windows -> Linux VM)

Symptoms:

- timeouts
- DNS failures
- connection refused
- TLS errors

Alarm thresholds:

- WARNING: >= 5 consecutive transport failures
- CRITICAL: transport failure streak > 15 minutes

Evidence:

- Windows worker log snippet (include error text)
- `Test-NetConnection <vm-host> -Port 3000` output

### D) Linux ingest failures (server-side 4xx/5xx)

Symptoms:

- Windows receives 500/502/503
- Linux app returns validation errors

Alarm thresholds:

- WARNING: >= 3 consecutive 5xx
- CRITICAL: 5xx persists > 10 minutes

Evidence:

- Linux server logs for `/api/scanlog/*`
- payload sample (redact secrets)

### E) Retry exhaustion + dead-letter

Definition:

- row moved to `dead_letter` after max attempts OR max age.

Alarm thresholds:

- CRITICAL: dead_letter > 0

Operator action:

- do not delete dead letters
- export dead-letter rows + logs
- only requeue after root cause confirmed

## Required log export expectations

### Windows bridge host

Keep:

- FService logs (or Windows Event Log entries if only source)
- sync worker logs (structured lines preferred)
- status JSON snapshots (keep last 48h)

Export bundle (zip) must include:

- `C:\EasyLinkOps\status\hop-b-sync-status.json`
- `C:\EasyLinkOps\status\recovery-status.json`
- `C:\EasyLinkOps\logs\hop-b-sync.log` (or equivalent)
- FService log folder (if exists)

### Linux VM app

Export:

- Next.js server logs (stdout/stderr from process manager)
- reverse proxy logs (if any)

## Evidence paths for HOP B failure + recovery

When alarm fires, operator produces evidence folder:

`.sisyphus/evidence/task-5-<date>-<incident-id>/`

Minimum files:

- `status/hop-b-sync-status.json` (copy)
- `status/recovery-status.json` (copy)
- `logs/windows-worker-tail.txt` (tail last 200 lines)
- `logs/linux-app-tail.txt` (tail last 200 lines)
- `notes.md` (what happened, what changed, timestamps)

## Command-based QA steps (for later evidence)

### 1) Windows: bridge reachable

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8090/dev/info" -ContentType "application/x-www-form-urlencoded" -Body "sn=$env:EASYLINK_DEVICE_SN" -TimeoutSec 10
```

Pass: JSON parse ok, `Result` true.

### 2) Windows: VM reachable

```powershell
Test-NetConnection -ComputerName <vm-host> -Port 3000
```

Pass: `TcpTestSucceeded : True`.

### 3) Windows: ingest push auth ok

If worker uses token/cookie, provide explicit one-shot check script that returns HTTP status.

Example:

```powershell
$uri = "http://<vm-host>:3000/api/scanlog/sync"
try {
  $resp = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 10
  "$($resp.StatusCode) $($resp.StatusDescription)"
} catch {
  $_.Exception.Message
}
```

Pass: no 401/403.

### 4) Linux: app alive

```bash
curl -sS -m 10 http://127.0.0.1:3000/api/auth/me
curl -sS -m 20 http://127.0.0.1:3000/api/scanlog/sync
```

Pass: no 500.

## Known risks to reflect in alarms

1. Windows local DB schema drift

- treat DB errors (missing columns, migration mismatch) as CRITICAL
- evidence: exact SQL error + schema snapshot

2. FService non-JSON instability

- treat JSON parse errors as transport failure
- evidence: raw response (first 4KB) + HTTP status + timing

3. Direct cutover outage policy

- Windows buffers locally
- retry with backoff
- raise visible alarms (status JSON + logs)

## Rollback notes (direct cutover)

Rollback goal: stop pushing to VM, keep buffering locally, preserve evidence.

Operator steps (high level):

1. disable scheduled sync task (stop new pushes)
2. keep local staging DB intact
3. export evidence bundle
4. only after fix, re-enable with smaller batch size and monitor backlog
