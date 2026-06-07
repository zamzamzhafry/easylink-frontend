# Hop B Ingest Contract — Verified Reference (2026-06-07)

**Status:** VERIFIED by reading source. Do not re-guess these rules — they were
previously guessed, caused a fragile handshake probe, and are now confirmed.

**Hop B definition:** Windows machine → VM Linux Next.js app data path. The
Windows side posts scanlog batches to the VM at `POST /api/scanlog/ingest`.
The `easylinksdk → Windows` side (the old/unsafe FService pull) is out of scope
here and must stay true to its developer docs — do not rewrite that side.

## Endpoints

| Method | Path                          | Purpose                          | Notes |
| ------ | ----------------------------- | -------------------------------- | ----- |
| GET    | `/api/scanlog/hop-b-status`   | Read-only build/health probe     | `force-dynamic`, `Cache-Control: no-store`. 200 JSON ok / 500 JSON `{status:'error',code:'STATUS_QUERY_FAILED'}`. Safe to probe. |
| POST   | `/api/scanlog/ingest`         | Receive a Hop B batch            | `force-dynamic`. Always returns JSON (route re-wraps handler JSON with `Cache-Control: no-store`). |

VM = `192.168.1.129`, app on port `3000`. Default ingest URL:
`http://192.168.1.129:3000/api/scanlog/ingest`.

## Source files (VM repo `E:\Project\easylink-frontend`)

- `app/api/scanlog/ingest/route.js` — POST → `handleHopBIngestPost(request)` from `@/lib/hop-b-ingest-handler`, then re-wraps as JSON with `no-store`.
- `lib/hop-b-ingest-handler.js` — auth + orchestration.
- `lib/hop-b-ingest-contract.js` — `validateHopBBatchPayload()` (the schema rules below).
- `lib/hop-b-ingest-ledger.js` — `recordHopBReceipt()` (writes `tb_hop_b_ingest_log`).
- `lib/hop-b-ingest-writer.js` — `writeHopBCanonicalBatch()`.

## Handler order (critical)

`handleHopBIngestPost` runs in this exact order:

1. **auth** (before anything else)
2. parse JSON body
3. validate envelope schema
4. record receipt (ledger write)
5. write canonical batch

**Consequence:** a bad token returns `401` *before* the body is even parsed, so
token correctness is provable regardless of payload. And a schema rejection
(e.g. empty records) happens at step 3, *before* the ledger write at step 4 —
so a rejected handshake writes nothing to `tb_hop_b_ingest_log`.

## Authentication

- Reads `process.env.HOP_B_AUTH_TOKEN`.
  - unset → `500` code `AUTH_NOT_CONFIGURED`.
- Reads `authorization` header.
  - missing/empty → `401` `AUTH_MISSING`.
  - must match `/^Bearer\s+(.+)$/i` (the `Bearer ` prefix is required) → else `401` `AUTH_MISSING`.
  - token ≠ configured → `401` `AUTH_INVALID`.
  - match → proceed.

## Body parsing

- `Content-Type` must contain `application/json` → else `415` `CONTENT_TYPE_INVALID`.
- malformed JSON → `400` `JSON_INVALID`.

## Envelope schema (`validateHopBBatchPayload`)

Constants: `HOP_B_SCHEMA_VERSION = '1.0.0'`, `HOP_B_SOURCE_SDK = 'fservice-hop-b'`.

Required top-level fields (any `undefined` → `400` `PAYLOAD_INVALID` "Missing required fields: …"):
`schema_version`, `batch_id`, `sent_at`, `source_sdk`, `device_sn`, `record_count`, `records`.

