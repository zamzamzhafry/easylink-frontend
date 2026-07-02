# Sync/Delivery Architecture Deepening (C1-C4)

## Goal
User: "do it all" — implement candidates 1-4 from the architecture review for data-mining/delivery/sync. (C5 repo split deferred — outward-facing, needs separate confirmation.)

## Summary
Deepened the Windows↔VM seam by killing duplication around it. 3 new shared PHP libs; 3 callers became thin wrappers. Windows stops dual-writing local tb_scanlog. Wire contract now two-sided (PHP validates pre-send). JS side untouched (different purposes, per user direction).

## Decisions (from AskUserQuestion)
- C1: PHP only — consolidate 3 bridge_post copies. Leave both JS device clients (easylink-sdk-client.js multi-adapter + sdk-device-client.js narrow — serve different purposes, deleting either breaks live routes).
- C3: "do both sides" — push (Windows hop-b) + pull (VM /api/scanlog/sync, /api/scanlog/hop-b-sync) BOTH stay, documented as intentional (push primary, pull fallback). Not competing.
- C4: "windows wrote to json or something" → Windows stops dual-writing local tb_scanlog, stages+pushes only. VM scanlog-legacy-mirror is sole tb_scanlog writer.

## Changes

### C1: shared device-HTTP lib (kill 3 bridge_post copies)
- NEW `ops/fservice-sync/lib-bridge-http.php` — `bridge_http_post(machine, path, fields, timeout, logTag)` + `bridge_http_uses_query_string(path)`. Per-endpoint shape table: `/scanlog/new`→query string, else→POST body (1:1 easylink.ps1).
- worker.php `w_bridge_post`, sync.php `bridge_post`, web/index.php `bridge_post` → thin wrappers (preserve signatures + return shapes). ~135 lines of dup removed.
- watchdog.php left as-is (single-purpose /dev/info probe, different module shape — not a bridge_post duplicate).

### C2: two-sided wire contract (PHP pre-send assert)
- NEW `ops/fservice-sync/lib-hop-b-contract.php` — mirrors lib/hop-b-ingest-contract.js: `HOP_B_SCHEMA_VERSION='1.0.0'`, `HOP_B_SOURCE_SDK`, `hop_b_build_source_event_key(sn,date,time,pin,vm,io,wc)` = `implode('|',[...,(int)vm,(int)io,(int)wc])`, `hop_b_assert_record_contract(record)`.
- hop-b-batch-selector.php: removed dup constants, includes lib; `hop_b_build_payload` now calls `hop_b_assert_record_contract` per record pre-send → fail-fast on sender (was: silent 409 dead-letter on receiver).
- All 3 stagers replaced inline key formula with `hop_b_build_source_event_key` — ONE home for the formula.
- **Parity verified**: PHP + JS produce byte-identical key `Fio66208021230737|2026-03-27|19:54:35|20|1|2|0` for sample record. Assert smoke-tested (valid→null, mismatch→fail, missing pin→fail).
- Also fixed latent bug: selector had no `require_once lib-log.php` (would fatal on el_log when run standalone).

### C3: collapse PHP sync flows (worker+sync+web onto shared)
- NEW `ops/fservice-sync/lib-sync-scanlogs.php` — `stage_scan_row(stage, sn, ts, pin, vm, io, wc): bool` (unified stager, best-effort) + `sync_scanlogs_flow(machine, bridgePdo, full, onProgress): {total,staged,errors}` (paging loop, per-endpoint shape, no-data detection via /no data|none of data array|tidak/i).
- worker.php `run_sync_scanlogs` → delegates (preserves job_set_progress via onProgress closure, last_sync update, auto-hop-b chain, done/error semantics).
- web sync_scanlogs_to_db → delegates.
- sync.php sync_scanlogs → delegates (preserves CLI two-phase: /scanlog/new first, fall back to /scanlog/all/paging if --full or 0).
- Deleted 3 dup stagers (w_stage_one, _stage_one, _stage_scan).

### C4: Windows stops dual-write local tb_scanlog
- Verified topology: Windows has OWN local DB (DB_HOST=127.0.0.1 on Windows box, demo_easylinksdk.tb_scanlog + easylink_bridge). VM has OWN MySQL (tb_scanlog + tb_scanlog_safe_events). Two separate physical DBs — "dual-owner" was two different tables sharing a name, NOT a write conflict.
- Verified: nothing on Windows reads local tb_scanlog (only INSERTs). Safe to drop.
- shared `sync_scanlogs_flow` is staging-only by construction → no tb_scanlog INSERT on Windows side. VM scanlog-legacy-mirror remains sole tb_scanlog writer (from tb_scanlog_safe_events).
- worker.php docstring updated (was "dual write", now "staging only").

## Files
- NEW ops/fservice-sync/lib-bridge-http.php
- NEW ops/fservice-sync/lib-hop-b-contract.php
- NEW ops/fservice-sync/lib-sync-scanlogs.php
- ops/fservice-sync/worker.php — includes, w_bridge_post wrapper, run_sync_scanlogs delegates, w_stage_one deleted, docstring
- ops/fservice-sync/sync.php — includes, bridge_post wrapper, sync_scanlogs delegates, _stage_scan deleted
- ops/fservice-sync/web/index.php — includes, bridge_post wrapper, sync_scanlogs_to_db delegates, _stage_one deleted
- ops/fservice-sync/hop-b-batch-selector.php — includes lib-log + lib-hop-b-contract, dup constants removed, pre-send assert in build_payload

## Verification
- php -l clean on ALL ops/fservice-sync/*.php (full sweep, 0 errors).
- Cross-language key parity: PHP `hop_b_build_source_event_key` === JS `buildHopBSourceEventKey` (byte-identical on sample).
- Pre-send assert smoke test: valid→null, key mismatch→"source_event_key mismatch (expected ...)", missing pin→"pin required".
- PHP test harness (hop-b-batch-selector-test.php, hop-b-worker-cycle-test.php) could NOT run — env missing PDO_SQLite driver (pre-existing gap, not my change). Tests use SQLite in-memory; don't touch bridge_post/sync flow anyway.
- JS hop-b tests could NOT run standalone — `@/` alias needs Next resolver (pre-existing). JS side untouched by this work.
- No orphan fns: w_stage_one/_stage_one/_stage_scan all 0 refs after deletion.

## Follow-up
- C5 (split ops/fservice-sync to own repo + contract CI gate): DEFERRED. User said "do it all" but C5 is outward-facing/hard-to-reverse; skill says "last, maybe never." Needs separate confirmation. Earned only after C1-C2 stable.
- Windows local tb_scanlog table now vestigial (nothing writes it). Can DROP in a future migration — not done here (irreversible, separate decision).
- Run PHP tests on a box with PDO_SQLite to confirm selector/worker-cycle regression-free.
- Watchdog still has its own /dev/info curl — acceptable (different module shape) but could later route through lib-bridge-http for consistency.
