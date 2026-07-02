# Multi-Brain Session Index

> Scan this file first. Pick relevant bucket, read its index, open context files only if needed.

## Buckets

- `agents` — Agent setup, config, multi-brain maintenance. Last updated: 2026-06-01 -> .multibrain/indexes/agents.md
- `ui` — UI bug fixes, token migration, dark mode, print features. Last updated: 2026-06-25 -> .multibrain/indexes/ui.md
- `auth` — Auth hardening, security fixes, connection leaks. Last updated: 2026-06-25 -> .multibrain/indexes/auth.md
- `sync` — FService bridge ↔ VM pipeline (PHP ops/fservice-sync + Next.js ingest). Last updated: 2026-06-30 -> .multibrain/indexes/sync.md

## Latest Session (2026-06-25 23:30)
php8 SDK pivot + dogfood hardening. 13 commits `520e4e9`→`cc71eb0` on `fix/bug-hunt-and-hardening`. Full i18n (13 pages EN/ID), API dedup (signal-safe), viewMode live, changelog modal, sidebar accordion, schedule compaction, analytics formula modals, optimistic shift, php8-style `lib/sdk-device-client.js` + `app/api/scanlog/hop-b-sync/route.js` (admin-only, INSERT IGNORE tb_scanlog). Architecture review 8 candidates at `/tmp/architecture-review-easylink.html`. 9 green dogfood passes. NOT live-verified: hop-b-sync real device pull. Handoff at `/tmp/handoff-easylink-2026-06-25.md`. -> .multibrain/context/2026-06-25-2330-claude-php8-sdk-pivot.md

## Session (2026-06-25 22:50)
PDF export fix (jspdf-autotable v5 functional API in lib/export-pdf.js, 10 call sites) + MySQL pool leak fix (globalThis singleton + .end() on HMR swap in lib/db.js) on commit `520e4e9`. Dogfood QA 13 pages clean. Key facts: jspdf-autotable v5+ needs applyPlugin or functional form; mysql2 pools NOT closed on module GC in Next dev HMR; default max_connections=151 too low for shared VM. -> .multibrain/context/2026-06-25-2250-claude-pdf-pool-fixes.md

## Session (2026-06-24)
Comprehensive bug hunt: 18+ bugs fixed (security ×4, performance ×5, correctness ×4, UX ×2, leaks ×3). Created 4 shared libs (csv/time/date-range/format-date) with 22 tests. Token migration 226 violations cleared. Dark mode config fixed. Compact print mode added. -> .multibrain/context/2026-06-24-bug-hunt-session.md

