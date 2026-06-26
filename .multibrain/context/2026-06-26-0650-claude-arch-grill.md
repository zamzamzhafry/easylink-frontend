# 2026-06-26 06:50 — @claude — arch grill + test list

## Goal
Grill 3 architecture candidates from /tmp/architecture-review-easylink.html, produce test list.

## Summary
3 parallel grill agents (caveman-investigator). Verdicts:
- **#2 lib/domain/* → DELETE**: 13 exported symbols, 0 importers/0 callers/0 test doubles. Entire dir dead (scanlog-pipeline.ts, attendance-read-model.ts, + siblings employee-auth-model.ts, machine-gateway.ts only consumed by the also-dead scanlog-pipeline). Routes hand-roll mismatched schemas vs interface. All refs stale doc claims in .sisyphus/ + docs/. Deletion breaks nothing.
- **#1 lib/auth-session.ts → SPLIT-WORTHY**: 962L, 4 concerns. One-way seam: lib/auth-session.ts pure (~560L: types/constants/rebuilders/verifyPlainPassword) ← lib/auth-session-runtime.ts Next-only (~150L: cookie I/O + Response + codec wrappers). No cycle (runtime imports pure, pure imports nothing from runtime). 30 import sites gain ≤1 line. Tests already bypass runtime bucket — ponytail L5-9 holds.
- **#3 route wrapper → NOT-WORTHY**: 25/36 routes is_admin-only, 8 scoped authz, sync=941L worker-queue, stream=SSE, report/perf=CSV/XLSX. No wrapper fits >12/36. hop-b deps seam NOT reusable (sdk deps {fetch,db,device,limit,maxPages} specific to paginated SDK pull; writer+ledger hardcode pool). Real win: collapse 4 hand-rolled local ensureX guards (schedule ensureScheduleView/Edit, ops/recovery ensureAdmin, groups inline, schedule/quick-summaries ensureScheduleView) → one shared ensureAuth(scopeFn?) returning {auth} / {auth,allowedGroupIds} / {auth,error}.

## Changes
None (read-only grill). Output: verdicts + 8-item test list.

## Test list
1. tests/sdk-device-client.test.js — promote self-test (fake fetch, IsSession loop, empty Data, non-JSON, HTTP error, safety cap)
2. tests/request-json.test.js — extend (dedup hit, signal bypass, TTL expiry)
3. tests/date-range.test.js — extend (invalid-from+valid-to→from=to, both-invalid→today, 366 boundary, custom maxRangeDays)
4. tests/auth-session-pure.test.js — NEW, gates #1 split (pure bucket loads under node --test, rebuilders w/ fake DB)
5. tests/auth-session-by-karyawan-id.test.js — extend (fake pool, role mapping, inactive→null, placeholder block)
6. tests/ensure-auth.test.js — NEW, gates #3 collapse (4 guards→one, return shapes + 401/403)
7. tests/hop-b-sync-route.test.js — NEW (fake device sim, admin cookie→{pulled,inserted,lastScan}; non-admin→403; no-cookie→401)
8. QA gate — live hop-b real pull, device sim :8090 (user starting)

## Verification
Grill agents read-only; verdicts cross-checked against grep counts (importers, call sites, pool.query).

## Follow-up
- Execute #2 DELETE (cheapest).
- Execute #1 SPLIT, gated by test #4.
- Execute #3 collapse (ensureAuth), gated by test #6.
- Tests 1-3 = now (cheap, stabilization surface). 4-7 = gate refactors. 8 = manual.
