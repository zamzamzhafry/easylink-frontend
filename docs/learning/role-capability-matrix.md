# Canonical 3-Tier Role-Capability Matrix

## Canonical role taxonomy (single source of truth)

Only these canonical roles are valid for policy decisions:

- `admin`
- `group_leader`
- `employee`

Code anchors:

- `lib/domain/employee-auth-model.ts`
  - `canonicalEmployeeRoleSchema`
  - `LEGACY_EMPLOYEE_ROLE_TO_CANONICAL_ROLE`
  - `toCanonicalEmployeeRole`, `toCanonicalEmployeeRoles`
- `lib/auth-session.ts`
  - `LEGACY_AUTH_FLAG_TO_CANONICAL_ROLE`
  - `mapLegacyRoleLabelToCanonicalRole`
  - `getCanonicalRoleFromLegacyAuthFlags`, `getCanonicalRolesFromLegacyAuth`

---

## Capability summary by canonical role

| Capability surface                                    | admin | group_leader | employee |
| ----------------------------------------------------- | ----- | ------------ | -------- |
| Authenticated app shell (`/api/auth/me`)              | ✅    | ✅           | ✅       |
| Schedule read (`GET /api/schedule`)                   | ✅    | ✅           | ❌       |
| Schedule write (`POST /api/schedule`)                 | ✅    | ✅           | ❌       |
| Attendance read (`GET /api/attendance`)               | ✅    | ✅           | ✅\*     |
| Attendance note write (`POST /api/attendance`)        | ✅    | ✅           | ❌       |
| Attendance review read (`GET /api/attendance/review`) | ✅    | ✅           | ✅\*     |
| Attendance raw/review mutation                        | ✅    | ❌           | ❌       |
| Performance dashboard API (`GET /api/performance`)    | ✅    | ✅           | ✅\*     |
| Users/Groups/Shifts admin CRUD                        | ✅    | ❌           | ❌       |
| Scanlog + machine control APIs                        | ✅    | ❌           | ❌       |
| Schedule revision approve/reject                      | ✅    | ✅\*\*       | ❌       |

Notes:

- `*` access depends on legacy capability flags (`can_dashboard` / `can_schedule`) and group scope checks.
- `**` currently granted via legacy `is_hr` compatibility alias (mapped to canonical `group_leader`).

---

## Protected route matrix (UI surfaces)

Baseline auth gate: all non-login pages are session-protected by `components/app-shell.jsx` (`/api/auth/me` redirect to `/login` on unauthenticated requests).

Route-specific visibility/effective protection:

| UI route             | Current gate source                                  | admin | group_leader | employee |
| -------------------- | ---------------------------------------------------- | ----- | ------------ | -------- |
| `/`                  | Sidebar `auth: all`; server page redirects non-admin | ✅    | ✅\*         | ✅\*     |
| `/attendance`        | Sidebar `auth: member`                               | ✅    | ✅           | ✅       |
| `/attendance/review` | Sidebar `auth: member`                               | ✅    | ✅           | ✅       |
| `/schedule`          | Sidebar `auth: schedule`                             | ✅    | ✅           | ❌       |
| `/performance`       | Sidebar `auth: dashboard`                            | ✅    | ✅           | ✅       |
| `/employees`         | Sidebar `auth: admin`                                | ✅    | ❌           | ❌       |
| `/employees/[id]`    | Deep-link route; effective access via profile API    | ✅    | ✅\*         | ✅\*     |
| `/groups`            | Sidebar `auth: admin`                                | ✅    | ❌           | ❌       |
| `/shifts`            | Sidebar `auth: admin`                                | ✅    | ❌           | ❌       |
| `/users`             | Sidebar `auth: admin`                                | ✅    | ❌           | ❌       |
| `/scanlog`           | Sidebar `auth: admin`                                | ✅    | ❌           | ❌       |
| `/machine`           | Sidebar `auth: admin`                                | ✅    | ❌           | ❌       |
| `/admin/migrate`     | Page available after login; action API is admin-only | ✅    | ❌           | ❌       |

Notes:

- `*` non-admin users are redirected to `/attendance/review` from `/`; access is compatibility behavior, not canonical admin dashboard privilege.

---

## Protected API matrix (all currently guarded endpoints)

The following endpoint set covers every route handler currently performing session/role checks (`getAuthContextFromCookies` and guard predicates):

