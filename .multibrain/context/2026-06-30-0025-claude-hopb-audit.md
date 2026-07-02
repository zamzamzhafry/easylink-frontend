# Hop B Pipeline + PHP Sync Audit

## Goal
Re-check hop-b push approach + PHP sync files after prior retry_scheduled + query-string fixes.

## Summary
Adversarial 7-agent audit (workflow) + independent verification. Found 2 critical bugs missed earlier, 1 prior fix was WRONG (query-string globalized), plus paging/migration/config gaps. Fixed all actionable.

## Changes (all in ops/fservice-sync/)

### CRITICAL: worker.php check-order bug (selector catch swallows errors)
`hop_b_run_worker_cycle` catch returns `{status:'error', outcome:'no_op'}` on any Throwable.
worker.php checked `outcome==='no_op'` BEFORE `status==='error'` → exception treated as clean
drain-complete → job marked done, errors swallowed. Fix: reordered — `status==='error'` now
checked first (worker.php ~line 415).

### CRITICAL: query-string fix was WRONG — reverted to per-endpoint (1:1 easylink.ps1)
Prior fix sent ALL params as query string, empty POST body. easylink.ps1 (working sample)
is per-endpoint:
- `/scanlog/new` → query string (sn+limit+from+to)
- `/scanlog/all/paging`, `/user/all/paging`, `/dev/info` → POST body (sn+limit)
Globalizing query-only BROKE paging endpoints. Fix: 3 bridge_post fns (worker.php, web/index.php,
sync.php) now branch on `$path === '/scanlog/new'`. Verified vs docs/learning/easylink.ps1:25,100,128,194.

### Paging: `page` param never sent
worker.php run_sync_scanlogs + web sync_scanlogs_to_db + sync.php Phase 2 called paging endpoint
with only `limit`, never `page`. Re-fetched page 1 / undefined behavior. Fix: pass `page` for
`/scanlog/all/paging` only, increment per loop (start=1, matching easylink.ps1).

### retry_scheduled branch (prior fix — verified safe)
selector requeues (status='failed', next_retry_at set, attempt_count+1). --worker-run picks
`status='failed' AND next_retry_at<=now` (line 772). Worker breaks on first retry_scheduled,
no error pushed, job done. Next run retries. Confirmed no data loss.

### 004 migration never applied
README apply order only listed 001/002/003. app_config table missing → config_get silently
returned default → auto_hop_b_push toggle invisible (OFF). Fix: README Step 4 added; config_get
now logs ERROR once on read failure (was silent catch).

## Files
- ops/fservice-sync/worker.php — check-order, bridge_post per-endpoint, page param, config_get log
- ops/fservice-sync/web/index.php — bridge_post per-endpoint, page param
- ops/fservice-sync/sync.php — bridge_post per-endpoint, page param
- ops/fservice-sync/migrations/README.md — Step 4 (004)

## Verification
- php -l clean on all 3 PHP files.
- source_event_key formula MATCHES both sides (sn|date|time|pin|verify|io|workcode) — auditor's
  CRITICAL here REFUTED by independent read.
- contract ack-parsing: selector unwraps `ack.*` (parse_success_ack line 867), validates counts —
  no mismatch with Next.js nested-ack response.
- easylink.ps1 ground truth confirmed POST-body for paging, query for /scanlog/new.

## Follow-up (NOT fixed — lower priority)
- No job lease: job_load→job_set_running non-atomic (no FOR UPDATE, no owner col). Concurrent
  workers (watchdog+web+cron) could grab same job. Add owner/lease col to fservice_jobs.
- No scheduler/cron for hop_b_push: retry_scheduled batch stranded if no new sync_scanlogs rows
  afterward (auto-chain only fires on staged>0). Add schtasks/cron tick.
- sync.php Phase 1 /scanlog/new not looped on IsSession — if >100 new rows, remainder dropped.
  Low risk (new usually <100); wrap in while if needed.
- config_get still swallows non-table errors as default; only logs on first miss.
