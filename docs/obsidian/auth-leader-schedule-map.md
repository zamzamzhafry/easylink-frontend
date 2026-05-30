---
tags:
  - obsidian
  - auth
  - leader
  - schedule
  - nip
  - pin
---

# Auth / Leader / Schedule Map

Last updated: 2026-05-30

## Current model

Auth model already supports employee, leader, and admin behavior in code.

Key files:
- `app/api/auth/login/route.js`
- `app/api/auth/me/route.js`
- `lib/auth-session.ts`
- `lib/authz/authorization-adapter.ts`
- `app/api/schedule/route.js`
- `app/schedule/page.jsx`

## Login identifiers

Login route accepts `login_id` or `nip`.
It normalizes with:
- `const loginId = String(result.data.login_id || result.data.nip || '').trim();`

Static mapping confirmed:
- `createAuthContextByLoginId(...)`
- `createAuthContextByNip(...)`
- legacy PIN fallback path also exists

## Schedule authority

Static code says schedule edit ability already exists for leaders.

Important checks:
- `canManageSchedule(auth)` in `lib/authz/authorization-adapter.ts`
- `const canEdit = canManageSchedule(currentUser);` in `app/schedule/page.jsx`
- API POST gate in `app/api/schedule/route.js` says only group leaders and admins may edit schedules

## Most likely real problem

If a leader cannot create schedules, static code suggests data/context issue rather than missing permission logic.

Most likely runtime causes:
1. `is_leader` false in resolved auth session
2. `can_schedule` false in resolved auth session
3. wrong `groups` attached to user
4. bad account mapping between login identity and employee identity
5. missing/incorrect `tb_user_group_access` or role rows

## Required evidence for failing account

Capture `/api/auth/me` JSON for failing leader account and review:
- `login_id`
- `nip`
- `role_key`
- `is_leader`
- `can_schedule`
- `can_dashboard`
- `groups`
- `canonical_roles`

Also capture any `403` body from `/api/schedule`.

## Related notes

- [[qa-review-checklist]]
- [[attendance-performance-fixes]]
- [[../human-handoff-pull-rebuild-sync]]

## Backlinks

- [[index]]
