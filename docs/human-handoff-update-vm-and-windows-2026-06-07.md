# Human Task Handout — Update VM (Linux) + Windows Machine, then Test Handshake

Target VM: `192.168.1.129` (EasyLink frontend/API on Next.js, PM2).
Target Windows machine: the box that runs `ops\fservice-sync\sync.php`.

Run sections in order. Copy commands exactly. If a step fails, stop and send output.

---

## A. Linux VM (192.168.1.129) — Update app

### A.1 Pull latest code

```bash
cd ~/apps/easylink-frontend
git status
git pull --ff-only origin master
```

If `git pull` fails or shows local changes, stop and send the `git status` output.

### A.2 Confirm key route files exist after pull

```bash
cd ~/apps/easylink-frontend
ls app/api/scanlog/ingest/route.js
ls app/api/scanlog/hop-b-status/route.js
ls lib/hop-b-ingest-handler.js
ls lib/hop-b-status.js
```

All four must exist. Any `No such file or directory` = server is on wrong commit.

### A.3 Reinstall + rebuild

```bash
cd ~/apps/easylink-frontend
npm ci
npm run typecheck
npm run build
```

Expected: typecheck clean, build finishes. Routes printed must include:

- `/api/scanlog/ingest`
- `/api/scanlog/hop-b-status`

### A.4 Verify env still set

```bash
cd ~/apps/easylink-frontend
grep -E '^HOP_B_|^AUTH_SECRET|^ALLOW_INSECURE_COOKIES|^DB_NAME|^EASYLINK_DB_NAME' .env
```

Expected at minimum: `HOP_B_AUTH_TOKEN=...` and `AUTH_SECRET=...`.

If `HOP_B_AUTH_TOKEN` is missing, stop. Windows will not be able to ingest.

### A.5 Restart PM2 and tail logs

```bash
pm2 restart easylink-frontend
pm2 status
pm2 logs easylink-frontend --lines 100
```

Wait until log shows the app listening on port 3000 with no crash loop.

### A.6 Local smoke (on VM itself, via 127.0.0.1)

```bash
curl -i http://127.0.0.1:3000/api/scanlog/hop-b-status
curl -i -X POST http://127.0.0.1:3000/api/scanlog/ingest
```

Acceptable:

- `hop-b-status` returns JSON (200) or JSON error (5xx), NOT Next.js HTML 404.
- `ingest` (this bare POST has no auth header) returns `401` JSON with
  `"code":"AUTH_MISSING"`. That is the healthy answer — it proves the route
  exists and auth is enforced. NOT Next.js HTML 404.

Bad sign: HTML page `404: This page could not be found.` → wrong build is being served.

### A.7 LAN-reachable smoke (from VM, hitting its own LAN IP)

```bash
curl -i http://192.168.1.129:3000/api/scanlog/hop-b-status
```

If this hangs or returns connection refused but step A.6 works, the app is bound to `127.0.0.1` only or a firewall blocks 3000. Open the port or rebind, then retry.

---

## B. Windows machine — Update repo + tools

### B.1 Locate repo folder

Find your repo root. Example:

```
C:\Users\USER\Desktop\easylink-frontend
```

All Windows commands below assume you are inside that folder.

### B.2 Pull latest code

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
git status
git pull --ff-only origin master
```

If `git status` shows local edits, stop and send output.

### B.3 Confirm sync script files exist

```powershell
Test-Path .\ops\fservice-sync\sync.php
Test-Path .\ops\fservice-sync\hop-b-batch-selector.php
Test-Path .\ops\fservice-sync\run.bat
```

All three must print `True`.

### B.4 Confirm PHP is reachable

```powershell
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe -v
```

If your PHP path is different, use that path everywhere `php.exe` appears below.

### B.5 Confirm Windows env for VM

The Windows sync needs to know where the VM is and the shared token.

```powershell
echo $env:HOP_B_INGEST_URL
echo $env:HOP_B_AUTH_TOKEN
echo $env:FSERVICE_HOST
echo $env:FSERVICE_PORT
echo $env:FSERVICE_SN
```

Expected values:

- `HOP_B_INGEST_URL` = `http://192.168.1.129:3000/api/scanlog/ingest`
- `HOP_B_AUTH_TOKEN` = same value as VM `.env` `HOP_B_AUTH_TOKEN`
- `FSERVICE_HOST` = `localhost` (the local FService bridge)
- `FSERVICE_PORT` = `8090`
- `FSERVICE_SN` = your device serial (e.g. `Fio66208021230737`)

