# Service Extraction Roadmap

**Date**: 2026-06-04  
**Status**: Guidance / planning only  
**Scope**: Phased roadmap for internal modularization first, then safe service extraction.

---

## 1. Goal

Extract services only after the app has:

- stable auth semantics
- explicit domain ownership
- internal modular-monolith boundaries
- route contracts worth preserving

This roadmap is intentionally conservative.

---

## 2. Principle

### Modular monolith first

Do this before any service split:

- isolate route ownership by domain
- create service layer per domain
- isolate repositories and DTOs
- centralize policy checks
- reduce mixed transaction orchestration in route handlers

### Extract only when one of these is true

- scaling need differs materially
- integration/runtime model differs materially
- data ownership is clear
- auth contract is already stable

---

## 3. Extraction Order

### Phase 1 — Identity & Access

Owns:

- login
- logout
- session rebuild
- identity resolution
- role/scope resolution
- authorization snapshot

Why first:

- every other domain depends on it
- already close to central boundary
- required for later service auth contracts

### Phase 2 — Machine Gateway or Scanlog Pipeline

#### Machine Gateway
Owns:

- device status
- device actions
- sync jobs
- SDK bridge behavior

Why early:

- integration/runtime shape differs from HR/business logic
- clear infra boundary

#### Scanlog Pipeline
Owns:

- ingest
- sync
- batch handling
- ledger/status
- canonical event write

Why early:

- event/batch pipeline is already service-shaped
- operational scaling differs from UI-driven CRUD

### Phase 3 — Scheduling

Owns:

- shifts
- schedules
- revisions
- approvals
- summaries

Why mid-phase:

- depends on stable auth and workforce references
- domain is coherent enough after policy cleanup

### Phase 4 — Workforce Directory

Owns:

- employees
- groups
- memberships
- employee profile read model
- identity linkage metadata

Why later:

- central reference domain
- heavily entangled with auth and users aggregate today

### Phase 5 — Attendance & Reporting

Owns:

- attendance read models
- correction/review flows
- reporting
- exports

Why later:

- read-model heavy
- often depends on schedule + workforce + scanlog + auth

### Phase 6 — Users Aggregate Rework

Do not extract `/api/users` early.

Instead:

- split internal orchestration first
- separate identity link concerns
- separate workforce write concerns
- separate machine mirror concerns
- keep one orchestration façade until transaction model is stable

---

## 4. Prerequisites by Phase

### Before Phase 1

- canonical role/scope model approved
- canonical auth schema approved
- migration plan agreed

### Before Phase 2

- auth/session contract stable
- service-to-service auth strategy decided
- machine/scanlog contracts documented

### Before Phase 3

- schedule DTOs stable
- schedule policy checks scope-based

### Before Phase 4

- employee/group DTOs stable
- canonical identity linkage stable
- `/api/users` internal split underway

### Before Phase 5

- schedule/workforce/scanlog read dependencies explicit
- reporting contracts documented

---

## 5. Anti-Patterns

Do not:

- extract many services in one release
- keep shared mutable authority logic in multiple services
- let reporting become first extracted service
- create service APIs before internal contracts stabilize
- extract `/api/users` before it is decomposed internally

---

## 6. Success Criteria

A domain is ready for extraction when:

- owner domain is explicit
- route contracts are documented
- internal service layer already exists
- policy checks are scope-based
- tables used by that domain are known and stable
- rollback path is clear

---

## 7. Recommended Milestones

### Milestone A

- auth schema added
- role/scope model documented
- route policy migration started

### Milestone B

- shell + core pages sliced on frontend
- backend modular-monolith ownership visible
- identity service extraction prep complete

### Milestone C

- identity extraction complete
- machine or scanlog extraction complete

### Milestone D

- scheduling extracted or fully modularized
- workforce stabilized
- users aggregate reduced in blast radius
