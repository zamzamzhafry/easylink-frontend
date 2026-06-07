# ops\fservice-sync\handshake-test.ps1
# EasyLink — Windows -> VM (192.168.1.129) handshake probe.
#
# Verifies (in order):
#   1. TCP reach to VM:3000
#   2. Read-only GET  /api/scanlog/hop-b-status         (build sanity)
#   3. Authed  POST   /api/scanlog/ingest (empty batch)  (token + contract sanity)
#
# Step 3 sends a SCHEMA-VALID Hop B envelope with an empty records array.
# Verified against lib/hop-b-ingest-contract.js: such a payload passes
# auth -> content-type -> JSON parse -> envelope validation, and is rejected
# ONLY by the empty-records guard with HTTP 400 + code "BATCH_EMPTY".
# Nothing is written to tb_hop_b_ingest_log (rejection happens before the
# receipt/ledger step). This is the precise, non-polluting handshake.
#
# Usage:
#   cd C:\path\to\easylink-frontend
#   powershell -ExecutionPolicy Bypass -File .\ops\fservice-sync\handshake-test.ps1
#
# Optional overrides (env or params):
#   $env:HOP_B_INGEST_URL  default: http://192.168.1.129:3000/api/scanlog/ingest
#   $env:HOP_B_AUTH_TOKEN  required for step 3 (must match VM .env)
#
# Exit codes:
#   0 = all 3 checks PASS
#   1 = TCP unreachable
#   2 = status endpoint failed (build stale / route missing / 5xx)
#   3 = auth handshake failed (token mismatch / route missing)
#   4 = HOP_B_AUTH_TOKEN not set

[CmdletBinding()]
param(
  [string]$VmHost  = '192.168.1.129',
  [int]   $VmPort  = 3000,
  [int]   $Timeout = 10
)

$ErrorActionPreference = 'Stop'

# --- helpers -----------------------------------------------------------------

function Write-Section([string]$Title) {
  Write-Host ''
  Write-Host ('=' * 60) -ForegroundColor DarkGray
  Write-Host (" $Title") -ForegroundColor Cyan
  Write-Host ('=' * 60) -ForegroundColor DarkGray
}

function Write-Pass([string]$Msg) { Write-Host "[PASS] $Msg" -ForegroundColor Green }
function Write-Fail([string]$Msg) { Write-Host "[FAIL] $Msg" -ForegroundColor Red }
function Write-Info([string]$Msg) { Write-Host "[..]   $Msg" -ForegroundColor Yellow }

$base = "http://${VmHost}:${VmPort}"

# Allow env override of ingest URL; default derived from $VmHost/$VmPort.
$ingestUrl = if ([string]::IsNullOrWhiteSpace($env:HOP_B_INGEST_URL)) {
  "$base/api/scanlog/ingest"
} else {
  $env:HOP_B_INGEST_URL
}
$statusUrl = "$base/api/scanlog/hop-b-status"

Write-Section "EasyLink handshake probe -> $base"
Write-Host "Status URL : $statusUrl"
Write-Host "Ingest URL : $ingestUrl"
Write-Host "Timeout    : ${Timeout}s"

# --- 1. TCP reach ------------------------------------------------------------

Write-Section "Step 1 / 3  -- TCP reach $VmHost`:$VmPort"

$tcp = $null
try {
  $tcp = Test-NetConnection -ComputerName $VmHost -Port $VmPort `
    -InformationLevel Quiet -WarningAction SilentlyContinue
} catch {
  $tcp = $false
}

if (-not $tcp) {
  Write-Fail "Cannot reach $VmHost`:$VmPort over TCP."
  Write-Host "  - Is the VM up?"
  Write-Host "  - Is Next.js bound to 0.0.0.0 (not 127.0.0.1)?"
  Write-Host "  - Is Linux firewall (ufw / firewalld) blocking port $VmPort?"
  exit 1
}
Write-Pass "TCP $VmHost`:$VmPort reachable."

# --- 2. read-only status -----------------------------------------------------

Write-Section "Step 2 / 3  -- GET $statusUrl"

$statusOk = $false
try {
  $resp = Invoke-WebRequest -Uri $statusUrl `
    -Method GET `
    -TimeoutSec $Timeout `
    -UseBasicParsing `
    -ErrorAction Stop

  $code = [int]$resp.StatusCode
  $ct   = [string]$resp.Headers.'Content-Type'
  Write-Host "  HTTP $code   Content-Type: $ct"

  if ($code -eq 200 -and $ct -match 'application/json') {
    Write-Pass "Status endpoint returned JSON 200."
    $statusOk = $true
  } elseif ($ct -match 'text/html') {
    Write-Fail "Got HTML body (likely Next.js 404 page) -> VM is on a stale build."
    Write-Host "  Fix: on VM, re-run sections A.1 -> A.5 of the handout."
  } else {
    Write-Fail "Unexpected status $code / type $ct."
    Write-Host "  Body (first 400 chars):"
    $resp.Content.Substring(0, [Math]::Min(400, $resp.Content.Length)) | Write-Host
  }
} catch [System.Net.WebException] {
  $we = $_.Exception
  if ($we.Response) {
    $code = [int]$we.Response.StatusCode
    Write-Fail "HTTP $code from status endpoint."
    if ($code -eq 404) {
      Write-Host "  Route missing -> VM build is stale. Rebuild on VM."
    }
  } else {
    Write-Fail "Network error: $($we.Message)"
  }
} catch {
  Write-Fail "Unexpected error: $($_.Exception.Message)"
}

