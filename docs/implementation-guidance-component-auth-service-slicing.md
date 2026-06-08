# Implementation Guidance — Component Slicing, Auth Scope Redesign, and Service Extraction

**Date**: 2026-06-04  
**Status**: Guidance / planning only  
**Scope**: Implementation guidance derived from architecture review findings. This document is intentionally prescriptive so future work can implement in stages without re-discovering the same decisions.

---

## 1. Purpose

This document translates recent review findings into an implementation guide for four linked tracks:

1. frontend component slicing
2. backend modularization before microservices
3. auth / role / scope redesign
4. database migration strategy for canonical identity + authorization

This is **not** a one-shot rewrite plan. It is a staged implementation guide.

---

## 2. Executive Guidance

### Do first

- stabilize auth semantics before broad service extraction
- move route authorization from boolean flags to scope checks
- split biggest frontend monoliths into domain containers + feature sections + hooks + mappers
- create modular-monolith backend boundaries before extracting services
- treat `tb_user` as legacy device/mirror data, not long-term policy source

### Do not do first

- do not split `/api/users` into its own service first
- do not extract many microservices at once
- do not preserve `viewer` as anything stronger than read-only in target model
- do not keep `tb_user.privilege` as long-term authority source
- do not keep `is_admin`, `is_hr`, `can_schedule`, `is_leader` as target authorization model

---

## 3. Main Findings

### 3.1 Auth model is overlapping and drift-prone

Current runtime authorization is rebuilt from multiple identity lanes:

- `auth_accounts`
- `tb_karyawan_auth`
- `tb_user`

Current authority also mixes:

- role labels
- boolean capability flags
- legacy privilege numbers
- group-scoped access rows

That creates:

- duplicate authority sources
- silent disagreement risk across identity lanes
- broad privilege expansion when one legacy field changes
- high difficulty for service extraction because every domain depends on auth semantics

### 3.2 Frontend has several page-sized monoliths

Highest-priority slicing targets:

- `components/app-shell.jsx`
- `app/schedule/page.jsx`
- `app/machine/page.jsx`
- `app/attendance/page.jsx`
- `app/users/page.jsx`

Common issues:

- UI rendering mixed with orchestration
- large state bags in page component
- authz mixed into page logic
- transformation / export / filters mixed into page container
- weak separation between domain data, derived view state, and presentation

### 3.3 Backend needs modular monolith boundaries before service extraction

Current service-shaped seams already exist around:

- auth/session
- machine integration
- scanlog ingestion pipeline

But some routes remain high-risk aggregates, especially:

- `app/api/users/route.js`
- employee profile / mixed read-model flows
- attendance/reporting read models

### 3.4 Microservice extraction is viable only after auth normalization

Best extraction order is:

1. Identity & Access
2. Machine Gateway or Scanlog Ingestion
3. Scheduling
4. Workforce Directory
5. Attendance / Reporting
6. leave `users` aggregate last

---

## 4. Frontend Implementation Guidance

### 4.1 Target slice pattern

Every large domain page should move toward this structure:

```text
<domain>/
  <Domain>PageContainer
  <Domain>Sections...
  use<Domain>Queries
  use<Domain>Actions
  <domain>Api
  <domain>Mappers
  <domain>Policy
  presentational components
```

### 4.2 Shell and auth boundary first

Start with `components/app-shell.jsx`.

Target slices:

- `AppShellFrame`
- `AppShellAuthGate`
- `AppShellNav`
- `AppShellThemeController`
- `AppShellRouteEffects`

Reason:

- global auth/session gate belongs in a narrow boundary
- sidebar/theme/locale should not stay coupled to route auth logic
- future scope-based nav gating will become simpler if shell auth is isolated first

### 4.3 Schedule page second

Split `app/schedule/page.jsx` into:

- page container
- tab/section components
- query hooks
- derived-data mappers
- schedule policy helpers
- export / import helpers

Reason:

- largest state sprawl
- multiple sub-products in one page
- good candidate for domain-first slicing

### 4.4 Machine page third

Split `app/machine/page.jsx` into:

- `MachineAdminPageContainer`
- `MachineStatusPanel`
- `MachineQueuePanel`
- `MachineSyncPanel`
- `MachineUsersPanel`
- `useMachineStatus`
- `useMachineQueue`
- `useMachineActions`
- `machineApi`

Reason:

- async orchestration mixed with UI
- route/service extraction later will need a clear client-side boundary too

### 4.5 Attendance and users follow after shell/schedule/machine

Attendance split should isolate:

- filters
- summaries
- notes
- export logic
- authz policy adapter

