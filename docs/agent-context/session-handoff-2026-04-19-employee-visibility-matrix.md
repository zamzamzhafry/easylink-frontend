# Session Handoff - Employee-Side Visibility Matrix

## Status

This is the current non-admin visibility map for the attendance/performance area.
It is meant to be read together with `docs/learning/role-capability-matrix.md`, but it focuses on what employees actually see in the UI.

## Sidebar visibility

| Surface                                | Admin | Group leader / scheduler | Employee with dashboard scope | Notes                                                                                           |
| -------------------------------------- | ----- | ------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Dashboard `/`                          | Yes   | Yes                      | Yes                           | Non-admin users are redirected to attendance review from the dashboard entry point.             |
| Schedule `/schedule`                   | Yes   | Yes                      | No                            | Requires schedule capability.                                                                   |
| Attendance `/attendance`               | Yes   | Yes                      | Yes                           | Requires member access or equivalent attendance scope.                                          |
| Attendance review `/attendance/review` | Yes   | Yes                      | Yes                           | Listed as a planning/attendance surface, not raw admin tooling.                                 |
| Performance `/performance`             | Yes   | Yes                      | Yes\*                         | Depends on `can_dashboard`.                                                                     |
| Employees `/employees`                 | Yes   | No                       | No                            | Admin only.                                                                                     |
| Groups `/groups`                       | Yes   | No                       | No                            | Admin only.                                                                                     |
| Shifts `/shifts`                       | Yes   | No                       | No                            | Admin only.                                                                                     |
| Users `/users`                         | Yes   | No                       | No                            | Admin only.                                                                                     |
| Scanlog `/scanlog`                     | Yes   | No                       | No                            | Admin only.                                                                                     |
| Machine `/machine`                     | Yes   | No                       | No                            | Sidebar entry is admin-only, but non-admin direct visits can still see connection summary only. |

## What the employee-facing path feels like

For a non-admin with dashboard access, the practical journey is:

1. See the dashboard shell only as a compatibility landing page.
2. Use Attendance for daily summaries and notes.
3. Use Attendance Review when the app routes there or when a review workflow is needed.
4. Use Performance if the account also has dashboard capability.

## Access rules behind the UI

- `canAccessAttendance(auth)` allows `admin`, `group_leader`, and employee-style accounts with attendance/dashboard scope.
- `canManageAttendanceNotes(auth)` is `admin` or `group_leader` only.
- `canAccessRawAttendance(auth)` is admin only.
- `GET /api/performance` is `admin` or `can_dashboard`.
- `GET /api/machine` and `POST /api/machine` remain admin only.
- `GET /api/machine/status` is authenticated-user access for non-sensitive health summary.

## Employee-side takeaways

- Attendance is the main employee-visible work surface.
- Performance is a secondary surface that exists only when dashboard access is granted.
- Machine control, scanlog sync, and raw review mutations are intentionally hidden from employees.

## Source anchors

- `lib/authz/authorization-adapter.ts`
- `components/sidebar.jsx`
- `app/page.jsx`
- `app/attendance/page.jsx`
- `app/attendance/review/page.jsx`
- `app/performance/page.jsx`
