# Route Ownership Matrix

**Date**: 2026-06-04  
**Status**: Guidance / planning only  
**Scope**: Route-to-domain ownership map for modular-monolith refactoring and later service extraction.

---

## 1. Purpose

This document maps current `app/api/**` ownership to target bounded contexts.

Goal:

- make internal ownership explicit
- identify high-risk mixed routes
- define service extraction order
- reduce accidental cross-domain growth

---

## 2. Ownership Matrix

| Route / Route family | Current domain | Main deps | Target owner | Auth requirement | Extraction phase |
|---|---|---|---|---|---|
| `/api/auth/login` | identity | `lib/auth-session.ts`, `lib/password.ts`, auth tables | Identity & Access | `auth.session.manage` | 1 |
| `/api/auth/me` | identity | auth context rebuild | Identity & Access | `auth.session.read` | 1 |
| `/api/auth/logout` | identity | session clear | Identity & Access | `auth.session.manage` | 1 |
| `/api/users` | mixed aggregate | `auth_accounts`, `tb_karyawan_auth`, `tb_user`, `cs_*`, role/group tables | Workforce + Identity orchestration inside modular monolith first | `auth.identity.*`, `employee.*`, `group.*` | internal split first |
| `/api/employees` | workforce | `tb_karyawan`, `tb_karyawan_auth`, role bindings | Workforce Directory | `employee.read.any`, `employee.write.any` or group-scoped equivalent | 2 |
| `/api/employees/[id]` | workforce | employee core tables | Workforce Directory | same as above | 2 |
| `/api/employees/[id]/profile` | mixed read model | employee + group + schedule + scan summaries | Workforce Profile read model | mixed read scopes | 5 |
| `/api/employees/users` | bridge/read model | `tb_user` mirror | Workforce consuming Machine projection | read scopes only | 5 |
| `/api/groups` | workforce/org | `tb_group`, memberships | Workforce / Org Structure | `group.read.*`, `group.write.*` | 2 |
| `/api/schedule` | scheduling | schedule tables, employees, groups | Scheduling | `schedule.read.*`, `schedule.write.*` | 3 |
| `/api/schedule/quick-summaries` | scheduling read model | schedules + filters | Scheduling read model | `schedule.read.*` | 4 |
| `/api/shifts` | scheduling | shift tables | Scheduling | `schedule.write.*` | 3 |
| `/api/shifts/[id]` | scheduling | shift tables | Scheduling | `schedule.write.*` | 3 |
| `/api/schedule-revisions` | schedule governance | revision request tables | Scheduling Governance | `schedule.approve.*` | 4 |
| `/api/schedule-revisions/[id]/approve` | schedule governance | approval flow | Scheduling Governance | `schedule.approve.*` | 4 |
| `/api/schedule-revisions/[id]/reject` | schedule governance | rejection flow | Scheduling Governance | `schedule.approve.*` | 4 |
| `/api/scanlog` | scanlog read | canonical / legacy read source | Scanlog Pipeline | `scanlog.read.*` | 2/3 |
| `/api/scanlog/ingest` | scanlog ingest | hop-b pipeline | Scanlog Pipeline | `scanlog.sync.any` | 2 |
| `/api/scanlog/sync` | scanlog ingest | machine pull + pipeline write | Scanlog Pipeline | `scanlog.sync.any` | 2 |
| `/api/scanlog/stream` | scanlog read | event stream / read source | Scanlog Pipeline | `scanlog.read.*` | 3 |
| `/api/scanlog/hop-b-status` | scanlog ops | ingest ledger / status | Scanlog Pipeline | `scanlog.read.any` | 3 |
| `/api/machine` | machine ops | SDK bridge / gateway | Machine Gateway | `machine.write.any` | 2 |
| `/api/machine/status` | machine ops | device status | Machine Gateway | `machine.read.any` | 2 |
| `/api/machine/sync` | machine ops | queue / sync jobs | Machine Gateway | `machine.write.any` | 2 |
| attendance/report/performance APIs | reporting/read models | aggregates, exports, summaries | Attendance & Reporting | `attendance.*`, `report.*` | late |

---

## 3. Current Coupling Hotspots

### 3.1 `/api/users`

Highest-risk route.

Why:

- spans identity, employee, group, and machine mirror concerns
- writes across multiple tables
- likely requires transaction orchestration
- poor first target for service extraction

### 3.2 `/api/employees/[id]/profile`

Mixed read model.

Why:

- likely pulls from multiple domains
- better treated as composed read-model endpoint than core write owner

### 3.3 attendance/reporting surfaces

Why:

- read-model heavy
- tends to depend on schedule + employees + scanlog + groups
- better extracted after core write domains stabilize

---

## 4. Internal Modular-Monolith Split Guidance

Before microservices, each route family should use:

- route handler
- service layer
- repository/query helpers
- DTO mapper
- policy adapter

Recommended internal folder intent:

- identity
- workforce
- scheduling
- scanlog
- machine
- reporting

---

## 5. Service Extraction Order

1. Identity & Access
2. Machine Gateway or Scanlog Pipeline
3. Scheduling
4. Workforce Directory
5. Attendance & Reporting
6. `users` aggregate last

---

## 6. Contracts to Stabilize Before Extraction

### Identity & Access

- login request / response DTO
- session payload
- auth context / authorization snapshot
- scope list format

### Workforce Directory

- employee DTO
- group DTO
- group membership DTO
- employee profile read model

### Scheduling

- shift DTO
- schedule assignment DTO
- revision request DTO
- quick summary DTO

### Scanlog Pipeline

- ingest request DTO
- sync batch result DTO
- scanlog event DTO
- status / ledger DTO

### Machine Gateway

- device status DTO
- device action DTO
- sync job DTO
- machine user mirror DTO

---

## 7. Hard Rules

- Do not extract `/api/users` first.
- Do not let service boundaries depend on legacy booleans.
- Do not create service APIs before internal domain contracts are stable.
- Do not couple reporting extraction to unfinished auth migration.
