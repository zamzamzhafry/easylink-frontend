# ADR-0001: Auth Identity Resolution and Capability Model

## Status
Accepted

## Date
2026-05-22

## Context

EasyLink currently rebuilds effective auth state from multiple identity sources:

- account-based auth records
- employee NIP auth records
- legacy PIN-backed auth records

The app also mixes:

- canonical roles (`admin`, `group_leader`, `employee`)
- compatibility roles (`hr`, `scheduler`, `viewer`, legacy privilege states)
- capability flags (`can_schedule`, `can_dashboard`, group-scoped access)

Recent `HRD01` incident exposed several architectural problems:

1. direct SQL role edits can change effective privileges mid-session
2. a user may exist across multiple identity lanes with inconsistent authority data
3. admin promotion unlocks a broad set of unrelated UI/API surfaces at once
4. the system lacks one formal document that defines how identity resolution and capability-driven authorization should behave

The repo already contains useful but partial guidance in:

- `docs/learning/role-capability-matrix.md`
- `docs/agent-context/session-handoff-2026-04-19-machine-role-elevation.md`
- `docs/hrd01-auth-elevation-hardening-review-2026-05-22.md`

This ADR formalizes the direction so later implementation work can harden the auth model without rewriting everything at once.

## Decision

### 1. Canonical policy language stays coarse

EasyLink will keep these canonical roles as the stable policy layer:

- `admin`
- `group_leader`
- `employee`

Compatibility labels and legacy role inputs may still exist during migration, but they are not the final policy language.

### 2. Authorization behavior is capability-driven

Canonical roles alone are not enough to express business behavior. Effective authorization decisions will be driven by:

- canonical role membership
- explicit capabilities
- explicit group scope where required

This means future hardening should prefer action-focused capability checks over proliferating new canonical roles.

### 3. Identity resolution must be explicit and typed

Active auth handling must prefer explicit subject typing over ambiguous lookup waterfalls.

Current effective identity lanes are:

- `account`
- `employee_nip`
- `legacy_pin`

The system should treat subject type as first-class auth metadata so the server knows which lane it is resolving through.

### 4. Mixed identity records must not silently disagree

If multiple records represent the same human, the system must move toward explicit alignment instead of silent fallback behavior.

Hardening work should detect and surface:

- identity collisions
- identity mismatches
- conflicting admin vs scoped-elevated results

When ambiguity exists, policy should trend toward safe restriction and operator visibility rather than silent privilege escalation.

### 5. Group scope remains required for scoped elevated access

Non-global elevated access must remain scoped by explicit group access.

Current direction:

- `admin` remains global
- `hr` remains compatibility input, not final canonical role
- scoped elevated flows should carry explicit group scope instead of being promoted to admin as workaround

### 6. Direct SQL role mutation is not normal workflow

Changing auth-related rows directly in SQL is considered break-glass behavior.

Normal privilege-changing operations should move toward a controlled mutation workflow that:

- updates linked identity records consistently
- records audit detail
- defines session refresh or invalidation behavior

### 7. Legacy PIN fallback is transitional

Legacy PIN fallback may remain temporarily for compatibility, but it is a migration-sensitive path and should not be treated as the preferred authority source for modern privilege management.

Future hardening should reduce its ambiguity, add audit visibility, and define an exit path.

## Consequences

### Positive

- Shared language for auth hardening work
- Clear distinction between coarse roles and precise capabilities
- Better foundation for scoped elevated permissions without repeated admin promotion
- Safer handling of multi-lane identity ambiguity
- Better fit for staged refactor instead of one-shot rewrite

### Negative / Trade-offs

- Short-term complexity remains because compatibility logic still exists
- Hardening will require documentation, audits, and migration steps before code cleanup is complete
- Controlled mutation workflows and session invalidation rules add operational work
- Some current convenience of direct SQL edits will be intentionally reduced

### Implementation implications

Follow-up implementation should prioritize:

1. glossary-backed terminology alignment
2. explicit subject-type handling
3. collision and mismatch detection
4. controlled role-change workflow
5. staged capability cleanup for scoped elevated roles
6. legacy fallback tightening

## References

- `docs/auth-domain-glossary.md`
- `docs/learning/role-capability-matrix.md`
- `docs/agent-context/session-handoff-2026-04-19-machine-role-elevation.md`
- `docs/hrd01-auth-elevation-hardening-review-2026-05-22.md`
- `lib/auth-session.ts`
- `lib/authz/authorization-adapter.ts`
