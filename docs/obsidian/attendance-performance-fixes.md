---
tags:
  - obsidian
  - attendance
  - performance
  - auth
  - request-loop
---

# Attendance + Performance Fixes

Last updated: 2026-05-30

## Attendance crash fix

User-reported crash was on attendance page.

Direct cause:
- `app/attendance/page.jsx` passed `onSetRange={handleSetRange}`
- `handleSetRange` was not defined in that file
- nearby local helper `setRange(unit)` already existed

Fix:
- changed prop to `onSetRange={setRange}`

## Attendance request-loop findings

Repeated traffic came from stacked refresh/auth paths, not a single timer.

Mapped contributors:
- attendance focus/visibility refresh behavior
- effect-driven data loading in attendance page
- app shell auth fetch behavior
- performance page auth fetch behavior
- middleware auth rate limit (`RATE_LIMIT_MAX_AUTH = 10`)

## Performance fix pushed

Commit:
- `50a5af0` — `fix(performance): reuse shared auth session state`

What changed in `app/performance/page.jsx`:
- removed local `/api/auth/me` fetch path
- reused `useAuthSession()` shared session state instead
- only admins still fetch `/api/groups`
- non-admin group state derives from `authUser.groups`

## Expected effect

- fewer duplicate `/api/auth/me` calls
- lower risk of hitting auth middleware rate limit
- less chance of getting kicked from `/performance`

## Still worth watching in QA

- whether `components/app-shell.jsx` + page-level auth logic still combine badly under rapid tab switches
- whether browser focus/visibility refreshes create burst behavior on weak network
- whether `/performance` still spikes `/api/groups` for admins
- whether attendance page preset range buttons remain stable after repeated use

## Related notes

- [[qa-review-checklist]]
- [[auth-leader-schedule-map]]
- [[../human-handoff-pull-rebuild-sync]]

## Backlinks

- [[index]]
