# HOP B Direct-Cutover Observability & Alarms Runbook

Last updated: 2026-05-29

## Purpose

Operator reference for monitoring the HOP B scanlog sync worker during direct-cutover migration. Covers status file contract, alarm thresholds, operator commands, log export, and recovery procedures.

Architecture: Windows machine buffers scanlogs locally, syncs to Linux VM in batches with retry/backoff. This runbook tracks the health of that sync pipeline.

---

## Status File Contract

The Windows sync worker emits a status file on every run cycle:

**Path:** `C:\EasyLinkOps\status\hop-b-sync-status.json`

**Write method:** Atomic (write to `.tmp`, rename to final path)

**Schema:**

```json
{
  "last_run_at": "2026-05-29T10:15:00+07:00",
  "status": "ok",
  "pending_count": 0,
  "failed_count": 0,
  "dead_letter_count": 0,
  "oldest_pending_age_minutes": 0,
  "last_successful_sync_at": "2026-05-29T10:15:00+07:00",
  "last_error": null
}
```

| Field | Type | Description |
|---|---|---|
| `last_run_at` | ISO 8601 | Timestamp of most recent worker run |
| `status` | `ok\|warning\|critical` | Computed aggregate health |
| `pending_count` | int | Records queued but not yet synced |
| `failed_count` | int | Records that failed on last attempt (will retry) |
| `dead_letter_count` | int | Records that exhausted all retries |
| `oldest_pending_age_minutes` | int | Age of oldest unsynced record |
| `last_successful_sync_at` | ISO 8601 | Last time a batch synced successfully |
| `last_error` | string or null | Most recent error message, null if clean |

**Environment variable:** Set on the Windows host:

```powershell
$env:EASYLINK_HOP_B_STATUS_PATH = 'C:\EasyLinkOps\status\hop-b-sync-status.json'
```

This follows the same pattern as the existing recovery status file (`C:\EasyLinkOps\status\recovery-status.json`).

---

## Alarm Signals

| Signal | Threshold | Severity | Action |
|---|---|---|---|
| Backlog growth | `pending_count > 500` OR `oldest_pending_age > 60` min | WARNING | Check network connectivity to VM, check worker scheduler |
| Auth failures | 3+ consecutive HTTP 401/403 responses | CRITICAL | Rotate or verify API token immediately |
| Transport failures | 5+ consecutive connection timeouts | WARNING | Check network path to VM (ping, traceroute, firewall) |
| Ingest failures | HTTP 500 from VM on 3+ consecutive batches | CRITICAL | Check VM application logs, possible DB or app issue |
| Dead letters | `dead_letter_count > 0` | CRITICAL | Manual review required — records exhausted all retries |
| Stale sync | `last_successful_sync_at` older than 2 hours | WARNING | Check worker scheduled task is running |

### Severity definitions

- **WARNING** — Operator should investigate within 30 minutes. Sync is degraded but data is buffered safely.
- **CRITICAL** — Operator should act immediately. Data loss risk or auth compromise possible.

### Important: do not conflate alarm types

- Auth failures (401/403) are distinct from transport failures (timeouts) and ingest failures (500s). Each has a different root cause and recovery path.
- Transport failures alarm on streak duration, not single failures. Transient network blips are expected.

---

## Operator Commands

All commands run on the **Windows host** in an elevated PowerShell session.

### Check sync status

```powershell
# Read current status
Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json | Format-List

# Quick health check (returns status field only)
(Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json).status
```

### Check pending/dead letter counts

```powershell
$s = Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json
Write-Host "Pending: $($s.pending_count)  Failed: $($s.failed_count)  Dead: $($s.dead_letter_count)"
```

### View worker logs (tail)

```powershell
# Last 50 lines of sync worker log
Get-Content C:\EasyLinkOps\logs\hop-b-sync.log -Tail 50

# Follow log in real time
Get-Content C:\EasyLinkOps\logs\hop-b-sync.log -Tail 20 -Wait
```

### Force immediate sync run

```powershell
# Trigger the scheduled task manually
Start-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'HopB-Sync'
```

### Check scheduled task state

```powershell
Get-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'HopB-Sync' | Format-List State, LastRunTime, LastTaskResult, NextRunTime
```

### Clear dead letters (after manual review)

```powershell
# Export dead letters for review first
# (actual command depends on worker implementation — placeholder)
# Then clear:
# Invoke-Expression "node C:\EasyLinkOps\scripts\hop-b-clear-dead-letters.js"
```

### Test VM connectivity

```powershell
# Ping VM
Test-Connection -ComputerName <VM_HOST> -Count 3

# Test API endpoint
Invoke-RestMethod -Uri "https://<VM_HOST>/api/health" -Method GET -TimeoutSec 10
```

---

## Log Export Bundle

When filing an incident, collect this evidence bundle:

### Bundle structure

```
incident-<date>-<id>/
├── hop-b-sync-status.json      # Copy of status file at time of incident
├── hop-b-sync-status-prev.json # Previous status file if available
├── hop-b-sync-tail.log         # Last 200 lines of worker log
├── scheduled-task-info.txt     # Task scheduler state dump
├── operator-notes.md           # What operator observed, steps taken
└── vm-health-check.txt         # VM health endpoint response (if reachable)
```

### Collection script

