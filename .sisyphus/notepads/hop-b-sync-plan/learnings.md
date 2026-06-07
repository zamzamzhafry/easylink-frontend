## 2026-05-29 (task 5) observability notes

- Existing ops patterns already use status JSON file approach for recovery tasks:
  - `docs/release/server-machine-task-scheduler-setup.md`
  - `EASYLINK_OPS_STATUS_PATH=C:\EasyLinkOps\status\recovery-status.json`
- FService bridge known to return non-JSON or truncated responses, treat JSON parse errors as bridge health failure signal.
- Direct cutover policy match: Windows local staging DB treated as temporary durable buffer, Linux VM DB canonical.
- Operator checks should prefer PowerShell/curl commands plus file-based status, not browser-only clicks.

## 2026-05-29 Task 3: Linux Ingest Ledger
- Schema file: migrations/003_hop_b_ingest_ledger.sql
- New table: tb_hop_b_ingest_log (batch-level tracking for HOP B)
- Individual records go into existing tb_scanlog_safe_events (no new event table)
- Replay safety: uq_hop_b_batch on batch_id + INSERT IGNORE on source_event_key
- Durable commit boundary: both event inserts + log status update in single transaction before ack

## 2026-05-29 Task 1: Batch Contract
- Contract artifact: docs/hop-b-scanlog-batch-contract.md
- Idempotency key reuses existing buildSourceEventKey() from scanlog-pipeline.ts
- schema_version starts at 1.0.0
- source_sdk for HOP B = "fservice-hop-b"

## 2026-05-29 Task 2: Windows Outbox Schema
- Schema file: ops/fservice-sync/migrations/001_hop_b_outbox.sql
- Database: easylink_bridge (local Windows)
- Tables: fetch_checkpoint, raw_scanlog_staging, sync_batch, sync_batch_item
- State machine: pending->sending->sent->failed->dead_letter
- sent ONLY after durable Linux ack
- source_event_key computed on staging insert for early dedupe

## 2026-05-29 Task 5: Observability Runbook
- Runbook: docs/hop-b-observability-runbook.md
- Status file: C:\EasyLinkOps\status\hop-b-sync-status.json (atomic write every run)
- Alarm thresholds: backlog>500 or >60min old, 3+ auth fails, dead_letter>0
- Follows existing ops pattern from server-machine-task-scheduler-setup.md

## 2026-05-29 Task 6: Selector/Serializer
- Selector file: `ops/fservice-sync/hop-b-batch-selector.php`
- Deterministic selection order: existing retryable batch first (`pending`, then eligible `failed`), else earliest unbatched device by `raw_scanlog_staging.fetched_at ASC, id ASC`; rows inside batch ordered `fetched_at ASC, id ASC`
- Retry serialization reuses same `batch_id` and same ordered `sync_batch_item` mapping, producing stable payload bytes and stable SHA-256 `payload_hash`
- Traceability kept via `_trace.staging_ids` and `_trace.source_event_keys` in CLI output; wire payload remains contract-clean because `_trace` removed before `payload_json` encoding
- Batch scope stays single-device per payload, mat

## 2026-05-29 Task 10: Retry Hooks + Failure Logging
- `ops/fservice-sync/hop-b-batch-selector.php` now exposes retry scheduling helper returning both DB UTC timestamp and operator-facing ISO8601 `next_retry_at` for status/log surfaces.
- Failure classification stays split by class: transport retryable, auth permanent, validation permanent, ingest/5xx retryable; non-JSON 5xx response mapped to `INGEST_BAD_RESPONSE` for bridge/app visibility.
- Status snapshot derives runbook fields from `sync_batch` state and counts recent auth failures as consecutive newest auth-class errors only; newer non-auth failure resets streak.
- Structured log context builder emits batch_id, outcome, attempt_count, failure_class/code, and `next_retry_at` so direct-cutover operators can inspect retry queue timing without reading raw DB rows.
- Replay/no-op success outcomes are preserved in sender hook shape even though both settle batch to `sent`.
ching contract `device_sn` field and avoiding mixed-device envelopes

## 2026-05-29 Task 8: Ingest Endpoint
- Deterministic machine-to-machine error envelope now covered for auth missing/invalid, wrong content-type, malformed JSON, unsupported schema version, missing records, and batch conflict via `tests/hop-b-ingest-route.test.js`.
- For direct Node testability, shared ingest handler uses web `Response.json()` and relative `./db.js` imports; Next route wraps returned body back into `NextResponse`.

