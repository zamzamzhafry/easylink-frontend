# Windows Server Task Scheduler Setup

Last updated: 2026-04-23

## Purpose

This runbook is for the **server machine**, not the current dev machine.

Use it when:

- the EasyLink frontend app is already deployed on a Windows server
- the dashboard should be able to trigger a fixed recovery task
- the recovery task should restart the bridge/app stack and write a status file

This matches the current app behavior:

- dashboard button calls `POST /api/ops/recovery`
- backend runs `Start-ScheduledTask`
- backend reads task status and optional status JSON file

The app expects these env values on the **frontend server host**:

```powershell
$env:EASYLINK_RECOVERY_TASK_NAME='\EasyLink\EasyLink-Recovery'
$env:EASYLINK_OPS_STATUS_PATH='C:\EasyLinkOps\status\recovery-status.json'
```

## Recommended server-side layout

Create these folders on the server:

```powershell
New-Item -ItemType Directory -Force C:\EasyLinkOps\status
New-Item -ItemType Directory -Force C:\EasyLinkOps\logs
New-Item -ItemType Directory -Force C:\EasyLinkOps\scripts
```

Recommended task name:

- Folder: `\EasyLink\`
- Task: `EasyLink-Recovery`

That matches the default app-side configuration cleanly.

## What the task should do

The scheduled task should run **one PowerShell script** that:

1. checks whether the PHP bridge is healthy
2. checks whether the frontend app is healthy
3. kills stale processes only when unhealthy or stuck
4. restarts the PHP bridge
5. restarts the frontend app if needed
6. writes a JSON status file to `C:\EasyLinkOps\status\recovery-status.json`

The dashboard button does **not** run arbitrary commands. It only triggers this fixed task.

## Recommended status JSON shape

Write a file at:

`C:\EasyLinkOps\status\recovery-status.json`

Recommended structure:

```json
{
  "bridge_status": "healthy",
  "bridge_port": 8091,
  "app_status": "healthy",
  "app_port": 3000,
  "last_recovery_reason": "manual_trigger",
  "last_restarted": "2026-04-23T10:15:00+07:00",
  "last_result": "success",
  "notes": "No restart required"
}
```

The current dashboard panel will display any JSON object keys it can read, so this shape is a recommendation, not a strict schema.

## Example recovery script flow

Create a script like:

`C:\EasyLinkOps\scripts\run-recovery-task.ps1`

Suggested flow:

```powershell
$statusPath = 'C:\EasyLinkOps\status\recovery-status.json'
$bridgeHealthUrl = 'http://127.0.0.1:8091/health'
$appHealthUrl = 'http://127.0.0.1:3000/api/auth/me'

function Test-Url($url) {
  try {
    Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 10 | Out-Null
    return $true
  } catch {
    return $false
  }
}

$bridgeOk = Test-Url $bridgeHealthUrl
$appOk = Test-Url $appHealthUrl

$result = [ordered]@{
  bridge_status = if ($bridgeOk) { 'healthy' } else { 'unhealthy' }
  app_status = if ($appOk) { 'healthy' } else { 'unhealthy' }
  last_recovery_reason = 'manual_trigger'
  last_restarted = (Get-Date).ToString('o')
  last_result = 'success'
  notes = 'No restart required'
}

if (-not $bridgeOk) {
  Get-Process php -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath 'C:\php\php.exe' -ArgumentList 'C:\EasyLinkBridge\public\index.php'
  $result.bridge_status = 'restarted'
  $result.notes = 'Bridge process restarted'
}

if (-not $appOk) {
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','cd /d C:\Apps\easylink-frontend && npm start'
  $result.app_status = 'restarted'
  $result.notes = 'Frontend app restarted'
}

$result | ConvertTo-Json -Depth 5 | Set-Content -Path $statusPath -Encoding UTF8
```

Adjust the actual process start commands to match your server:

- PM2
- NSSM
- IIS app pool recycle
- Apache/PHP
- plain `node` and `php.exe`

## Create the scheduled task

### Option A: PowerShell

Run on the server as administrator:

```powershell
$taskName = 'EasyLink-Recovery'
$taskPath = '\EasyLink\'
$scriptPath = 'C:\EasyLinkOps\scripts\run-recovery-task.ps1'

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $taskName `
  -TaskPath $taskPath `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description 'EasyLink recovery task for bridge/frontend health and restart'
```

Then verify:

```powershell
Get-ScheduledTask -TaskPath '\EasyLink\' -TaskName 'EasyLink-Recovery'
Get-ScheduledTaskInfo -TaskPath '\EasyLink\' -TaskName 'EasyLink-Recovery'
```

### Option B: `schtasks`

```powershell
schtasks /Create `
  /TN "\EasyLink\EasyLink-Recovery" `
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\EasyLinkOps\scripts\run-recovery-task.ps1" `
  /SC ONCE `
  /ST 23:59 `
  /RU SYSTEM `
  /RL HIGHEST `
  /F
