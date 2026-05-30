# Human Task Handout — Pull, Rebuild, Retest, and Re-run Sync

Use this later on staging and Windows. Copy commands exactly.

---

## A. Linux VM — Pull latest code

```bash
cd ~/apps/easylink-frontend
git status
git pull --ff-only origin master
```

If `git pull` fails, stop and send output back.

---

## B. Linux VM — Confirm HOP B files exist after pull

```bash
cd ~/apps/easylink-frontend
ls app/api/scanlog/ingest/route.js
ls app/api/scanlog/hop-b-status/route.js
ls lib/hop-b-ingest-handler.js
ls lib/hop-b-status.js
```

Expected: all files exist.

If any `ls` says `No such file or directory`, server is not on correct commit.

---

## C. Linux VM — Rebuild app

```bash
cd ~/apps/easylink-frontend
npm install
npm run build
```

Expected:
- build finishes successfully
- routes should include:
  - `/api/scanlog/ingest`
  - `/api/scanlog/hop-b-status`

---

## D. Linux VM — Restart PM2 app

Use your actual PM2 app name. Current logs suggest `easylink`.

```bash
pm2 restart easylink
pm2 logs easylink --lines 100
```

---

## E. Linux VM — Re-test route existence

```bash
curl -i http://127.0.0.1:3000/api/scanlog/hop-b-status
curl -i -X POST http://127.0.0.1:3000/api/scanlog/ingest
```

Expected after correct deploy:
- `hop-b-status` should **not** return Next.js HTML `404`
- `ingest` should **not** return Next.js HTML `404`
- `ingest` may return `401`, `405`, or JSON error if method/body is wrong — that is acceptable

Bad sign:
- HTML page with `404: This page could not be found.`

---

## F. Linux VM — Check HOP B env

```bash
cd ~/apps/easylink-frontend
grep HOP_B_ .env
```

Expected at minimum:
- `HOP_B_AUTH_TOKEN=...`

---

## G. Linux VM — Verify ingest ledger table exists

```bash
mysql -h127.0.0.1 -P3306 -ueasylink -p'RSSU2026Aa11!' demo_easylinksdk -e "SHOW TABLES LIKE 'tb_hop_b_ingest_log';"
```

If table is missing, stop and send output.

---

## H. Linux VM — Check whether any ingest rows landed

```bash
mysql -h127.0.0.1 -P3306 -ueasylink -p'RSSU2026Aa11!' demo_easylinksdk -e "SELECT id,batch_id,status,received_at,committed_at,inserted_count,duplicate_count FROM tb_hop_b_ingest_log ORDER BY id DESC LIMIT 20;"
```

Expected if sync reached app DB:
- one or more rows in `tb_hop_b_ingest_log`

If empty, request likely never reached durable ingest commit.

---

## I. Windows — Run sync script from correct repo folder

Your earlier command failed because current folder was wrong.

Wrong:
```powershell
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
```

That only works if terminal is already inside repo root.

Use this pattern:

```powershell
cd C:\path\to\easylink-frontend
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
```

Example:

```powershell
cd C:\Users\USER\Desktop\easylink-frontend
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
```

Optional full fallback run:

```powershell
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php --full
```

---

## J. What success should look like

### Linux side
- HOP B routes stop returning HTML 404
- PM2 app starts cleanly
- `tb_hop_b_ingest_log` exists
- new rows appear in `tb_hop_b_ingest_log`

### Windows side
- `sync.php` runs from repo root
- no `Could not open input file`
- no `Non-JSON response`

---

## K. What to send back for troubleshooting

Send outputs from these exact commands:

1. Linux pull:
```bash
git pull --ff-only origin master
```

2. Linux file checks:
```bash
ls app/api/scanlog/ingest/route.js
ls app/api/scanlog/hop-b-status/route.js
```

3. Linux build:
```bash
npm run build
```

4. Linux route tests:
```bash
curl -i http://127.0.0.1:3000/api/scanlog/hop-b-status
curl -i -X POST http://127.0.0.1:3000/api/scanlog/ingest
```

5. Linux DB check:
```bash
mysql -h127.0.0.1 -P3306 -ueasylink -p'RSSU2026Aa11!' demo_easylinksdk -e "SELECT id,batch_id,status,received_at,committed_at,inserted_count,duplicate_count FROM tb_hop_b_ingest_log ORDER BY id DESC LIMIT 20;"
```

6. Windows sync run:
```powershell
cd C:\path\to\easylink-frontend
C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe ops\fservice-sync\sync.php
```

---

## L. Current likely diagnosis

Based on current logs:
- local repo/build had HOP B routes
- staging returned Next.js HTML 404 for those same routes

Most likely causes:
1. staging server is on stale code
2. latest build was not rebuilt after pull
3. PM2 is still serving old build
4. route files are missing on server checkout

This handout is designed to prove which one.

---

## M. Human QA — App review checklist after deploy

Run these checks in browser after Linux VM pull, rebuild, and PM2 restart.

### 1. Login and shell sanity
- Open app login page.
- Log in with known working admin account.
- Confirm app loads without immediate redirect loop.
- Confirm sidebar renders normally.
- Click 3-4 routes in sidebar and confirm no repeated forced logout.

### 2. Attendance page crash check
- Open `/attendance`.
- Confirm page renders fully.
- Confirm no browser crash / blank page / red error overlay.
- Click date preset buttons:
  - Today
  - Week
  - Month
- Expected:
  - page does not crash
  - date range updates correctly
  - results reload normally

### 3. Attendance manual refresh check
- On `/attendance`, click visible Refresh button once.
- Expected:
  - one normal reload
  - no endless spinner
  - no burst of repeated requests

### 4. Performance page request-churn check
- Open `/performance`.
- Let page settle.
- Switch to another tab/window, then return.
- Refresh browser once.
- Expected:
  - page stays logged in
  - no `Too many requests` error
  - no repeated kick back to login
  - page loads data normally

### 5. Browser network spot-check
In browser DevTools Network tab, watch these calls while testing `/attendance` and `/performance`:
- `/api/auth/me`
- `/api/attendance`
- `/api/performance`
- `/api/groups`

Expected:
- `/api/auth/me` should not spam repeatedly on `/performance`
- requests should settle after initial load / explicit refresh
- no rapid burst pattern like constant polling

### 6. Leader schedule access review
Log in with affected employee/leader account.
- Open `/schedule`
- Check whether schedule page is visible in sidebar
- Try normal schedule actions expected for leader role

Record exactly:
- login identifier used
- whether login used login ID, NIP, or legacy PIN path
- whether `/schedule` opens
- whether page is read-only or editable
- any popup / 403 / redirect / hidden button behavior

### 7. Capture `/api/auth/me` for failing leader account
If leader scheduling still fails:
- open DevTools Network
- reload page
- open `/api/auth/me` response
- save/copy JSON response

Need these fields from response:
- `login_id`
- `nip`
- `role_key`
- `is_leader`
- `can_schedule`
- `can_dashboard`
- `groups`
- `canonical_roles`

---

## N. What to send back for app QA troubleshooting

Send these items back:

1. Attendance result
- did `/attendance` open successfully?
- did preset buttons crash page or work?

2. Performance result
- did `/performance` load normally?
- did session stay active?
- any `Too many requests` message?

3. Network evidence
- screenshot or copied rows for `/api/auth/me` frequency
- any failing `/api/attendance` or `/api/performance` requests

4. Leader-account evidence
- exact account used
- exact blocked action
- `/api/auth/me` JSON for that account
- any `/api/schedule` 403 response body