```powershell
$incidentId = "$(Get-Date -Format 'yyyy-MM-dd')-$(New-Guid | Select-Object -ExpandProperty Guid | ForEach-Object { $_.Substring(0,8) })"
$outDir = "C:\EasyLinkOps\incidents\$incidentId"
New-Item -ItemType Directory -Force $outDir

# Status file
Copy-Item C:\EasyLinkOps\status\hop-b-sync-status.json "$outDir\hop-b-sync-status.json"

# Worker log tail
Get-Content C:\EasyLinkOps\logs\hop-b-sync.log -Tail 200 | Out-File "$outDir\hop-b-sync-tail.log"

# Scheduled task info
Get-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'HopB-Sync' | Format-List * | Out-File "$outDir\scheduled-task-info.txt"

# VM health (best effort)
try {
    Invoke-RestMethod -Uri "https://<VM_HOST>/api/health" -Method GET -TimeoutSec 10 | Out-File "$outDir\vm-health-check.txt"
} catch {
    "UNREACHABLE: $($_.Exception.Message)" | Out-File "$outDir\vm-health-check.txt"
}

# Operator notes placeholder
"# Operator Notes`n`nIncident: $incidentId`nTime: $(Get-Date -Format o)`n`n## Observations`n`n## Actions Taken`n" | Out-File "$outDir\operator-notes.md"

Write-Host "Evidence bundle: $outDir"
```

---

## Recovery Procedures

### 1. Network Outage Recovery

**Trigger:** Transport failures alarm (5+ consecutive timeouts) or stale sync alarm.

**Steps:**

1. Confirm network state:
   ```powershell
   Test-Connection -ComputerName <VM_HOST> -Count 5
   Test-NetConnection -ComputerName <VM_HOST> -Port 443
   ```

2. Check Windows firewall hasn't changed:
   ```powershell
   Get-NetFirewallRule -Direction Outbound -Enabled True | Where-Object { $_.DisplayName -match 'EasyLink' }
   ```

3. Once network is restored, the sync worker will automatically retry pending records on its next scheduled run. No manual intervention needed for buffered data.

4. Verify recovery:
   ```powershell
   # Wait for next run, then check
   (Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json).status
   # Should return "ok" and pending_count should be decreasing
   ```

5. If backlog is very large (>1000), monitor that `pending_count` decreases steadily over subsequent runs.

### 2. Auth Token Rotation

**Trigger:** Auth failures alarm (3+ consecutive 401/403).

**Steps:**

1. Collect evidence bundle first (see Log Export Bundle above).

2. Verify the issue is auth, not server-side:
   ```powershell
   # Manual test with current token
   $token = $env:EASYLINK_HOP_B_API_TOKEN
   Invoke-RestMethod -Uri "https://<VM_HOST>/api/health" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 10
   ```

3. If confirmed 401/403, obtain new token from VM admin.

4. Update the environment variable:
   ```powershell
   # Set for current session
   $env:EASYLINK_HOP_B_API_TOKEN = '<new-token>'

   # Persist in system env (requires admin)
   [System.Environment]::SetEnvironmentVariable('EASYLINK_HOP_B_API_TOKEN', '<new-token>', 'Machine')
   ```

5. Force a sync run to verify:
   ```powershell
   Start-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'HopB-Sync'
   Start-Sleep -Seconds 30
   (Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json) | Format-List status, last_error
   ```

6. Confirm `status` returns to `ok` and `last_error` is null.

### 3. Dead Letter Replay

**Trigger:** `dead_letter_count > 0` in status file.

**Steps:**

1. Collect evidence bundle first.

2. Identify what failed:
   ```powershell
   # Review dead letter details in worker log
   Select-String -Path C:\EasyLinkOps\logs\hop-b-sync.log -Pattern 'dead.letter' -Context 2,2 | Select-Object -Last 20
   ```

3. Determine root cause before replay:
   - If auth issue → fix auth first (see procedure 2)
   - If VM was down → confirm VM is healthy first
   - If data issue → review individual records

4. Replay dead letters (once root cause resolved):
   ```powershell
   # Actual command depends on worker implementation
   # Example placeholder:
   # node C:\EasyLinkOps\scripts\hop-b-replay-dead-letters.js
   ```

5. Monitor replay:
   ```powershell
   # Watch dead_letter_count decrease
   while ($true) {
       $s = Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json
       Write-Host "$(Get-Date -Format 'HH:mm:ss') Dead: $($s.dead_letter_count) Pending: $($s.pending_count)"
       if ($s.dead_letter_count -eq 0) { Write-Host "All clear."; break }
       Start-Sleep -Seconds 15
   }
   ```

6. If replay fails again, escalate — the records may have a structural issue.

### 4. VM Restart Recovery

**Trigger:** Ingest failures alarm (HTTP 500 on 3+ batches), confirmed VM was restarted.

**Steps:**

1. Confirm VM is back and healthy:
   ```powershell
   Invoke-RestMethod -Uri "https://<VM_HOST>/api/health" -Method GET -TimeoutSec 10
   ```

2. The sync worker handles VM downtime gracefully — records stay in local buffer with retry backoff. After VM comes back, sync resumes automatically on the next scheduled run.

3. If sync doesn't resume within 2 run cycles:
   ```powershell
   # Check task is still scheduled
   Get-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'HopB-Sync' | Format-List State

   # Force a run
   Start-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'HopB-Sync'
   ```

4. Monitor backlog drain:
   ```powershell
   # pending_count should decrease each run
   (Get-Content C:\EasyLinkOps\status\hop-b-sync-status.json | ConvertFrom-Json) | Select-Object pending_count, oldest_pending_age_minutes
   ```

5. If backlog was very large (accumulated during extended VM outage), allow extra time. The worker processes in batches to avoid overwhelming the freshly-restarted VM.

---

## Related Documents

- [Server Machine Task Scheduler Setup](release/server-machine-task-scheduler-setup.md) — existing recovery task ops pattern
- Existing recovery status: `C:\EasyLinkOps\status\recovery-status.json`
- Worker logs: `C:\EasyLinkOps\logs\hop-b-sync.log`
- Scheduled task path: `\EasyLink\HopB-Sync`