If any is blank, set it for the current shell:

```powershell
$env:HOP_B_INGEST_URL = 'http://192.168.1.129:3000/api/scanlog/ingest'
$env:HOP_B_AUTH_TOKEN = '<paste token from VM .env>'
```

For persistence across reboots, set them via System Properties → Environment Variables, or update `ops\fservice-sync\run.bat`.

---

## C. Handshake test — Windows → VM (192.168.1.129)

This proves the Windows box can actually reach the VM API before any real sync runs. The status endpoint is **read-only** and safe to hit repeatedly.

### C.1 Quick reachability (TCP)

```powershell
Test-NetConnection -ComputerName 192.168.1.129 -Port 3000
```

Expected: `TcpTestSucceeded : True`.

If `False`: VM firewall blocks 3000, or app is bound to 127.0.0.1 only. Fix on VM (see A.7) before continuing.

### C.2 Handshake button — read-only status probe

Run exactly:

```powershell
curl.exe -i --max-time 10 http://192.168.1.129:3000/api/scanlog/hop-b-status
```

PASS criteria (all must be true):

1. HTTP status line is `HTTP/1.1 200 OK` (or any non-404 JSON response).
2. `Content-Type` header contains `application/json`.
3. Body is valid JSON (starts with `{`), NOT an HTML page.

FAIL signals and what they mean:

- `Could not resolve host` → DNS / typo in IP.
- `Failed to connect` / timeout → VM down, firewall, or wrong port.
- HTTP `404` with HTML body → VM is serving an old build that does not have this route. Re-run section A.3 → A.5 on the VM.
- HTTP `5xx` JSON → app reachable but status query failed; check `pm2 logs easylink-frontend` on VM.

### C.3 Authenticated handshake — ingest endpoint dry probe

This proves the shared token works **without writing any real scanlog rows**.
We send a **schema-valid Hop B envelope with an empty `records` array**. The VM
runs auth → content-type → JSON parse → schema validation, then rejects the
empty array with `400 BATCH_EMPTY`. Because the rejection happens *before* the
ledger/receipt step, nothing is written to `tb_hop_b_ingest_log`.

The envelope MUST match the contract in `lib/hop-b-ingest-contract.js`:

| Field            | Required value / format                                  |
| ---------------- | ------------------------------------------------------- |
| `schema_version` | exactly `1.0.0`                                          |
| `batch_id`       | UUID v4 (e.g. `8f1e...-4...-a...`)                       |
| `sent_at`        | ISO 8601 UTC, e.g. `2026-06-07T12:34:56.789Z`           |
| `source_sdk`     | exactly `fservice-hop-b`                                 |
| `device_sn`      | any non-empty string (use `HANDSHAKE-PROBE`)            |
| `record_count`   | integer `0`                                              |
| `records`        | empty array `[]`                                         |

Auth header MUST be `Authorization: Bearer <HOP_B_AUTH_TOKEN>` (the `Bearer ` prefix is required).

```powershell
$batchId = [guid]::NewGuid().ToString()
$sentAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$body = @{
  schema_version = '1.0.0'
  batch_id       = $batchId
  sent_at        = $sentAt
  source_sdk     = 'fservice-hop-b'
  device_sn      = 'HANDSHAKE-PROBE'
  record_count   = 0
  records        = @()
} | ConvertTo-Json -Compress

curl.exe -i --max-time 10 `
  -X POST `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $env:HOP_B_AUTH_TOKEN" `
  --data $body `
  http://192.168.1.129:3000/api/scanlog/ingest
```

PASS criteria (exactly one expected outcome):

- HTTP `400` **and** JSON body has `"code":"BATCH_EMPTY"`.
  This is the success signal: token accepted, contract matched, only the
  empty-records guard fired. Nothing written to the ledger.

FAIL signals:

- HTTP `200`/`2xx` → empty batch was accepted. The ingest contract changed;
  re-verify `lib/hop-b-ingest-contract.js` before trusting this probe.
