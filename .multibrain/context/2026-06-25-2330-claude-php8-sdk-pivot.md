# 2026-06-25 23:30 — @claude — php8 SDK pivot + dogfood hardening session

## Goal
Bug-hunt/dogfood hardening loop + architecture review + pivot hop-b sync onto php8 SDK sample pattern.

## Summary
13 commits (`520e4e9`→`cc71eb0`) on `fix/bug-hunt-and-hardening`. Two phases: (1) pool leak, PDF export, API dedup, viewMode, full i18n (13 pages EN/ID), changelog modal, schedule compaction, sidebar accordion, analytics formula modals, optimistic shift; (2) architecture review (8 candidates, `/tmp/architecture-review-easylink.html`) + new fetch-agnostic `lib/sdk-device-client.js` mirroring `easylink-sdk-study/php8-sample` contract (POST sn&limit, IsSession loop, {Data,Result,IsSession}) + `app/api/scanlog/hop-b-sync/route.js` (admin-only, INSERT IGNORE into tb_scanlog, separate from legacy sync).

## Changes
- `lib/db.js` pool singleton (HMR-safe)
- `lib/export-pdf.js` jspdf-autotable v5 fix
- `lib/request-json.js` GET dedup + signal bypass
- `lib/auth-session.ts` getLocaleFromCookies()
- `lib/localization/ui-texts.js` +5 page i18n key blocks
- `lib/sdk-device-client.js` NEW php8-style client
- `hooks/use-persisted-preference.js` same-document sync
- `components/sidebar.jsx` changelog modal + accordion
- `components/dashboard/*` 'use client' + useAppLocale
- `app/page.jsx, scanlog, employees, schedule, groups` i18n
- `app/users/page.jsx` viewMode wire
- `app/attendance/page.jsx` listener collapse
- `app/analytics/page.jsx` formula modals
- `app/api/scanlog/hop-b-sync/route.js` NEW
- `tests/auth.spec.ts` password default

## Files
See commit `cc71eb0` + 12 prior. Key new: `lib/sdk-device-client.js`, `app/api/scanlog/hop-b-sync/route.js`.

## Verification
Smoke 15/15 200. E2E via Playwright MCP (CLI chromium broken on ubuntu 26.04). Stress 60 reqs 0 err. EN/ID live all pages. Typecheck clean. 9 consecutive green dogfood passes. **NOT live-verified:** hop-b-sync real device pull (no admin cookie in curl) — contract matches php8 samples.

## Follow-up
- Live-verify `POST /api/scanlog/hop-b-sync` via Playwright admin login.
- Grill architecture candidate #2 (dead `lib/domain/*` interfaces) or #1 (auth-session split).
- Promote `lib/sdk-device-client.js` self-test to real `tests/sdk-device-client.test.js`.
- fsync bundle (`~/public/easylink-fsync-bundle.zip`) + sdk-study (`~/public/easylink-sdk-study.zip`) staged for PHP 8 fsync test app; PHP 8.5.4 CLI present, pdo_mysql/mbstring/zip not installed.
