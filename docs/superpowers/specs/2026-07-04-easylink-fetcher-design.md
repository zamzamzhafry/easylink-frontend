# EasyLink Fetcher — Stateless Windows Microservice (Design)

**Date:** 2026-07-04
**Author:** Claude (senior backend, ultracode)
**Status:** Design / build in progress
**Supersedes (concept):** `ops/fservice-sync/` stateful outbox pipeline (the "horror")
**Goal:** Fetching app prod-ready, unmanned, autonomous, reliable. Both app + fetching services talk. E2E testable. Git split. HTML guides.

---

## 1. Why — the problem with the current approach

Current Windows side (`ops/fservice-sync/`) is a **stateful pipeline**:

```
device → sync.php/worker.php → stage into easylink_bridge.raw_scanlog_staging
      → hop-b-batch-selector.php → outbox (sync_batch/sync_batch_item)
      → POST to VM /api/scanlog/hop-b/ingest
```

Horror factors:
1. **Two Windows MySQL DBs** (`demo_easylinksdk` + `easylink_bridge`) + 4 tables (`raw_scanlog_staging`, `sync_batch`, `sync_batch_item`, `fetch_checkpoint`) + `fservice_jobs` job table + `app_config` + `tb_device_config`. All state on an unmanned Windows box = drift, schema rot, no migrations applied (`004` was missing per handoff), dead-letter storms.
2. **Selector state machine** (pending→sending→sent/failed/dead_letter, retry backoff) = distributed-systems logic on a box that reboots, sleeps, loses power. Job leases non-atomic (handoff follow-up unfixed).
3. **Dual-write footprint**: even after C4, Windows still owns `tb_user`, `tb_device_config`, `fservice_jobs`, staging. Prod can't be source of truth while Windows holds half.
4. **No scheduler committed** — `schtasks` config lives off-repo under `C:\EasyLinkOps\`, invisible, unreproducible.
5. **PHP engine + stateful** = "syncing is a horror issue" (user).

**Key realization:** the device (`FService.exe :8090`) is the **only real source of truth**. Everything Windows stores is a cache of the device. Prod already dedups via `source_event_key` UNIQUE on `tb_scanlog_safe_events` (INSERT IGNORE). Therefore **Windows needs zero persistent state** — fetch, transform, hand to prod, done. Prod owns all DB state.

## 2. Architecture — stateless fetcher microservice

### 2.1 Principles (locked)

- **Stateless**: no Windows MySQL, no staging, no outbox, no jobs table, no selector. Fetcher holds no state across calls. Device = source of truth; prod = persistence.
- **Reliable via primitive kill-PID**: every device HTTP call runs in a child PHP process with a hard wall-clock timeout; on timeout we `taskkill /F /PID`. No curl-internal timeout cleverness, no hung threads. Primitive > optimized (user constraint).
- **Unmanned + autonomous**: Windows Task Scheduler runs `push.php` every N min (zero humans). Watchdog keeps `FService.exe` alive (ported).
- **On-demand "both talk"**: prod can request a fetch on-demand via Cloudflare Tunnel → fetcher HTTP endpoint (for freshness + e2e proof both services communicate).
- **Git split**: fetcher = own repo `easylink-fetcher`, cloned on Windows (no zip/ship).
- **Prod owns DB**: fetcher never writes a DB. Only HTTP POSTs to prod ingest.

### 2.2 Components

```
┌─────────────────────────────────────────────────────────────┐
│ Windows box (unmanned, RDP/TeamViewer access)               │
│ C:\EasyLinkOps\easylink-fetcher\  (git clone)               │
│                                                             │
│  FService.exe :8090  (device bridge — ONLY stateful thing)  │
│      ↑ HTTP                                                 │
│  ┌───┴──────────────────────────────────────────────┐       │
│  │ easylink-fetcher (PHP, stateless)                 │       │
│  │  bin/push.php        — autonomous push (cron)     │       │
│  │  bin/fetch-server.php— on-demand HTTP (tunnel)    │       │
│  │  bin/watchdog.php    — FService.exe liveness      │       │
│  │  lib/device.php      — device calls + kill-PID    │       │
│  │  lib/contract.php    — HOP_B wire (ported)        │       │
│  │  lib/transform.php   — device row → HOP_B record  │       │
│  │  lib/log.php         — el_log (ported)            │       │
│  │  lib/prod.php        — POST to prod ingest        │       │
│  │  config/config.php   — env-based machine map      │       │
│  └──────────────────────────────────────────────────┘       │
│         │                          │                        │
│   Task Scheduler             cloudflared tunnel              │
│   (push every 5min)          fetch.<domain> → :9090          │
└─────────────┼──────────────────────────┼─────────────────────┘
              │ POST /api/scanlog/       │ HTTPS
              │   hop-b/ingest           │ (prod → fetcher)
              │ (Bearer HOP_B_AUTH_TOKEN)│
              ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Prod (easylink-frontend, Next.js, VM :3001)                 │
