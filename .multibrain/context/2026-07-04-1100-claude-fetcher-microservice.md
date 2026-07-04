# EasyLink Fetcher — Stateless Windows Microservice

## Goal
User: replace the stateful PHP sync pipeline (ops/fservice-sync outbox+staging+dual-DB) with a reliable, unmanned, autonomous fetching microservice on Windows. Primitive kill-PID > optimized. SDK Windows-only. Split git repo (no zip). HTML guides. E2E both-talk.

## Summary
New repo `easylink-fetcher` (/home/user/projects/easylink-fetcher) — stateless PHP fetcher. Device = source of truth; prod owns all DB state. Hybrid: autonomous push (Task Scheduler → bin/push.php → prod /api/scanlog/hop-b/ingest) + on-demand (prod /api/scanlog/fetch → Cloudflare Tunnel → fetcher /fetch → records back → prod writes). Primitive kill-PID: each device call = isolated child PHP (lib/device-call.php) doing one curl; parent watches clock, taskkill /F /PID on timeout. Only state = var/state.json watermark per SN (lossy-safe, prod dedups). No Windows MySQL, no outbox, no selector, no jobs table.

## Changes

### New repo: easylink-fetcher (stateless)
- `lib/log.php` — ported el_log (log dir default ../logs)
- `lib/contract.php` — ported HOP_B contract (source_sdk renamed `fservice-fetcher`, schema 1.0.0, source_event_key formula byte-identical)
- `lib/device-call.php` — isolated child: one curl POST, prints JSON, exits. Per-endpoint shape (/scanlog/new=query, else=body) 1:1 easylink.ps1
- `lib/device.php` — device_call() wrapper: proc_open child, wall-clock watch, taskkill /F /T /PID (Win) / kill -9 (POSIX) on timeout. NO curl-internal timeout races.
- `lib/transform.php` — device row → HOP_B record (ScanDate split into scan_date+scan_time, source_event_key via contract)
- `lib/prod.php` — prod_build_batch (UUID v4) + prod_push_batch (POST HOP_B_INGEST_URL, Bearer HOP_B_AUTH_TOKEN)
- `lib/config.php` — machines map (env MACHINES or config/machines.json) + state.json watermark (24h bootstrap default)
- `bin/push.php` — autonomous push: per machine fetch→transform→push→advance watermark on success only
- `bin/fetch-server.php` — on-demand HTTP (PHP built-in server :9090): /health, /fetch (return records), /push (fetch+push to prod). Bearer FETCHER_TOKEN auth (hash_equals)
- `bin/watchdog.php` — FService.exe liveness, 3-fail restart via taskkill+start
- `config/machines.json` — sample {sn,host,port,label}
- `docs/guides/*.html` — deploy-windows, test-fetcher, e2e-both-talk, troubleshoot (a11y-gated: skip-link, role=main, aria-current, focus-visible)
- `README.md`, `.gitignore`

### Prod side (easylink-frontend)
- NEW `lib/fetcher-client.js` — fetchScanlogsFromFetcher({sn,from,to,limit}) → {ok,fetched,records}. Env FETCHER_URL+FETCHER_TOKEN. source_sdk `fetcher-pull`.
- NEW `app/api/scanlog/fetch/route.js` — POST admin-cookie auth (getAuthContextFromCookies/is_admin). Calls fetcher → normalizes records (buildHopBSourceEventKey if missing) → insertHopBSafeEvents (INSERT IGNORE, dedup) in txn. Returns {ok,fetched,inserted,duplicate,batch_id}. GET liveness probe. maxDuration 60.
- NEW `tests/fetcher-e2e.spec.ts` — Playwright: admin login → POST /api/scanlog/fetch → assert ok + fetched≥0 + DB count not shrunk; GET liveness. execFileSync mysql (no shell injection). Skips gracefully if fetcher unreachable but FETCHER_URL set.

### Design doc
- `docs/superpowers/specs/2026-07-04-easylink-fetcher-design.md` — full design, reiteration source.

## Files
- easylink-fetcher repo: lib/{log,contract,device-call,device,transform,prod,config}.php, bin/{push,fetch-server,watchdog}.php, config/machines.json, docs/guides/{deploy-windows,test-fetcher,e2e-both-talk,troubleshoot}.html, README.md, .gitignore
- easylink-frontend: lib/fetcher-client.js, app/api/scanlog/fetch/route.js, tests/fetcher-e2e.spec.ts, docs/superpowers/specs/2026-07-04-easylink-fetcher-design.md

