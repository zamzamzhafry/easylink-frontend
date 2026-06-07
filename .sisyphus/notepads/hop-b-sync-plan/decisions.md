## 2026-05-29 (task 5) decisions

- Observability artifact location: `docs/scanlog-hop-b-direct-cutover-observability.md`.
- Operator-visible status contract: require Windows sync worker to emit `C:\EasyLinkOps\status\hop-b-sync-status.json` updated every run, atomic write.
- Alarming policy baseline:
  - backlog uses local queue counts + oldest age
  - any dead_letter row => CRITICAL
  - repeated 401/403 => auth alarm, do not conflate with generic 5xx/timeouts
  - transport failures alarm on streak duration, not single failure
- Evidence contract for incidents: `.sisyphus/evidence/task-5-<date>-<incident-id>/` with status copies + tail logs + operator notes.

## 2026-05-29 Task 3: Ingest Ledger Decisions
- Reuse existing tb_scanlog_safe_events for individual records (no parallel event table)
- Add tb_hop_b_ingest_log for batch-level tracking only
- source_sdk='fservice-hop-b' distinguishes HOP B records from SDK-bridge records
- Transaction boundary: commit events + update log status atomically before sending ack

## 2026-05-29 Task 1: Contract Decisions
- Envelope includes batch_id (UUID), sent_at, source_sdk, device_sn, record_count, records[]
- Ack includes inserted_count + duplicate_count for observability
- Replay policy: idempotent on batch_id, dedupe on source_event_key
- scan_time must be extracted/split from scan_date on Windows side before sending

## 2026-05-29 Task 4: Auth Contract Decisions
- Auth mechanism: Bearer shared secret token (v1, private network)
- Env vars: HOP_B_INGEST_URL, HOP_B_AUTH_TOKEN (both sides)
- No HMAC/timestamp validation in v1; documented as future upgrade
- Error codes machine-readable: AUTH_MISSING, AUTH_INVALID, PAYLOAD_INVALID, BATCH_CONFLICT, etc.
- Ingest endpoint path: /api/scanlog/ingest (new route, separate from existing /api/scanlog/sync)
- Consistent error envelope: {status, code, message, request_id}
- Idempotent replay: same batch_id + same payload_hash = 200 with duplicates count

## 2026-05-29 Task 6: Selector/Serializer Decisions
- New batches are materialized in local outbox tables at selection time (`sync_batch` + `sync_batch_item`) without mutating source staging rows or marking send state before ack
- Selector excludes already-linked staging rows by `LEFT JOIN sync_batch_item ... IS NULL`; this naturally excludes `sent`, `sending`, `pending`, `failed`, and `dead_letter` rows already attached to any batch while still allowing retry through existing batch records
- Retry eligibility for failed batches gated by `attempt_count < max_attempts` and `next_retry_at <= now` (or null)
- CLI output includes trace only when requested or internal payload object; serialized outbound JSON strips trace metadata to preserve contract

## 2026-05-29 Task 10: Retry Hook Decisions
- Sender/ingest hook contract uses structured result arrays with `outcome`, `status`, `last_error`, `http_status_code`, and visible `next_retry_at` so Task 11 sender and Task 13 ops surfaces can consume same shape.
- Retry scheduling increments `attempt_count` on each failed send attempt and schedules retry only when `retryable=true` and next attempt still below `max_attempts`; otherwise batch becomes `dead_letter` immediately.
- Auth failures (401/403 or `AUTH_*`) and validation failures (`PAYLOAD_INVALID`, `BATCH_CONFLICT`, 400/409/422) are permanent and must not loop.
- Status snapshot keeps runbook schema fields unchanged and may include extra diagnostic field `recent_auth_failures` without breaking baseline contract consumers.

## 2026-05-29 Task 8: Ingest Endpoint
- Route `app/api/scanlog/ingest/route.js` now stays thin and delegates request/auth/validation flow to `lib/hop-b-ingest-handler.js` so Task 9 can extend canonical write internals without mixing envelope checks into route code.
- `recordHopBReceipt()` now owns durable batch-ledger reservation/replay-conflict detection only; canonical event inserts and committed status update moved to `writeHopBCanonicalBatch()`.

## 2026-05-29 Task 7: Sender Decisions
- Extend sync_batch metadata columns for operator inspection: last_error_class, last_error_code, last_error_retryable, last_error_at, last_response_body, ck_status, ck_request_id, ck_response_body.
- Distinguish timeout from generic transport failure in stored failure class (	imeout vs 	ransport) while still keeping both retryable.
- Treat malformed/partial 2xx ack as retryable ingest failure; never mark sent unless ack body proves durable commit.


## 2026-05-29 22:10:37 Task 11 decisions
- Automation entry exposed as CLI flag --worker-run on existing script instead of new binary to avoid duplication and keep shared logic centralized.
- Worker cycle result envelope includes {status,outcome,batch_id,mode,send_result,status_snapshot,error?} for scheduler log parsing.
## 2026-05-29 Task 9: Canonical Trace Path Decision
- Keep Task 9 inside existing `tb_scanlog_safe_events` model.
- Traceability path for HOP B canonical rows = `tb_scanlog_safe_events.source_event_key` + `raw_payload._trace.{hop_b_ingest_log_id,source_batch_id,source_device_sn,source_event_key}`; no parallel canonical table and no schema expansion needed.

## 2026-05-29 Task 12: App-side cutover decisions
- Direct-cutover read path for scanlogs = /api/scanlog with canonical default on 	b_scanlog_safe_events.
- Legacy /api/scanlog/sync stays available only as explicit Windows SDK pull/mirror boundary; API responses now emit boundary metadata to make that scope clear.
- Kept boundary helper small/integration-focused in lib/scanlog-read-source.js instead of reworking wider scanlog pipeline.

