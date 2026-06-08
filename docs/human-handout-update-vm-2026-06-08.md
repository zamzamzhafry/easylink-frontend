# Human Handout — Update VM (Linux) to branch sync/ai-knowledge-2026-06-07

Newest branch: `sync/ai-knowledge-2026-06-07` @ `ea6db8d`.
Target VM: `192.168.1.129` (EasyLink frontend/API, Next.js + PM2).

> IMPORTANT: this commit is NOT on `master` yet (master is `607e216`).
> Pull the BRANCH, not master. Pulling master gives stale auth code.

Run in order. Copy exactly. On failure, stop and send raw output.

---

## A. Pull this branch

### A.1 Fetch + switch

```bash
cd ~/apps/easylink-frontend
git status
git fetch origin
git checkout sync/ai-knowledge-2026-06-07
git pull --ff-only origin sync/ai-knowledge-2026-06-07
git rev-parse --short HEAD
```

`git rev-parse --short HEAD` must print `ea6db8d`. Local edits in `git status`? Stop, send output.

### A.2 Confirm route + auth files exist after pull

```bash
cd ~/apps/easylink-frontend
ls app/api/scanlog/ingest/route.js
ls app/api/scanlog/hop-b-status/route.js
ls lib/hop-b-ingest-handler.js
ls lib/hop-b-status.js
ls lib/auth-hardening-helpers.js
ls lib/auth-login-helpers.js
```

All six must exist. Any `No such file or directory` = wrong commit. The last two
are new in this branch (auth hardening). Missing = build will fail.

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
Missing `HOP_B_AUTH_TOKEN`? Stop. Windows cannot ingest without it.

### A.5 Restart PM2 + tail logs

```bash
pm2 restart easylink-frontend
pm2 status
pm2 logs easylink-frontend --lines 100
```

Wait for app listening on port 3000, no crash loop.

### A.6 Local smoke (on VM, via 127.0.0.1)

```bash
curl -i http://127.0.0.1:3000/api/scanlog/hop-b-status
curl -i -X POST http://127.0.0.1:3000/api/scanlog/ingest
```

Acceptable:

- `hop-b-status` returns JSON (200) or JSON error (5xx), NOT Next.js HTML 404.
- `ingest` bare POST returns `401` JSON `"code":"AUTH_MISSING"` (healthy: route
  exists, auth enforced). NOT HTML 404.

Bad: HTML `404: This page could not be found.` = stale build served.

### A.7 Auth login smoke (new hardening path)

```bash
curl -i -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"login_id":"__nope__","password":"__nope__"}'
```

Expected: `401` JSON `{"ok":false,...}` (login route reachable, hardened path runs).
HTML 404 or 500 stack = build/wiring problem, re-check A.2/A.3.

### A.8 LAN-reachable smoke

```bash
curl -i http://192.168.1.129:3000/api/scanlog/hop-b-status
```

Hang/refused but A.6 works = app bound to 127.0.0.1 only or firewall blocks 3000.
Open port or rebind, retry.

---

## B. Then update the Windows sync box

Use `docs/human-handout-update-windows-sync-2026-06-08.md` (same branch `ea6db8d`).
Run its handshake before any real `sync.php`.

---

## C. Success summary (VM)

- On branch `sync/ai-knowledge-2026-06-07`, HEAD `ea6db8d`.
- All six files in A.2 present, build succeeded, PM2 restarted no crash loop.
- `/api/scanlog/hop-b-status` JSON 200 on `127.0.0.1` AND `192.168.1.129`.
- Bare `ingest` POST = `401 AUTH_MISSING`. Bad login = `401 ok:false`.
- `HOP_B_AUTH_TOKEN` present in `.env`.

## D. If anything fails, send raw output of

1. `git rev-parse --short HEAD` (must be `ea6db8d`)
2. `npm run build` last ~40 lines
3. `pm2 logs easylink-frontend --lines 100`
4. `curl -i http://192.168.1.129:3000/api/scanlog/hop-b-status`
5. A.7 login smoke full output