│  /api/scanlog/hop-b/ingest  — push target (existing)        │
│  /api/scanlog/fetch         — NEW: triggers fetcher on-demand│
│  tb_scanlog_safe_events (UNIQUE source_event_key) = dedup   │
│  → prod is sole persistence owner                            │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Data flow

**Autonomous push (primary, no humans):**
1. Task Scheduler → `php bin/push.php` every 5 min.
2. `push.php`: for each configured machine → `device.fetch_scanlogs_new(from=last_push_ts, to=now)`.
3. Transform each device row → HOP_B record (`source_event_key` formula, ported byte-identical).
4. Batch (UUID v4 `batch_id`) → `lib/prod.php` POST to `HOP_B_INGEST_URL` with Bearer token.
5. Prod validates + INSERT IGNORE dedups. Ack `{inserted, duplicate}`.
6. `last_push_ts` persisted in a **single tiny state file** `var/state.json` (one line per machine: `{sn, last_push_ts}`). This is the ONLY state — a watermark, not a job/outbox. If lost, worst case = re-push duplicates (prod dedups). No MySQL.

**On-demand (both-talk proof + freshness):**
1. Admin hits prod `/api/scanlog/fetch?sn=...&from=...&to=...` (cookie auth, admin).
2. Prod POSTs to `FETCHER_URL/fetch` (Cloudflare Tunnel, Bearer `FETCHER_TOKEN`).
3. Fetcher `bin/fetch-server.php` receives → calls device → returns HOP_B records **in the HTTP response** (no push needed).
4. Prod writes them to `tb_scanlog_safe_events` itself (reuses existing ingest-writer).
5. Both services demonstrably talk (e2e green = this round-trip).

**Why both:** push = autonomous (works when prod is idle, no inbound NAT hole needed for the primary path). On-demand = freshness on demand + proves bidirectional. Push is primary; on-demand is secondary.

### 2.4 Primitive kill-PID (the reliability primitive)

User: "can't be too optimized and timeout limit, better primitive kill PID and execute."

Every device HTTP call:
```php
// lib/device.php — primitive device call with hard kill
function device_call(array $machine, string $path, array $fields, int $timeoutSec): array {
    $spec = [/* descriptor */];
    $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/device-call.php') . ' '
         . escapeshellarg(json_encode([$machine, $path, $fields, $timeoutSec]));
    $proc = proc_open($cmd, $spec, $pipes);
    $start = time();
    while (true) {
        $status = proc_get_status($proc);
        if (!$status['running']) break;
        if (time() - $start >= $timeoutSec) {
            // PRIMITIVE: kill the PID, no graceful, no curl-internal
            if (PHP_OS_FAMILY === 'Windows') {
                shell_exec('taskkill /F /T /PID ' . $status['pid']);
            } else {
                shell_exec('kill -9 ' . $status['pid']);
            }
            return ['ok' => false, 'error' => 'timeout', 'data' => null];
        }
        usleep(200000);
    }
    $out = stream_get_contents($pipes[1]);
    fclose($pipes[1]); proc_close($proc);
    return json_decode($out, true) ?: ['ok'=>false,'error'=>'bad json','data'=>null];
}
```

`device-call.php` = isolated child doing one curl POST (ported `lib-bridge-http.php` logic), prints JSON, exits. Parent's job: spawn, watch clock, `taskkill /F` on timeout. **No curl internal timeout races. No hung thread accumulates.** Dead process = clean slate next call. This is the "primitive > optimized" reliability constraint.

## 3. Git split

