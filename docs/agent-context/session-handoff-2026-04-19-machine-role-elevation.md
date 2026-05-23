# Session Handoff - Machine Role Elevation Explanation

**Status**: Reference  
**Canonical context**: `docs/CONTEXT.md`  
**Current auth anchor docs**: `docs/auth-domain-glossary.md`, `docs/adr/0001-auth-identity-resolution-and-capability-model.md`, `docs/hrd01-auth-elevation-hardening-review-2026-05-22.md`  
**Reason**: Useful background on legacy/canonical mapping, but no longer primary truth by itself.

## Status

This note captures the current role-elevation rules used by the auth/session layer and why some legacy flags still map into broader canonical roles.

## What "role elevation" means here

EasyLink now treats **canonical roles** as the policy layer:

- `admin`
- `group_leader`
- `employee`

Legacy flags and labels still exist, but they are compatibility inputs, not the final policy source.

## Current elevation rules

### Legacy PIN session path

`lib/auth-session.ts` still supports `tb_user` + `tb_user_group_access` for older accounts.

Elevation happens like this:

- `privilege >= 4` or `is_admin` becomes `admin`
- `is_leader`, `is_hr`, or `can_schedule` becomes `group_leader`
- everything else falls back to `employee`

Group access rows are then converted into `groups[]` capability entries:

- `can_schedule`
- `can_dashboard`
- `is_leader`

### NIP session path

`createAuthContextByNip()` reads:

- `tb_karyawan_auth`
- `tb_karyawan_roles`

It derives:

- `is_admin` from `role_key === 'admin'`
- `is_leader` from `role_key === 'group_leader'`
- `is_hr` from `role_key === 'hr'`

Then it loads group metadata for leader roles so the session can carry the allowed group scope.

## Practical interpretation

- `admin` is the only role that can use machine control and scanlog sync APIs.
- authenticated non-admin users can read machine health summary via `GET /api/machine/status`.
- `group_leader` is the elevated non-admin role for schedule and attendance note workflows.
- `employee` is the baseline role, but it can still inherit dashboard-like visibility through legacy `can_dashboard` scope.

## Why this matters

The app still has mixed legacy and canonical checks.
That means a user can look like a "viewer" or "scheduler" in old data, but the app should reason about them as `employee` or `group_leader` when making access decisions.

## Source anchors

- `lib/auth-session.ts`
- `lib/domain/employee-auth-model.ts`
- `lib/authz/authorization-adapter.ts`
