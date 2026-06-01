# Auth Domain Glossary

**Date**: 2026-05-22  
**Scope**: Shared terminology for EasyLink authentication, authorization, role elevation, and hardening work.  
**Status**: Working glossary for current auth hardening phase.

---

## Subject

Identity token carried by the `easylink_session` cookie and used to rebuild auth context on the server. In this repo, a subject may point to an account login ID, employee NIP, or legacy PIN-backed identity.

## Subject Type

Explicit classification of which identity lane a subject belongs to. Current effective values are:

- `account`
- `employee_nip`
- `legacy_pin`

Subject type determines which server-side lookup path should rebuild auth context.

## Identity Lane

Concrete auth reconstruction path used by `getAuthContextFromCookies()`. Different lanes read different tables and derive permissions differently. Current lanes are account, employee NIP, and legacy PIN.

## Session Payload

Signed cookie payload stored in `easylink_session`. It identifies the subject and expiry, but should not be treated as the source of truth for role or capability decisions. Effective auth is rebuilt from database state.

## Auth Context

Normalized server-side authorization object returned by `getAuthContextFromCookies()` and exposed through `/api/auth/me`. It includes identity metadata, capability flags, canonical roles, group scope, and compatibility fields used by legacy parts of the app.

## Auth Source of Truth

Database rows and derived policy rules that determine the effective auth context for a user at request time. The session cookie identifies the subject, but the effective authorization result comes from server-side lookups.

## Canonical Role

Stable policy-facing role used for authorization language across the app. Current canonical roles are:

- `admin`
- `group_leader`
- `employee`

Canonical roles should stay coarse and predictable.

## Compatibility Role

Legacy role label or source-specific role that still exists for migration compatibility but should not be treated as the final policy language. Examples include `hr`, `scheduler`, `viewer`, and older privilege-based role shapes.

## Capability

Behavior-oriented permission signal used to decide what a user can do beyond coarse canonical role membership. Examples include:

- `can_schedule`
- `can_dashboard`
- group-scoped access entries

Capabilities express allowed actions and visibility more precisely than canonical roles alone.

## Global Role

Role that bypasses group scoping and can operate across all groups by policy. Current examples include `admin` and `hr` in the account-based role compatibility model.

## Scoped Role

Role that requires explicit group membership or derived allowed-group access to operate safely. Current examples include `scheduler` and `viewer` in the account-based compatibility model.

## Group Scope

Set of groups a user is allowed to access for scoped actions. Group scope may be stored directly, derived from linked tables, or computed from compatibility rules depending on identity lane.

## Allowed Group IDs

Effective set of group IDs returned by authorization helpers for a given capability check. `null` means unrestricted access by policy; empty list means no allowed scoped access.

## Role Elevation

Change that increases a user’s effective authorization level, especially any transition that results in `is_admin = true` or broad access expansion across admin-only routes and UI surfaces.

## Admin Surface

Any route, component, page, or operational function that becomes available only when the effective auth context is admin-level. In this repo, admin surface expansion includes user CRUD, employee management, machine operations, scanlog operations, and admin shell widgets.

## Role Drift

Condition where different role sources, compatibility flags, or identity lanes describe the same human differently. Role drift makes behavior inconsistent and complicates debugging.

## Identity Collision

Condition where the same raw identifier can resolve through more than one identity lane or matches more than one record class. Example: a `login_id` that also matches a NIP-like or PIN-like identifier.

## Identity Mismatch

Condition where multiple records believed to represent the same human produce conflicting authorization results. Example: account path says admin while employee-role path says scoped elevated user.

## Legacy PIN Fallback

Compatibility auth path that rebuilds auth from legacy `tb_user` and related group-access rows when newer identity lanes do not resolve. This path should be treated as migration-sensitive and higher-risk for ambiguity.

## Hardening

Planned changes that reduce ambiguity, remove unsafe operator workflows, strengthen auditability, and make authorization outcomes consistent and reviewable without requiring a full rewrite.

## Controlled Role Mutation

Approved application or operational path for changing a user’s effective role state. A controlled mutation should update linked identity records consistently, leave an audit trail, and apply a clear session-refresh or invalidation policy.

## Forced Session Refresh

Required action after privilege-changing writes so a user does not continue using stale client or server assumptions. Depending on policy, this may mean explicit logout, cookie replacement, or guaranteed `/api/auth/me` refresh plus route refresh.

## Break-Glass SQL Change

Direct SQL modification to auth-related tables performed outside the controlled role-mutation workflow. This should be treated as exceptional because it can bypass auditability, leave identity lanes inconsistent, and change effective access mid-session.