if (-not $statusOk) { exit 2 }

# --- 3. auth handshake -------------------------------------------------------

Write-Section "Step 3 / 3  -- POST $ingestUrl (empty batch, authed)"

if ([string]::IsNullOrWhiteSpace($env:HOP_B_AUTH_TOKEN)) {
  Write-Fail "HOP_B_AUTH_TOKEN env var is not set on this Windows box."
  Write-Host "  Set it for current shell, then re-run:"
  Write-Host '    $env:HOP_B_AUTH_TOKEN = "<paste token from VM .env>"'
  exit 4
}

# Schema-valid Hop B envelope with empty records.
# Field names + values match lib/hop-b-ingest-contract.js exactly:
#   schema_version must = 1.0.0, source_sdk must = fservice-hop-b,
#   batch_id must be UUID v4, sent_at must be ISO 8601 UTC.
# records:[] -> deterministic 400 BATCH_EMPTY (proves full path, writes nothing).
$batchId = [guid]::NewGuid().ToString()
$sentAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$envelope = [ordered]@{
  schema_version = '1.0.0'
  batch_id       = $batchId
  sent_at        = $sentAt
  source_sdk     = 'fservice-hop-b'
  device_sn      = 'HANDSHAKE-PROBE'
  record_count   = 0
  records        = @()
}
$body = $envelope | ConvertTo-Json -Compress
$headers = @{
  'Content-Type'  = 'application/json'
  'Authorization' = "Bearer $($env:HOP_B_AUTH_TOKEN)"
}

$authOk = $false
try {
  $resp = Invoke-WebRequest -Uri $ingestUrl `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -TimeoutSec $Timeout `
    -UseBasicParsing `
    -ErrorAction Stop

  # A schema-valid empty batch should NEVER reach 2xx (records:[] is rejected).
  # A 2xx here means the contract changed; surface it rather than silently pass.
  $code = [int]$resp.StatusCode
  $ct   = [string]$resp.Headers.'Content-Type'
  Write-Host "  HTTP $code   Content-Type: $ct"
  Write-Host "  Body: $($resp.Content)"
  Write-Fail "Empty batch unexpectedly accepted (HTTP $code). Ingest contract may have changed."
  Write-Host "  Re-verify lib/hop-b-ingest-contract.js before trusting this probe."
} catch [System.Net.WebException] {
  $we = $_.Exception
  if ($we.Response) {
    $code   = [int]$we.Response.StatusCode
    $stream = $we.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $bodyOut = $reader.ReadToEnd()
    Write-Host "  HTTP $code"
    Write-Host "  Body: $bodyOut"

    # Parse the JSON error envelope and assert on its `code` field.
    $errCode = $null
    try { $errCode = ($bodyOut | ConvertFrom-Json).code } catch { $errCode = $null }

    if ($code -eq 400 -and $errCode -eq 'BATCH_EMPTY') {
      # Exact expected outcome: TCP + content-type + Bearer token + JSON parse
      # + envelope schema ALL passed; only the empty-records guard fired.
      Write-Pass "Handshake confirmed (HTTP 400 BATCH_EMPTY) -> token + contract OK."
      $authOk = $true
    } elseif ($code -eq 401) {
      Write-Fail "401 $errCode -> HOP_B_AUTH_TOKEN does not match VM .env."
      Write-Host "  Fix: copy exact value from VM:  grep HOP_B_AUTH_TOKEN .env"
    } elseif ($code -eq 415) {
      Write-Fail "415 $errCode -> Content-Type not sent as application/json (client bug)."
    } elseif ($code -eq 404) {
      Write-Fail "404 -> ingest route missing on VM. Rebuild VM (handout A.1 -> A.5)."
    } elseif ($code -eq 400) {
      Write-Fail "400 $errCode -> reached route + token OK, but envelope rejected unexpectedly."
      Write-Host "  Expected code BATCH_EMPTY. Got '$errCode'. Contract may have changed."
    } else {
      Write-Fail "HTTP $code $errCode from ingest endpoint."
    }
  } else {
    Write-Fail "Network error: $($we.Message)"
  }
} catch {
  Write-Fail "Unexpected error: $($_.Exception.Message)"
}

if (-not $authOk) { exit 3 }

# --- summary -----------------------------------------------------------------

Write-Section "RESULT"
Write-Pass "All 3 handshake checks PASSED."
Write-Host ""
Write-Host "Safe to run real sync now:"
Write-Host "  C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php"
Write-Host ""
exit 0