```

Then test it manually:

```powershell
schtasks /Run /TN "\EasyLink\EasyLink-Recovery"
```

## Task settings to enable

In Task Scheduler, confirm:

1. `Run whether user is logged on or not`
2. `Run with highest privileges`
3. `Allow task to be run on demand`
4. `If the task is already running: Do not start a new instance`
5. `Start the task as soon as possible after a scheduled start is missed`

These are important because the dashboard trigger uses **manual on-demand run** semantics.

## Optional recurring watchdog tasks

Recommended split:

- `\EasyLink\EasyLink-Recovery`
  - on-demand task
  - triggered from dashboard
- `\EasyLink\EasyLink-Watchdog`
  - every 5 minutes
  - same script or a lighter health-check script
- `\EasyLink\EasyLink-PullScanlog`
  - every 1-2 minutes
  - bridge pulls `/scanlog/new`
- `\EasyLink\EasyLink-PullUsers`
  - nightly or hourly
  - bridge pulls `/user/all/paging`

The frontend app currently only knows about the **recovery** task, but the server can still run the other scheduled jobs independently.

## Recommended split based on the current SDK PHP repo

The sibling PHP repo at `E:\Project\sdk` already shows the pattern that works with this device:

- device info: `POST /dev/info`
- full user pull: `POST /user/all/paging`
- full scanlog pull: `POST /scanlog/all/paging`
- incremental scanlog pull: `POST /scanlog/new`

It also uses these connection rules:

- `set_time_limit(0)`
- `CURLOPT_TIMEOUT => 0`
- `application/x-www-form-urlencoded`
- payloads like `sn=...&limit=...`

That means the server machine should treat the bridge as an **internal worker** with tolerant timeouts, not as a public API with strict request deadlines.

Recommended scheduled tasks:

- `\EasyLink\EasyLink-Recovery`
  - manual and watchdog recovery for PHP bridge + frontend
- `\EasyLink\EasyLink-PullScanlogNew`
  - every 1 minute
  - calls bridge logic that hits `/scanlog/new`
  - best for near-real-time attendance refresh
- `\EasyLink\EasyLink-PullUsersFull`
  - once per night or once per hour
  - calls bridge logic that hits `/user/all/paging`
  - refreshes user/template data
- `\EasyLink\EasyLink-PullScanlogFull`
  - manual or every few hours only
  - calls bridge logic that hits `/scanlog/all/paging`
  - use for recovery or reconciliation, not every minute

Recommended Windows commands:

```powershell
schtasks /Run /TN "\EasyLink\EasyLink-PullScanlogNew"
schtasks /Run /TN "\EasyLink\EasyLink-PullUsersFull"
schtasks /Run /TN "\EasyLink\EasyLink-PullScanlogFull"
```

If you implement the bridge as plain PHP scripts instead of a routed mini-service, each task can directly run one script:

```powershell
php.exe C:\EasyLinkBridge\jobs\pull-scanlog-new.php
php.exe C:\EasyLinkBridge\jobs\pull-users-full.php
php.exe C:\EasyLinkBridge\jobs\pull-scanlog-full.php
```

If you implement the bridge as a local PHP or Express HTTP service, the scheduled task can hit the local endpoint instead:

```powershell
powershell.exe -NoProfile -Command "Invoke-WebRequest -Method Post -Uri http://127.0.0.1:8091/internal/pull/scanlog/new -UseBasicParsing"
```

For this setup, direct-script execution is simpler and usually more reliable on the server.

## App-side configuration

On the frontend server host, set:

```powershell
$env:EASYLINK_RECOVERY_TASK_NAME='\EasyLink\EasyLink-Recovery'
$env:EASYLINK_OPS_STATUS_PATH='C:\EasyLinkOps\status\recovery-status.json'
```

If your task name differs, update `EASYLINK_RECOVERY_TASK_NAME` to the full task path.

## Smoke test

From the server:

```powershell
Get-ScheduledTaskInfo -TaskPath '\EasyLink\' -TaskName 'EasyLink-Recovery'
schtasks /Run /TN "\EasyLink\EasyLink-Recovery"
Get-Content C:\EasyLinkOps\status\recovery-status.json
```

Then from the app:

1. log in as admin
2. open dashboard
3. confirm `Operations Control` panel loads
4. click `Run Recovery Task`
5. confirm last run/result and health summary update

## Important guardrails

- Keep the task fixed-name and pre-created. Do not let the app accept arbitrary task names.
- Keep the script local to the server. Do not expose it directly over the network.
- If the bridge is intentionally loose or internal-only, protect it at the network layer:
  - localhost binding
  - private subnet only
  - Windows Firewall allowlist
- Do not make the loose internal bridge internet-facing.
- If you skip auth between Task Scheduler and the local bridge, compensate with OS-level and network-level restrictions.
- If you later change the task path/name, update `EASYLINK_RECOVERY_TASK_NAME` in the frontend app environment too.