Users split should isolate:

- table/listing
- identity editor
- role/group binding UI
- machine mirror data handling
- mutation orchestration

### 4.6 Shared-state rule

Keep central:

- auth session
- nav state
- theme / locale
- permission evaluation

Keep feature-local:

- filter state
- modal state
- pagination state
- export state
- section-local tabs and view mode

---

## 5. Backend Modularization Guidance

### 5.1 Target modular-monolith domains

Before microservices, carve internal domains:

- Identity & Access
- Workforce Directory
- Scheduling
- Attendance
- Scanlog Pipeline
- Machine Gateway
- Reporting

Each domain should own:

- route handlers
- service layer
- repository/query helpers
- DTOs
- policy adapters

### 5.2 Route ownership target

#### Identity & Access
Own:

- `/api/auth/login`
- `/api/auth/me`
- `/api/auth/logout`

#### Workforce Directory
Own:

- `/api/employees`
- `/api/employees/[id]`
- `/api/groups`
- `/api/employees/[id]/profile`
- eventually workforce parts of `/api/users`

#### Scheduling
Own:

- `/api/schedule`
- `/api/shifts`
- `/api/shifts/[id]`
- `/api/schedule/quick-summaries`
- `/api/schedule-revisions/*`

#### Scanlog Pipeline
Own:

- `/api/scanlog`
- `/api/scanlog/ingest`
- `/api/scanlog/sync`
- `/api/scanlog/stream`
- `/api/scanlog/hop-b-status`

#### Machine Gateway
Own:

- `/api/machine`
- `/api/machine/status`
- `/api/machine/sync`

### 5.3 `/api/users` must be split internally before externalizing

`/api/users` currently spans multiple tables and responsibilities. Do **not** extract it directly to microservice boundary first.

Safe first move:

- split read model helpers
- split identity-link helpers
- split role/group binding helpers
- isolate transaction orchestration into one service module
- keep route as façade during transition

---

## 6. Target Auth / Role / Scope Model

### 6.1 Canonical target roles

Global roles:

- `super_admin`
- `hr_admin`
- `scheduler_admin`
- `viewer`
- `employee`
- `service_account`

Group roles:

- `group_owner`
- `group_leader`
- `group_scheduler`
- `group_viewer`
- `group_member`

### 6.2 Target scope families

Global scopes:

- `auth.session.*`
- `auth.identity.*`
- `employee.*.any`
- `group.*.any`
- `schedule.*.any`
- `attendance.*.any`
- `machine.*.any`
- `scanlog.*.any`
- `report.*.any`

Group scopes:

- `employee.read.group`
- `group.read.group`
- `schedule.read.group`
- `schedule.write.group`
- `schedule.approve.group`
- `attendance.read.group`
- `attendance.review.group`
- `scanlog.read.group`
- `report.read.group`

Self scopes:

- `profile.read.self`
- `attendance.read.self`
- `schedule.read.self`

### 6.3 Role behavior rules

- `super_admin` bypasses group filtering
- `viewer` is read-only in target model
- group roles are additive across assigned groups
- explicit scope checks replace boolean-based route decisions
- compatibility booleans remain transitional projection only

### 6.4 Compatibility mapping guidance

Map current sources as follows during migration:

- `auth_accounts.role_key='admin'` -> `super_admin`
- `auth_accounts.role_key='hr'` -> `hr_admin`
- `auth_accounts.role_key='scheduler'` -> `scheduler_admin` or `group_scheduler` after domain review
- `auth_accounts.role_key='viewer'` -> `viewer`
- `tb_user_group_access.is_leader=1` -> `group_leader`
- `tb_user_group_access.can_schedule=1` -> `group_scheduler` signal
- `tb_user.privilege>=4` -> temporary compatibility fallback only

---

## 7. Database Guidance

### 7.1 Keep legacy tables during migration

Legacy tables remain readable during transition:

- `auth_accounts`
- `auth_account_group_scope`
- `tb_karyawan_auth`
- `tb_karyawan_roles`
- `tb_user`
- `tb_user_group_access`

### 7.2 Add canonical tables

Canonical target tables:

- `auth_identities`
- `auth_subject_links`
- `auth_roles`
- `auth_scopes`
- `auth_role_scopes`
- `auth_identity_global_roles`
- `auth_identity_group_roles`
- optional `auth_scope_overrides`

### 7.3 Canonical DB principles

- one canonical login identity per principal
- one typed subject-link layer for legacy compatibility
- roles grant scopes through explicit mapping
- group scoping is stored explicitly, not inferred from booleans alone
- `tb_user` becomes mirror/device data, not authority source

