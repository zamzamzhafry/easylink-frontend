---
tags:
  - obsidian
  - hop-b
  - scanlog
  - ingest
  - cutover
---

# HOP B Sync Status

Last updated: 2026-06-15

## Current outcome

HOP B scanlog pipeline is implemented, committed, and pushed to `origin/master`.

Important pushed commits:
- `705dac2` — `feat(scanlog): add HOP B ingest and sync status flow`
- `8ef19ef` — `fix(scanlog): add missing hop-b ingest contract module`
- `eeb94f3` — `docs: expand human QA handoff for app review`

## What HOP B now includes

- Windows selector/sender path in `ops/fservice-sync/hop-b-batch-selector.php`
- Linux ingest route in `app/api/scanlog/ingest/route.js`
- Linux status route in `app/api/scanlog/hop-b-status/route.js`
- Canonical write path via:
  - `lib/hop-b-ingest-handler.js`
  - `lib/hop-b-ingest-ledger.js`
  - `lib/hop-b-ingest-writer.js`
  - `lib/hop-b-ingest-contract.js`
- Cutover read-source helper in `lib/scanlog-read-source.js`

## Runtime facts already proven

- Production/staging previously failed because `lib/hop-b-ingest-contract.js` was missing from pushed commit.
- That missing file was later committed and pushed separately.
- After fix, route checks showed:
  - `GET /api/scanlog/hop-b-status` → `200 OK`
  - `GET /api/scanlog/ingest` → `405 Method Not Allowed`
- `405` on ingest is expected because route is POST-only.

## Remaining uncertainty

The old Windows/SDK-side "Sync New Scanlogs" path reported success, but Linux HOP B status still showed zero ingest rows during user testing. This means one of these is still true:
1. old SDK UI path is only doing local success, not HOP B POST
2. sender path on Windows machine differs from tested CLI path
3. bridge/FService path is inconsistent between "new" and "all"
4. Linux ingest receives nothing because Windows never posts batch

## 2026-06-15 update: silent-empty consumer mystery resolved

Symptom observed by user: HOP B ingest succeeds (rows visible in `tb_scanlog_safe_events` and `tb_hop_b_ingest_log.status = 'committed'`), `/scanlog` admin page shows data, but every other page (`/`, `/attendance`, `/analytics`, `/report`, `/performance`, `/schedule`, `/employees/[id]`, `/users`) shows nothing.

Root cause: **canonical vs legacy split-brain**.

- HOP B ingest writes ONLY to `tb_scanlog_safe_events` (canonical).
- Only `/api/scanlog/route.js` reads canonical via `lib/scanlog-read-source.js`.
- Every other page-facing API hardcodes `FROM tb_scanlog sl` (legacy table).
- Only `/api/scanlog/sync` (legacy SDK pull path) mirrored safe events into legacy via `mergeSafeEventsIntoLegacy`.
- HOP B handler never called that mirror, so HOP B-only batches were invisible to every consumer page.

This also explains "Linux HOP B status showed zero ingest rows during user testing" in the prior uncertainty section: ingest itself was fine on the Windows tests where rows actually arrived, but consumers were still reading legacy and reporting empty.

### Fix landed (Option A — single-point bridge)

1. Extracted `mergeSafeEventsIntoLegacy` from `app/api/scanlog/sync/route.js` to shared module `lib/scanlog-legacy-mirror.js`. Both ingest paths now share the same idempotent `NOT EXISTS` mirror.
2. `lib/hop-b-ingest-handler.js` now invokes `mergeSafeEventsIntoLegacy({ batchId, from, to })` after `writeHopBCanonicalBatch`. Wrapped best-effort so a mirror failure does not break the ingest receipt; failures are logged as structured `hop_b_legacy_mirror_failed` warnings.
3. `lib/hop-b-ingest-writer.js` now binds `ingestLogId` into the `batch_id` column (previously hardcoded `NULL`), so batch-id-based mirror lookups also work, not only range lookups.

### Architectural note (per `docs/graphify-app-direction.md` §3 and §5)

This mirror is a **short-term bridge**, not the long-term direction:

- Long-term consumer reads should move to canonical (`tb_scanlog_safe_events`) or projection tables, not perpetuate dual-table writes.
- Mirror exists to keep the 10+ legacy readers working until canonical/projection cutover lands.
- Mirror is idempotent (`NOT EXISTS` dedupe on `(sn, pin, scan_at, verifymode, iomode, workcode)`), aligning with §3 (machine ops reliability, dedupe, recovery hooks).

### Follow-ups still open

- `/api/admin/migrate-scanlog` targets a non-existent `scanlog_events` table and a wrong column (`verify_mode` vs `verifymode`). It is dead and should be replaced with a real canonical → legacy backfill for the historical HOP B-only gap.
- `migrations/003_hop_b_ingest_ledger.sql` declares prerequisite `migration_scanlog_safe_events.sql` which is not in the repo. Add it from prod DDL.
- `lib/flags/migration-flags.ts` exposes `EASYLINK_POLICY_SOURCE_MODE`, `EASYLINK_DATA_SOURCE_CUTOVER_MODE`, `EASYLINK_MACHINE_PARITY_EXPOSURE_MODE`, `EASYLINK_REPORTING_INTERACTION_MODE`. They are returned in sync API responses but no read path branches on them. Either wire `resolveScanlogReadSource` to honor `EASYLINK_DATA_SOURCE_CUTOVER_MODE`, or remove the flags.

## Next human checks

- verify deploy/rebuild on target machine
- verify sender is the path actually invoked from Windows
- compare CLI path vs legacy UI path behavior
- inspect `tb_hop_b_ingest_log` after each sync attempt
- after deploy of mirror fix, confirm `SELECT MAX(scan_date) FROM tb_scanlog` advances on next HOP B POST and consumer pages repopulate

## Related notes

- [[qa-review-checklist]]
- [[attendance-performance-fixes]]
- [[../human-handoff-pull-rebuild-sync]]
- [[../hop-b-scanlog-batch-contract]]
- [[../hop-b-auth-contract]]
- [[../hop-b-observability-runbook]]

## Backlinks

- [[index]]
