# HOP B Outbox Migrations

Local Windows MySQL/MariaDB schema for the scanlog sync outbox pattern.

## 001_hop_b_outbox.sql

Creates `easylink_bridge` database with four tables:

| Table | Purpose |
|---|---|
| `fetch_checkpoint` | Per-device cursor tracking last FService fetch position |
| `raw_scanlog_staging` | Individual scan rows staged before batching, deduped by `source_event_key` |
| `sync_batch` | Outbox — one row per batch pushed to Linux VM |
| `sync_batch_item` | Links staging rows to their parent batch |

## Batch State Machine

```
pending → sending → sent
                  ↘ failed → (retry) → sending
                           ↘ dead_letter
```

| State | Meaning |
|---|---|
| `pending` | Batch created, not yet attempted |
| `sending` | HTTP POST in flight |
| `sent` | Linux ack received (HTTP 200 + `status:accepted`); ONLY then mark sent |
| `failed` | Attempt failed, will retry up to `max_attempts` with exponential backoff |
| `dead_letter` | Max retries exhausted, requires operator intervention |

## source_event_key

Formula: `sn|scan_date|scan_time|pin|verifymode|iomode|workcode`

Computed on staging insert for early deduplication before batching.