## 2026-05-29 Task 7: Windows Sender + Ack Handling
- Sender reuses hop_b_prepare_outbound_batch() payload bytes/hash from Task 6, then posts exact serialized JSON with Authorization: Bearer <token>, X-Request-Id, X-Sent-At.
- Durable success boundary stays strict: local sync_batch.status flips to sent only after 2xx JSON ack parses cleanly, echoes same atch_id, supplies counts, and includes valid committed_at.
- Runtime verification stayed PHP-only because workspace still lacks intelephense; sender tests use local socket helper process instead of pcntl_fork() for Windows-friendly execution.


## 2026-05-29 22:10:37 Task 11: Windows worker path
- Added hop_b_run_worker_cycle() in ops/fservice-sync/hop-b-batch-selector.php as scheduler-safe one-cycle entry using shared selector + sender + retry hooks.
- No-work cycle returns outcome 
o_op and still writes status snapshot to configured status path.
- Queued-work cycle sends via existing sender path and writes post-send status snapshot for automation monitoring.
## 2026-05-29 Task 9: Canonical Dedupe Writer
- `lib/hop-b-ingest-writer.js` now stamps canonical `raw_payload` with `_trace.hop_b_ingest_log_id`, `_trace.source_batch_id`, `_trace.source_device_sn`, `_trace.source_event_key` so Linux-side canonical rows remain traceable to source batch/device without new schema.
- `writeHopBCanonicalBatch()` now receives `sourceBatchId` from handler and carries it into per-record payload before `INSERT IGNORE` into `tb_scanlog_safe_events`.
- Replay safety still relies on existing `uq_safe_source_event` unique key plus batch-level ledger ack counts; duplicate replays update receipt with `inserted_count=0`, `duplicate_count=n` and do not grow canonical row count.

## 2026-05-29 Task 12: App-side canonical scanlog read cutover
- Direct scanlog read path now defaults to canonical Linux store via lib/scanlog-read-source.js and pp/api/scanlog/route.js.
- source=safe normalized to canonical to preserve older callers without keeping Windows bridge as default.
- Scanlog page default filter now targets canonical Linux records; legacy mirror remains opt-in only.

## 2026-05-30 Tests-after: HOP B core behavior coverage
- New file `tests/hop-b-cutover-read-source.test.js` — 13 tests covering resolveScanlogReadSource + buildScanlogReadBoundary branches.
- Extended `tests/hop-b-ingest-route.test.js` from 12 → 18 tests. Added: empty records (BATCH_EMPTY), malformed bearer format (AUTH_MISSING), ledger throw → INGEST_INTERNAL_ERROR 500, writer throw → INGEST_INTERNAL_ERROR 500.
- Pre-existing typecheck error in `lib/hop-b-status.js` (TS1005 try expected) — unrelated to test changes; `npm run build` passes clean.
- `node --test` runner with `describe()`/`it()` pattern works for pure-function modules (scanlog-read-source) without DB mocking.
- Handler error-path tests use injected deps (recordHopBReceipt / writeHopBCanonicalBatch) that throw — catches `INGEST_INTERNAL_ERROR` envelope at status 500.
- `normalizeRequestedSource()` internal function not exported; tested indirectly via resolveScanlogReadSource with 'safe', 'canonical', 'legacy', undefined, and 'bogus' inputs.



## 2026-05-30 Task: HOP B Status Surface
- Created: `lib/hop-b-status.js` (status query helper), `app/api/scanlog/hop-b-status/route.js` (API route), `tests/hop-b-status.test.js` (tests)
- Status query: 3 SQL queries — recent batches (ORDER BY received_at DESC LIMIT 10), counts by status GROUP BY, aggregate SUM/MAX
- DI pattern: `readHopBIngestStatus({ connectionPool })` for testability — same as ingest handler pattern
- Mock query matching gotcha: SQL template literals have newlines; must match with `includes()` not `startsWith()` for multi-line SQL
- No auth required for this route (internal admin status, matches plan spec)
- `force-dynamic` export prevents static generation of status route
- No secrets in output — only batch IDs, counts, timestamps, status enum values