| API endpoint                                | Guard expression (current implementation)                | admin | group_leader | employee |
| ------------------------------------------- | -------------------------------------------------------- | ----- | ------------ | -------- |
| `GET /api/auth/me`                          | `auth required`                                          | ✅    | ✅           | ✅       |
| `GET /api/attendance`                       | `canAccessAttendance(auth)`                              | ✅    | ✅           | ✅\*     |
| `POST /api/attendance`                      | `canManageAttendanceNotes(auth)`                         | ✅    | ✅           | ❌       |
| `GET /api/attendance/review`                | `canAccessAttendance(auth)`                              | ✅    | ✅           | ✅\*     |
| `POST /api/attendance/review`               | `canAccessRawAttendance(auth)`                           | ✅    | ❌           | ❌       |
| `GET /api/attendance/raw`                   | `canAccessRawAttendance(auth)`                           | ✅    | ❌           | ❌       |
| `POST /api/admin/migrate-scanlog`           | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `GET /api/employees/[id]/profile`           | `is_admin OR self OR isAllowedGroup(schedule/dashboard)` | ✅    | ✅\*         | ✅\*     |
| `GET /api/groups`                           | `requireAdmin()`                                         | ✅    | ❌           | ❌       |
| `POST /api/groups`                          | `requireAdmin()`                                         | ✅    | ❌           | ❌       |
| `GET /api/machine`                          | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `POST /api/machine`                         | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `GET /api/performance`                      | `auth.is_admin OR auth.can_dashboard`                    | ✅    | ✅           | ✅\*     |
| `GET /api/scanlog`                          | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `GET /api/scanlog/stream`                   | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `GET /api/scanlog/sync`                     | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `POST /api/scanlog/sync`                    | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `GET /api/schedule`                         | `ensureScheduleView()` (`is_admin OR can_schedule`)      | ✅    | ✅           | ❌       |
| `POST /api/schedule`                        | `ensureScheduleEdit()` (`is_admin OR is_leader`)         | ✅    | ✅           | ❌       |
| `GET /api/schedule-revisions`               | `auth required`; non-admin/non-hr group-scoped           | ✅    | ✅           | ✅       |
| `POST /api/schedule-revisions`              | `auth required`                                          | ✅    | ✅           | ✅       |
| `POST /api/schedule-revisions/[id]/approve` | `auth.is_admin OR auth.is_hr`                            | ✅    | ✅\*\*       | ❌       |
| `POST /api/schedule-revisions/[id]/reject`  | `auth.is_admin OR auth.is_hr`                            | ✅    | ✅\*\*       | ❌       |
| `GET /api/shifts`                           | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `POST /api/shifts`                          | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `PUT /api/shifts/[id]`                      | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `DELETE /api/shifts/[id]`                   | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `GET /api/users`                            | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `POST /api/users`                           | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `PUT /api/users`                            | `auth.is_admin`                                          | ✅    | ❌           | ❌       |
| `DELETE /api/users`                         | `auth.is_admin`                                          | ✅    | ❌           | ❌       |

Endpoints intentionally excluded from this protected matrix because they currently have no auth guard: `/api/auth/login`, `/api/auth/logout`, `/api/config`, `/api/holidays`, `/api/employees`, `/api/employees/[id]`, `/api/employees/users`.

---

## Legacy labels/flags → canonical mapping (with deprecation)

### Legacy role labels

| Legacy label   | Canonical role | Deprecation status                             |
| -------------- | -------------- | ---------------------------------------------- |
| `admin`        | `admin`        | Keep                                           |
| `group_leader` | `group_leader` | Keep                                           |
| `employee`     | `employee`     | Keep                                           |
| `leader`       | `group_leader` | Deprecated alias (remove after caller cutover) |
| `scheduler`    | `group_leader` | Deprecated alias (remove after caller cutover) |
| `viewer`       | `employee`     | Deprecated alias (remove after caller cutover) |
| `hr`           | `group_leader` | Temporary compatibility alias (highest risk)   |

### Legacy auth/session flags

| Legacy source / flag     | Canonical interpretation | Deprecation note                                             |
| ------------------------ | ------------------------ | ------------------------------------------------------------ |
| `is_admin === true`      | `admin`                  | Keep until all guards consume canonical roles directly       |
| `privilege >= 4`         | `admin`                  | Legacy numeric fallback; remove after PIN-path retirement    |
| `is_leader === true`     | `group_leader`           | Compatibility bridge for older policies                      |
| `is_hr === true`         | `group_leader`           | Temporary alias used by schedule revision approval endpoints |
| `can_schedule === true`  | `group_leader` scope     | Legacy capability bridge; should become explicit policy node |
| `can_dashboard === true` | `employee` baseline      | Legacy capability bridge; should become explicit policy node |
| none of the above        | `employee`               | Safe default                                                 |

---

## Ambiguity closure

- Active policy artifacts still reference legacy tokens (`privilege`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`).
- Every legacy token above now has an explicit canonical interpretation in this matrix.
- **Unresolved role ambiguity: none.**