- HTTP `401` (`AUTH_MISSING` / `AUTH_INVALID`) → token mismatch between Windows
  `HOP_B_AUTH_TOKEN` and VM `.env`. Fix the token, do NOT change anything else.
- HTTP `415` (`CONTENT_TYPE_INVALID`) → `Content-Type: application/json` header
  was not sent. Client/command bug, not a VM problem.
- HTTP `404` HTML → VM build is stale or route missing, repeat section A.
- HTTP `400` with a code **other than** `BATCH_EMPTY` (e.g. `PAYLOAD_INVALID`,
  `SCHEMA_VERSION_UNSUPPORTED`) → route reachable and token OK, but the envelope
  was rejected. The contract may have changed; compare your payload to the table above.
- Connection refused / timeout → see C.1.

> Do NOT run `sync.php` until both C.2 and C.3 pass. Running sync with a broken handshake just pollutes the outbox.

### C.4 The reusable handshake script (already in the repo)

All three checks above (C.1 TCP, C.2 status, C.3 authed empty-batch) are bundled
into a single script that ships with the repo:

```
ops\fservice-sync\handshake-test.ps1
```

It builds the correct schema-valid envelope automatically (fresh UUID + ISO
timestamp every run), asserts on the exact `BATCH_EMPTY` response code, and
prints colored PASS/FAIL lines with inline fix hints. You do not need to type
the curl commands by hand — they are here only so you understand what the script
does.

Set the token, then run it:

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
$env:HOP_B_AUTH_TOKEN = '<paste exact token from VM .env>'
powershell -ExecutionPolicy Bypass -File .\ops\fservice-sync\handshake-test.ps1
```

Exit codes: `0` all pass · `1` TCP fail · `2` status fail · `3` auth/contract fail · `4` token not set.

Optional overrides (defaults shown):

```powershell
# point at a different VM or port
powershell -ExecutionPolicy Bypass -File .\ops\fservice-sync\handshake-test.ps1 -VmHost 192.168.1.129 -VmPort 3000
# or override the full ingest URL
$env:HOP_B_INGEST_URL = 'http://192.168.1.129:3000/api/scanlog/ingest'
```

---

## D. Windows → run real sync (only if section C passed)

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
```

Optional full backfill:

```powershell
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php --full
```

Expected: no `Could not open input file`, no `Non-JSON response`, summary at end.

---

## E. Cross-check on VM after sync

```bash
mysql -h127.0.0.1 -P3306 -ueasylink -p'RSSU2026Aa11!' demo_easylinksdk -e \
  "SELECT id,batch_id,status,received_at,committed_at,inserted_count,duplicate_count \
   FROM tb_hop_b_ingest_log ORDER BY id DESC LIMIT 20;"
```

Expected: at least one new row whose `received_at` matches the time you ran section D.

---

## F. What to send back if anything fails

Send the raw outputs of:

1. VM `git pull --ff-only origin master`
2. VM `npm run build` (last ~40 lines)
3. VM `pm2 logs easylink-frontend --lines 100`
4. VM `curl -i http://192.168.1.129:3000/api/scanlog/hop-b-status`
5. Windows `Test-NetConnection -ComputerName 192.168.1.129 -Port 3000`
6. Windows handshake (section C.2 + C.3 full output, including HTTP status line and body)
7. Windows `php ops\fservice-sync\sync.php` last ~40 lines (only if you got that far)

Do NOT paraphrase; copy/paste the actual terminal text.

---

## G. Success summary

VM:

- Latest commit pulled, build succeeded, PM2 restarted.
- `/api/scanlog/hop-b-status` returns JSON 200 on `127.0.0.1` AND `192.168.1.129`.
- `HOP_B_AUTH_TOKEN` present in `.env`.

Windows:

- Repo pulled, PHP reachable, env vars set.
- `Test-NetConnection` to `192.168.1.129:3000` is `True`.
- Handshake `curl` to `hop-b-status` returns JSON 200.
- Authenticated empty-batch POST to `ingest` returns `400` with JSON `"code":"BATCH_EMPTY"` (not 401, not 2xx, not HTML 404).
- `sync.php` runs cleanly and a new row appears in `tb_hop_b_ingest_log`.
