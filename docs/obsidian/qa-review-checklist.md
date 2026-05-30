---
tags:
  - obsidian
  - qa
  - checklist
  - deploy
  - hop-b
  - attendance
  - performance
---

# QA Review Checklist

Last updated: 2026-05-30

## Deploy sync first

Before app QA, ensure target machine has latest commits:
- `eeb94f3` — docs QA handoff
- `50a5af0` — performance auth-session reuse
- `8ef19ef` — missing HOP B contract file
- `5565303` — attendance request-loop fix
- `705dac2` — HOP B ingest/status flow

## QA checklist

### 1. Login / shell sanity
- log in successfully
- confirm sidebar renders expected role label
- confirm no immediate auth kick

### 2. Attendance page
- open attendance page
- verify page no longer crashes
- click preset range buttons: Today / Week / Month
- verify data loads and range changes work
- test manual refresh button

### 3. Performance page
- open `/performance`
- switch tabs / refocus window several times
- verify no session kick
- watch network panel for repeated `/api/auth/me` bursts

### 4. HOP B status routes
- `GET /api/scanlog/hop-b-status` should return JSON 200
- `GET /api/scanlog/ingest` should return 405, not HTML 404

### 5. Leader schedule review
- log in with failing leader account
- open schedule page
- record whether create/edit controls appear
- if blocked, capture `/api/auth/me`
- if API rejects, capture `/api/schedule` response body

## What to send back

- attendance result
- performance result
- browser network evidence for `/api/auth/me`, `/api/performance`, `/api/groups`
- leader-account `/api/auth/me` payload
- any `/api/schedule` 403 response
- HOP B route curl output if still failing

## Related notes

- [[hop-b-sync-status]]
- [[attendance-performance-fixes]]
- [[auth-leader-schedule-map]]
- [[../human-handoff-pull-rebuild-sync]]

## Backlinks

- [[index]]