| Field            | Rule                                                                 | Violation |
| ---------------- | ------------------------------------------------------------------- | --------- |
| `schema_version` | must `=== '1.0.0'`                                                  | `409` `SCHEMA_VERSION_UNSUPPORTED` |
| `batch_id`       | UUID v4: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` | `400` `PAYLOAD_INVALID` "batch_id must be UUID v4" |
| `sent_at`        | ISO UTC: `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/`     | `400` `PAYLOAD_INVALID` |
| `source_sdk`     | must `=== 'fservice-hop-b'`                                         | `400` `PAYLOAD_INVALID` |
| `device_sn`      | required, non-empty                                                 | `400` `PAYLOAD_INVALID` |
| `record_count`   | integer                                                            | `400` `PAYLOAD_INVALID` |
| `records`        | Array                                                              | `400` `PAYLOAD_INVALID` |
| `records`        | length `=== 0`                                                     | **`400` `BATCH_EMPTY`** "records must not be empty" |
| `record_count`   | must `=== records.length`                                          | `400` `PAYLOAD_INVALID` mismatch |

Per-record (`validateRecord`), each record requires:
`device_sn` (must equal batch `device_sn`), `scan_date` (`YYYY-MM-DD`),
`scan_time` (`HH:MM:SS`), `pin`, `verify_mode` (int), `io_mode` (int),
`workcode` (int), and `source_event_key` which MUST equal
`buildHopBSourceEventKey` = `device_sn|scan_date|scan_time|pin|verify_mode|io_mode|workcode`.

## Responses

Success (`200`):
```json
{ "status":"ok", "code":"BATCH_ACCEPTED" | "BATCH_REPLAYED",
  "message":"…", "request_id":"…",
  "ack":{ "batch_id":"…","record_count":N,"inserted_count":N,
          "duplicate_count":N,"replay":bool,"received_at":"…","committed_at":"…" } }
```

Error (any 4xx/5xx):
```json
{ "status":"error", "code":"…", "message":"…", "request_id":"…" }
```

## The clean handshake (non-polluting health probe)

Send a **schema-valid envelope with `records: []`**. Everything passes (TCP,
content-type, Bearer auth, JSON parse, schema) and only the empty-records guard
fires → `400` `BATCH_EMPTY`. No ledger write. This is exactly what
`ops/fservice-sync/handshake-test.ps1` does (it asserts the `code` field equals
`BATCH_EMPTY`).

Minimal valid handshake body:
```json
{ "schema_version":"1.0.0",
  "batch_id":"<UUID v4>",
  "sent_at":"<ISO 8601 UTC, e.g. 2026-06-07T12:34:56.789Z>",
  "source_sdk":"fservice-hop-b",
  "device_sn":"HANDSHAKE-PROBE",
  "record_count":0,
  "records":[] }
```

Outcome interpretation:
- `400` + `BATCH_EMPTY` → PASS (token + contract OK, nothing written).
- `2xx` → FAIL: empty batch was accepted → contract changed, re-verify source.
- `401` `AUTH_MISSING`/`AUTH_INVALID` → token mismatch with VM `.env`.
- `415` `CONTENT_TYPE_INVALID` → client didn't send `application/json`.
- `404` HTML → route missing / stale VM build → rebuild.
- `400` with code ≠ `BATCH_EMPTY` → route+token OK but envelope rejected → contract drift.

## DB ledger

Table `tb_hop_b_ingest_log` cols: `id, batch_id, status, received_at,
committed_at, inserted_count, duplicate_count`. Written by `recordHopBReceipt`
(step 4) — only reached after schema validation passes, so handshake probes
never appear here.

## Windows side env (from `ops/fservice-sync/`)

- `run.bat` sets FService/PHP/DB envs but does **NOT** set `HOP_B_AUTH_TOKEN`
  or `HOP_B_INGEST_URL` — those must be set in the shell before sync/handshake.
- `run.bat` DB creds = `root` / empty (DIFFER from older handout `easylink` /
  `RSSU2026Aa11!`).
- `hop-b-batch-selector.php` requires `getenv('HOP_B_INGEST_URL')` and
  `getenv('HOP_B_AUTH_TOKEN')` (throws `InvalidArgumentException` if missing).
- PHP: `C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe`.

## Still UNVERIFIED (flagged, do not assume)

- PM2 app name: handout uses `easylink-frontend`; older handout used `easylink`.
- Repo paths on both boxes (Linux `~/apps/easylink-frontend`, Windows
  `C:\Users\USER\Desktop\easylink-frontend`) are guessed.
- App bind `0.0.0.0` vs `127.0.0.1` not confirmed; no rebind fix step exists.

## Related deliverables

- `docs/human-handoff-update-vm-and-windows-2026-06-07.md` — human runbook (its
  section C now reflects this contract).
- `ops/fservice-sync/handshake-test.ps1` — reusable probe asserting `BATCH_EMPTY`.