---

## 8. Backend Authorization Guidance

### 8.1 Current pattern to retire gradually

Current pattern often does:

1. rebuild auth context
2. project booleans
3. compare local flags or group IDs
4. gate route

### 8.2 Target pattern

Target route flow should be:

1. parse session token
2. resolve canonical identity
3. resolve global roles, group roles, and scopes
4. call policy helper such as `requireScope(scope, groupId?)`
5. execute domain action

### 8.3 Policy adapter target

Introduce policy helpers by domain:

- `authPolicy`
- `employeePolicy`
- `groupPolicy`
- `schedulePolicy`
- `attendancePolicy`
- `scanlogPolicy`
- `machinePolicy`

Temporary compatibility layer may still project:

- `is_admin`
- `is_hr`
- `can_schedule`
- `is_leader`

But those should stop being the primary policy language.

---

## 9. Migration Guidance by Release

### Release 1 — schema add only

- add canonical auth tables
- no route behavior change
- no UI claim change
- prepare backfill script

### Release 2 — backfill and audit

- populate canonical tables from legacy sources
- compare canonical vs legacy outcomes
- log mismatches
- no traffic cutover yet

### Release 3 — canonical-first auth resolution

- canonical tables resolve first
- legacy fallback remains available
- login writes canonical metadata
- keep typed legacy subject support through subject-link map

### Release 4 — scope policy engine

- convert route checks from booleans to scope checks
- start with auth, users, groups, schedule
- keep compatibility projections where UI still depends on them

### Release 5 — frontend claim transition

- `/api/auth/me` exposes role/scope-centered claims
- nav and page gates move to scopes and group roles
- remove primary dependence on legacy booleans

### Release 6 — legacy authority shutdown

Stop using as authority source:

- `tb_user.privilege`
- `tb_user_group_access`
- legacy role meaning in `tb_karyawan_auth`

### Release 7 — service extraction

Recommended extraction order:

1. Identity & Access
2. Machine Gateway or Scanlog Pipeline
3. Scheduling
4. Workforce Directory
5. Attendance / Reporting
6. keep `users` aggregate internal until stable

---

## 10. Microservice Guidance

### 10.1 Recommended first extractions

Extract first only when internal boundaries are stable:

- Identity & Access
- Machine Gateway
- Scanlog Pipeline

### 10.2 Extract later

- Scheduling
- Workforce Directory
- Attendance / Reporting

### 10.3 Extract last

- `users` aggregate / orchestration workflow

Reason:

- highest coupling to identity, workforce, group roles, and legacy compatibility
- highest transactional blast radius

---

## 11. Implementation Order

Recommended order for actual engineering work:

1. document canonical auth role/scope decisions
2. add canonical auth tables and migration SQL
3. add dual-read auth resolver
4. add scope policy helpers in backend
5. convert route handlers domain by domain
6. split `components/app-shell.jsx`
7. split `app/schedule/page.jsx`
8. split `app/machine/page.jsx`
9. split `app/attendance/page.jsx`
10. split `app/users/page.jsx`
11. modularize `/api/users` internally
12. extract Identity service
13. extract Machine or Scanlog service

---

## 12. Obsidian / Graph Guidance

Use documentation and graph tools to keep implementation aligned:

- create one note per role, scope, route family, service boundary, and migration
- use Mermaid for auth flow, route ownership, ERD, and migration DAG
- keep MOCs for architecture, auth, DB, migrations, and services
- use graph view to spot orphan decisions and hidden coupling

Suggested first note set:

- `Role - super_admin`
- `Role - hr_admin`
- `Role - group_leader`
- `Scope - schedule.write.group`
- `Table - auth_identities`
- `Table - auth_subject_links`
- `Route - /api/users`
- `Service - Identity`
- `Service - Machine`
- `Service - Scanlog`
- `Migration - Canonical Auth Cutover`

---

## 13. Non-Negotiable Constraints During Implementation

- do not ship one-shot auth rewrite
- do not remove legacy compatibility without mismatch visibility first
- do not broaden `viewer` semantics beyond read-only
- do not let `tb_user` remain long-term policy source
- do not split `/api/users` into standalone service before internal decomposition
- do not start broad microservice extraction before auth normalization

---

## 14. Definition of Done for Future Implementation Work

A phase is complete only when:

- role and scope behavior is documented
- migration SQL exists and is reversible
- route auth behavior is covered by tests
- canonical and legacy auth outcomes can be compared during transition
- docs are updated with any auth/session/schema behavior change
- service extraction happens only after modular-monolith boundaries are stable