New repo: **`easylink-fetcher`** (separate from `easylink-frontend`).

Method: `git subtree split` or fresh repo with copied libs. User wants "splitting git repo might be necessary too, from main app. rather than zipping and shipping." → real git history preferred.

- Source libs to port (copy, keep attribution): `ops/fservice-sync/lib-bridge-http.php` → `lib/device.php` (refactor to use kill-PID), `lib-hop-b-contract.php` → `lib/contract.php`, `lib-log.php` → `lib/log.php`.
- Drop entirely: `worker.php`, `sync.php`, `web/index.php`, `hop-b-batch-selector.php`, `fservice-watchdog.php` (replaced by `bin/watchdog.php` simpler), all `migrations/` (no DB).
- New repo lives at `C:\EasyLinkOps\easylink-fetcher\` on Windows, `git pull` to update (no zip).

Repo location: `/home/user/projects/easylink-fetcher` (local), push to remote (GitHub or bare).

## 4. Configuration (env-based, no DB)

Single `.env` on Windows (or `config/machines.json` for machine map):
```
# prod ingest target
HOP_B_INGEST_URL=https://<prod>/api/scanlog/hop-b/ingest
HOP_B_AUTH_TOKEN=<token>

# on-demand server (cloudflared)
FETCHER_TOKEN=<token>
FETCHER_PORT=9090

# machines (multi-device ready)
MACHINES='[{"sn":"Fio66208021230737","host":"192.168.1.111","port":8090,"label":"HQ"}]'

# logging
EASYLINK_SYNC_LOG_DIR=C:\EasyLinkOps\logs
```

State: `var/state.json` — `{"Fio66208021230737":"2026-07-04 10:00:00"}` (last push watermark). Trivial, lossy-safe.

## 5. HTML guides (user: "make the guides in html")

- `docs/guides/deploy-windows.html` — RDP/TeamViewer: clone repo, install PHP, `.env`, Task Scheduler, cloudflared, start fetcher. Screenshots optional.
- `docs/guides/test-fetcher.html` — manual test: hit fetcher `/fetch`, hit prod `/api/scanlog/fetch`, watch logs, restart fetcher.
- `docs/guides/e2e-both-talk.html` — verify push path + on-demand path, expect rows in prod `tb_scanlog_safe_events`.
- `docs/guides/troubleshoot.html` — FService.exe restart, kill-PID, state.json reset, log tail.

HTML (not md) per user request. Self-contained, inline CSS, no external deps (works offline on Windows).

## 6. Testing / e2e definition of done

1. `push.php` runs from Task Scheduler, prod `tb_hop_b_ingest_log` shows new `batch_id` rows, `tb_scanlog_safe_events` grows.
2. `prod /api/scanlog/fetch?sn=...` returns 200 with inserted count (fetcher → device → prod round-trip).
3. Kill `FService.exe` mid-fetch → next push still clean (watchdog restarts, no hung state).
4. Restart fetcher box → state.json survives, push resumes, no dup storm (prod dedups).
5. e2e spec in `tests/fetcher-e2e.spec.ts` (Playwright, prod side): login → trigger fetch → assert row count increased.

## 7. Out of scope (deferred)

- User sync (`tb_user`) — later phase; same pattern, different endpoint.
- GPS scanlog `/scanlog/GPS` — later.
- Device `dev/init`, `user/del` danger zone — not in fetcher (prod-driven only, separate admin route).
- Hop-b schema version bump — contract unchanged (1.0.0), PHP + JS already parity-verified.

## 8. Risk / rollback

- Fetcher broken → prod still has existing data; on-demand `/api/scanlog/sync` (VM direct pull, existing) remains as fallback. No data loss.
- Tunnel down → push path unaffected (push is outbound). Only on-demand degrades.
- State.json lost → re-push dups, prod dedups via `source_event_key`. Safe.

## 9. Build order

1. Design md (this file) — committed.
2. Split git repo `easylink-fetcher`.
3. Port libs + build `bin/push.php`, `bin/fetch-server.php`, `bin/watchdog.php`, `lib/device.php` (kill-PID).
4. HTML guides.
5. Prod `/api/scanlog/fetch` route + tunnel config doc.
6. E2E verify (user tests on Windows via RDP/TeamViewer).
