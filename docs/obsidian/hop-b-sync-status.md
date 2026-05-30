---
tags:
  - obsidian
  - hop-b
  - scanlog
  - ingest
  - cutover
---

# HOP B Sync Status

Last updated: 2026-05-30

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

## Next human checks

- verify deploy/rebuild on target machine
- verify sender is the path actually invoked from Windows
- compare CLI path vs legacy UI path behavior
- inspect `tb_hop_b_ingest_log` after each sync attempt

## Related notes

- [[qa-review-checklist]]
- [[attendance-performance-fixes]]
- [[../human-handoff-pull-rebuild-sync]]
- [[../hop-b-scanlog-batch-contract]]
- [[../hop-b-auth-contract]]
- [[../hop-b-observability-runbook]]

## Backlinks

- [[index]]
