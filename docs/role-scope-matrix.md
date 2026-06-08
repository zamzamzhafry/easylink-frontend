# Role and Scope Matrix

**Date**: 2026-06-04  
**Status**: Guidance / planning only  
**Scope**: Canonical target role model, scope catalog, compatibility mapping, and implementation notes for future auth migration work.

---

## 1. Purpose

This document defines the target authorization language for EasyLink.

It exists to replace mixed permission semantics currently spread across:

- `auth_accounts.role_key`
- `tb_karyawan_roles.role_key`
- `tb_user.privilege`
- `tb_user_group_access`
- projected booleans such as `is_admin`, `is_hr`, `can_schedule`, `is_leader`

---

## 2. Role Model

### 2.1 Global roles

| Role | Meaning | Notes |
|---|---|---|
| `super_admin` | System owner with full access across all domains and groups | Break-glass / platform-level authority |
| `hr_admin` | HR and people operations administrator | Employee, group, attendance, reporting authority |
| `scheduler_admin` | Global schedule operations administrator | Schedule and shift authority across all groups |
| `viewer` | Global read-only observer | Must not imply mutation |
| `employee` | Default human principal | Self-service baseline only |
| `service_account` | Non-human principal | Explicitly scoped automation only |

### 2.2 Group roles

| Role | Meaning | Boundary |
|---|---|---|
| `group_owner` | Owns assigned groups | One or more groups |
| `group_leader` | Leads assigned groups | One or more groups |
| `group_scheduler` | Manages schedule for assigned groups | One or more groups |
| `group_viewer` | Read-only access to assigned groups | One or more groups |
| `group_member` | Basic membership association | One or more groups |

---

## 3. Scope Catalog

### 3.1 Global scopes

- `auth.session.read`
- `auth.session.manage`
- `auth.identity.read.any`
- `auth.identity.write.any`
- `employee.read.any`
- `employee.write.any`
- `group.read.any`
- `group.write.any`
- `schedule.read.any`
- `schedule.write.any`
- `schedule.approve.any`
- `attendance.read.any`
- `attendance.review.any`
- `machine.read.any`
- `machine.write.any`
- `scanlog.read.any`
- `scanlog.sync.any`
- `report.read.any`
- `report.export.any`

### 3.2 Group scopes

- `employee.read.group`
- `group.read.group`
- `schedule.read.group`
- `schedule.write.group`
- `schedule.approve.group`
- `attendance.read.group`
- `attendance.review.group`
- `scanlog.read.group`
- `report.read.group`

### 3.3 Self scopes

- `profile.read.self`
- `attendance.read.self`
- `schedule.read.self`

---

## 4. Role-to-Scope Matrix

### 4.1 Global roles

| Role | Scopes |
|---|---|
| `super_admin` | all scopes |
| `hr_admin` | `auth.session.read`, `employee.read.any`, `employee.write.any`, `group.read.any`, `group.write.any`, `attendance.read.any`, `attendance.review.any`, `report.read.any`, `report.export.any` |
| `scheduler_admin` | `auth.session.read`, `group.read.any`, `schedule.read.any`, `schedule.write.any`, `schedule.approve.any`, `report.read.any` |
| `viewer` | `auth.session.read`, `group.read.any`, `schedule.read.any`, `attendance.read.any`, `scanlog.read.any`, `report.read.any` |
| `employee` | `auth.session.read`, `profile.read.self`, `attendance.read.self`, `schedule.read.self` |
| `service_account` | only explicitly assigned scopes |

### 4.2 Group roles

| Role | Scopes |
|---|---|
| `group_owner` | `group.read.group`, `employee.read.group`, `schedule.read.group`, `schedule.write.group`, `schedule.approve.group`, `attendance.read.group`, `attendance.review.group`, `report.read.group` |
| `group_leader` | `group.read.group`, `employee.read.group`, `schedule.read.group`, `attendance.read.group`, `attendance.review.group`, `report.read.group` |
| `group_scheduler` | `group.read.group`, `employee.read.group`, `schedule.read.group`, `schedule.write.group`, `report.read.group` |
| `group_viewer` | `group.read.group`, `schedule.read.group`, `attendance.read.group`, `scanlog.read.group`, `report.read.group` |
| `group_member` | none by default beyond baseline membership unless product requires narrower read scopes |

---

## 5. Behavior Rules

- Global role scopes union with group role scopes.
- Group roles are additive across all assigned groups.
- `super_admin` bypasses group filtering.
- `viewer` must remain read-only.
- Explicit deny beats allow if override tables are introduced later.
- Legacy booleans are transitional compatibility projections only.

---

## 6. Compatibility Mapping

| Current source | Target mapping |
|---|---|
| `auth_accounts.role_key='admin'` | `super_admin` |
| `auth_accounts.role_key='hr'` | `hr_admin` |
| `auth_accounts.role_key='scheduler'` | `scheduler_admin` or `group_scheduler` depending on business decision |
| `auth_accounts.role_key='viewer'` | `viewer` |
| `tb_user_group_access.is_leader=1` | `group_leader` |
| `tb_user_group_access.can_schedule=1` | `group_scheduler` scope signal |
| `tb_user.privilege>=4` | temporary compatibility fallback to `super_admin` only during migration |
| `tb_karyawan_roles.role_key` | canonical source candidate for group or employee role binding |

---

## 7. Open Decisions

### 7.1 Scheduler semantics

Must choose one:

1. `scheduler_admin` = global schedule authority only
2. `group_scheduler` = per-group schedule authority only
3. dual model = both roles exist and are assigned separately

Recommended: **dual model**.

### 7.2 Group owner role

Must choose one:

1. keep `group_owner` as stronger governance role
2. collapse `group_owner` into `group_leader`

Recommended: **collapse unless product has true group-admin workflows**.

---

## 8. Implementation Guidance

- Do not expose new scopes only in UI first; backend policy checks must lead.
- Convert route checks to `requireScope(...)` domain by domain.
- Keep compatibility booleans in `/api/auth/me` only while UI transitions.
- Do not preserve accidental legacy privilege broadening in target model.