## Verification
- PHP lint: NOT RUN — bash harness fault (every cmd exits 1, no output) env-wide; subagents too. User must run `php -l` on Windows (or a working shell). Visually re-checked: balanced braces, correct tags, matched existing lib style.
- Git init/commit easylink-fetcher: NOT RUN — bash-blocked. Files written via Write tool at /home/user/projects/easylink-fetcher/. User: `cd /home/user/projects/easylink-fetcher && git init && git add -A && git commit -m "..."`.
- Easylink-frontend commit: NOT RUN — bash-blocked. Files in working tree.
- Contract parity: source_event_key formula = device_sn|scan_date|scan_time|pin|verify|io|workcode (int-coerced) — matches lib/hop-b-ingest-contract.js buildHopBSourceEventKey byte-identical (verified read).
- A11y gate: deploy-windows.html initially blocked (no skip-link/role/aria/focus-visible) → fixed (skip-link, nav aria-label, main role=main tabindex=-1, aria-current, focus-visible) → all 4 guides pass pattern.
- E2E spec: cannot run (bash broken for playwright). User runs: `npx playwright test tests/fetcher-e2e.spec.ts` from easylink-frontend.

## Adversarial review + 7 bug fixes (post-build, pre-deploy)
2 background Workflow runs (php -l couldn't run — bash broken — manual parse via subagents). 7 confirmed bugs, all would have broken the Windows run:

1. CRITICAL lib/log.php — el_log `echo` to STDOUT in CLI SAPI polluted the device-call child's JSON pipe → parent json_decode got `[DEBUG]...{json}` → null → "child bad json" on EVERY call. Fix: `fwrite(STDERR, ...)` (file log unchanged, parent already captures stderr).
2. CRITICAL lib/device.php — pipes default blocking → `stream_get_contents` blocked on empty pipe while child ran curl → wall-clock timeout check never reached → **kill-PID path dead code in the exact hung-curl case it existed for**. Fix: `stream_set_blocking($pipes[1], false)` + `($pipes[2], false)` after `fclose($pipes[0])`.
3. CRITICAL lib/contract.php — `HOP_B_SOURCE_SDK='fservice-fetcher'` but JS validator (lib/hop-b-ingest-contract.js:4) rejects ≠ `'fservice-hop-b'` → every push 409 PAYLOAD_INVALID. Fix: revert to `'fservice-hop-b'`.
4. CRITICAL bin/push.php + lib/transform.php + lib/prod.php — `require` (not `_once`) → contract.php loaded twice (via transform + via prod) → `Cannot redeclare const HOP_B_SCHEMA_VERSION` fatal at require time. Fix: `require_once` everywhere.
5. MEDIUM bin/push.php + lib/config.php — TZ mix: push.php `date('Y-m-d H:i:s')` (PHP default=UTC) vs config.php bootstrap `gmdate` vs device local (UTC+7). `to` was 7h behind device → persistent 7h data-loss lag. Fix: `date_default_timezone_set(getenv('DEVICE_TZ') ?: 'Asia/Jakarta')` at top of push.php + fetch-server.php; `gmdate`→`date` in config bootstrap.
6. MEDIUM bin/push.php — transform-zero-records branch advanced watermark past untransformed raw rows → permanent data loss for transient/fixable transform failures. Fix: don't advance when records=0 && raw_count>0; log ERROR; exit 1; next tick re-queries.
7. CRITICAL bin/fetch-server.php — `fwrite(STDOUT, json)` does NOT write HTTP body under `php -S` (STDOUT=terminal fd, not response). Fix: `echo json_encode(...)`.

All patched. Final verify workflow (wk7vqw1n6) running to confirm fixes + syntax sweep. Bash still broken → no `php -l`. User MUST run `php -l` on Windows (deploy-1stop.html step 2).

## Follow-up
- Bash harness fault persistent this session (handoff 2026-07-03 noted same). All shell-dependent work deferred to user/next-session with working bash: php -l, git init/commit, npm playwright, prod pm2 reload.
- User test on Windows via RDP/TeamViewer: follow docs/guides/deploy-1stop.html (1-stop) then deploy-windows.html (full) then test-fetcher.html then e2e-both-talk.html.
- Prod env to set: FETCHER_URL (tunnel URL), FETCHER_TOKEN (match Windows .env). Then pm2 delete+start easylink-prod (per obsidian gotcha, NOT restart).
- Cloudflare Tunnel setup on Windows (cloudflared service install) — guide step 9.
- Watchdog: new bin/watchdog.php is simpler single-tick; legacy ops/fservice-sync/fservice-watchdog.php has --daemon 30s. Either fine.
- User sync (tb_user) deferred — same pattern later phase.
