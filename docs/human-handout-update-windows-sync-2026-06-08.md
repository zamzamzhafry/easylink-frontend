# Human Handout — Update Windows Sync Machine (branch sync/ai-knowledge-2026-06-07)

Newest branch: `sync/ai-knowledge-2026-06-07` @ `ea6db8d`.
Target Windows box: the one running `ops\fservice-sync\sync.php`.
Target VM (API): `192.168.1.129:3000` (Next.js + PM2).

Run sections in order. Copy commands exactly. On any failure, stop and send raw output.

> What changed since 2026-06-07 base: only auth login/me hardening on the VM app
> (new files `lib/auth-hardening-helpers.js`, `lib/auth-login-helpers.js`).
> No change to `ops\fservice-sync\` or the ingest contract. Handshake/sync flow
> below is unchanged. `HOP_B_AUTH_TOKEN` is still the only shared secret.

---

## A. Windows — pull this branch

### A.1 Go to repo root (example)

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
git status
```

If `git status` shows local edits, stop and send output.

### A.2 Fetch + switch to newest branch

```powershell
git fetch origin
git checkout sync/ai-knowledge-2026-06-07
git pull --ff-only origin sync/ai-knowledge-2026-06-07
git rev-parse --short HEAD
```

`git rev-parse --short HEAD` must print `ea6db8d`. If not, send output.

### A.3 Confirm sync files exist

```powershell
Test-Path .\ops\fservice-sync\sync.php
Test-Path .\ops\fservice-sync\hop-b-batch-selector.php
Test-Path .\ops\fservice-sync\handshake-test.ps1
```

All three must print `True`.

### A.4 Confirm PHP reachable

```powershell
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe -v
```

Different path? Use that path everywhere `php.exe` appears below.

### A.5 Confirm env (VM target + shared token + local FService)

```powershell
echo $env:HOP_B_INGEST_URL
echo $env:HOP_B_AUTH_TOKEN
echo $env:FSERVICE_HOST
echo $env:FSERVICE_PORT
echo $env:FSERVICE_SN
```

Expected:

- `HOP_B_INGEST_URL` = `http://192.168.1.129:3000/api/scanlog/ingest`
- `HOP_B_AUTH_TOKEN` = exact value from VM `.env` `HOP_B_AUTH_TOKEN`
- `FSERVICE_HOST` = `localhost`
- `FSERVICE_PORT` = `8090`
- `FSERVICE_SN` = device serial (e.g. `Fio66208021230737`)

Blank token? Set for this shell:

```powershell
$env:HOP_B_INGEST_URL = 'http://192.168.1.129:3000/api/scanlog/ingest'
$env:HOP_B_AUTH_TOKEN = '<paste token from VM .env>'
```

Persist via System Properties -> Environment Variables, or `ops\fservice-sync\run.bat`.

---

## B. Handshake test (read-only, run before any real sync)

### B.1 TCP reachability

```powershell
Test-NetConnection -ComputerName 192.168.1.129 -Port 3000
```

Expected `TcpTestSucceeded : True`. False = VM firewall/bind issue, fix VM first.

### B.2 Run bundled handshake script

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
$env:HOP_B_AUTH_TOKEN = '<paste exact token from VM .env>'
powershell -ExecutionPolicy Bypass -File .\ops\fservice-sync\handshake-test.ps1
```

Exit codes: `0` all pass - `1` TCP fail - `2` status fail - `3` auth/contract fail - `4` token not set.

PASS = status endpoint returns JSON 200, and authed empty-batch POST returns
HTTP `400` with `"code":"BATCH_EMPTY"` (token accepted, contract matched).

FAIL hints:

- `401` = token mismatch Windows vs VM `.env`. Fix token only.
- `404` HTML = VM build stale/route missing. Update VM, do not touch Windows.
- timeout/refused = see B.1.

> Do NOT run `sync.php` until B passes. Broken handshake just pollutes the outbox.

---

## C. Real sync (only if B passed)

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
```

Full backfill (optional):

```powershell
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php --full
```

Expected: no `Could not open input file`, no `Non-JSON response`, summary at end.

---

## D. VM cross-check after sync

```bash
mysql -h127.0.0.1 -P3306 -ueasylink -p'RSSU2026Aa11!' demo_easylinksdk -e \
  "SELECT id,batch_id,status,received_at,committed_at,inserted_count,duplicate_count \
   FROM tb_hop_b_ingest_log ORDER BY id DESC LIMIT 20;"
```

Expected: new row with `received_at` near the time you ran section C.

---

## E. If anything fails, send raw output of

1. Windows `git rev-parse --short HEAD` (must be `ea6db8d`)
2. Windows `Test-NetConnection -ComputerName 192.168.1.129 -Port 3000`
3. Windows `handshake-test.ps1` full output + exit code
4. Windows `sync.php` last ~40 lines (if you got that far)
5. VM `tb_hop_b_ingest_log` query result

Copy/paste actual terminal text, do not paraphrase.

---

## F. Success summary

- Windows on branch `sync/ai-knowledge-2026-06-07`, HEAD `ea6db8d`.
- PHP reachable, env vars set, token matches VM `.env`.
- `Test-NetConnection` to `192.168.1.129:3000` = `True`.
- `handshake-test.ps1` exits `0`.
- `sync.php` runs clean, new row in `tb_hop_b_ingest_log`.

> Note: if the VM was also updated to `ea6db8d`, rebuild it (`npm ci`, `npm run build`,
> `pm2 restart easylink-frontend`). Auth hardening changed login/me code paths.
> Reuse the VM section (A) of `docs/human-handoff-update-vm-and-windows-2026-06-07.md`.
