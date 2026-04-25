# EasyLink App Current State Graph

Last updated: 2026-04-24

This graph reflects the current workspace state, including local uncommitted `ops` recovery files.

## System Overview

```mermaid
flowchart LR
  browser["Browser"]
  shell["AppShell<br/>components/app-shell.jsx"]
  leftNav["Left Sidebar<br/>components/sidebar.jsx"]
  rightOps["Admin Right Ops Sidebar<br/>components/right-ops-sidebar.jsx"]
  pages["App Pages<br/>app/**/page.jsx"]
  api["Next.js API Routes<br/>app/api/**/route.js"]
  auth["Auth Session<br/>lib/auth-session.ts"]
  db["MySQL Pool<br/>lib/db.js"]
  sdk["Machine SDK Adapter<br/>lib/easylink-sdk-client.js"]
  ops["Ops Recovery<br/>lib/ops-recovery.js"]
  mysql[("MySQL<br/>legacy + compatibility schema")]
  machine["EasyLink / Fingerspot Device<br/>Windows SDK or fingerspot lib"]
  taskScheduler["Windows Task Scheduler<br/>EasyLink-Recovery"]
  healthFile["Ops Health Summary JSON<br/>optional file path"]

  browser --> shell
  shell --> leftNav
  shell --> pages
  shell -->|admin only| rightOps
  pages --> api
  rightOps --> api
  api --> auth
  auth --> db
  api --> db
  api --> sdk
  api --> ops
  db --> mysql
  sdk --> machine
  ops --> taskScheduler
  ops --> healthFile
```

## UI Route Map

```mermaid
flowchart TB
  shell["Authenticated AppShell"]
  login["/login"]
  dashboard["/<br/>Dashboard"]
  attendance["/attendance"]
  review["/attendance/review"]
  schedule["/schedule"]
  performance["/performance"]
  report["/report"]
  employees["/employees"]
  employeeDetail["/employees/[id]"]
  groups["/groups"]
  shifts["/shifts"]
  users["/users"]
  scanlog["/scanlog"]
  machine["/machine"]
  adminMigrate["/admin/migrate"]

  login -->|POST /api/auth/login| shell
  shell --> dashboard
  shell --> attendance
  shell --> review
  shell --> schedule
  shell --> performance
  shell --> report
  shell --> employees
  employees --> employeeDetail
  shell --> groups
  shell --> shifts
  shell --> users
  shell --> scanlog
  shell --> machine
  shell --> adminMigrate

  classDef admin fill:#3f1d1d,stroke:#f87171,color:#fff
  classDef member fill:#17331f,stroke:#4ade80,color:#fff
  class employees,groups,shifts,users,scanlog,machine,adminMigrate admin
  class attendance,review,schedule,performance,report member
```

## API Topology

```mermaid
flowchart TB
  authApi["Auth APIs<br/>/api/auth/login<br/>/api/auth/logout<br/>/api/auth/me"]
  peopleApi["People/Master APIs<br/>/api/employees<br/>/api/employees/[id]<br/>/api/employees/[id]/profile<br/>/api/employees/users<br/>/api/groups<br/>/api/shifts<br/>/api/shifts/[id]<br/>/api/users"]
  attendanceApi["Attendance APIs<br/>/api/attendance<br/>/api/attendance/raw<br/>/api/attendance/review<br/>/api/performance<br/>/api/report"]
  scheduleApi["Schedule APIs<br/>/api/schedule<br/>/api/schedule/quick-summaries<br/>/api/schedule-revisions<br/>/api/schedule-revisions/[id]/approve<br/>/api/schedule-revisions/[id]/reject"]
  machineApi["Machine APIs<br/>/api/machine<br/>/api/machine/status<br/>/api/scanlog<br/>/api/scanlog/sync<br/>/api/scanlog/stream"]
  adminApi["Admin/Ops APIs<br/>/api/admin/migrate-scanlog<br/>/api/ops/recovery<br/>/api/config<br/>/api/holidays"]

  authApi --> authSession["lib/auth-session.ts"]
  peopleApi --> authSession
  attendanceApi --> authSession
  scheduleApi --> authSession
  machineApi --> authSession
  adminApi --> authSession

  peopleApi --> db["lib/db.js"]
  attendanceApi --> db
  scheduleApi --> db
  machineApi --> db
  adminApi --> db

  machineApi --> sdk["lib/easylink-sdk-client.js"]
  adminApi --> ops["lib/ops-recovery.js"]
```

## Auth And Authorization

```mermaid
flowchart LR
  login["POST /api/auth/login"]
  cookie["easylink_session<br/>signed cookie"]
  me["GET /api/auth/me"]
  authCtx["AuthContext"]
  account["auth_accounts<br/>auth_account_group_scope"]
  nip["tb_karyawan_auth<br/>tb_karyawan_roles"]
  pin["tb_user<br/>tb_user_group_access"]
  adapter["lib/authz/authorization-adapter.ts"]
  nav["Sidebar route visibility"]
  apiGuard["API guards<br/>unauthorizedResponse / forbiddenResponse"]

  login --> cookie
  cookie --> me
  me --> authCtx
  authCtx --> account
  authCtx --> nip
  authCtx --> pin
  authCtx --> adapter
  adapter --> nav
  authCtx --> apiGuard
```

## Attendance, Schedule, And Export Flow

```mermaid
flowchart TB
  attendancePage["/attendance"]
  reviewPage["/attendance/review"]
  schedulePage["/schedule"]
  reportPage["/report"]
  performancePage["/performance"]

  attendanceApi["/api/attendance"]
  rawApi["/api/attendance/raw"]
  reviewApi["/api/attendance/review"]
  scheduleApi["/api/schedule"]
  quickApi["/api/schedule/quick-summaries"]
  reportApi["/api/report"]
  perfApi["/api/performance"]

  helpers["Shared helpers<br/>attendance-helpers<br/>schedule-helpers<br/>quick-summaries-export"]
  tables["Core tables<br/>tb_scanlog<br/>tb_karyawan<br/>tb_schedule<br/>tb_shift_type<br/>tb_attendance_note<br/>tb_group<br/>tb_employee_group"]
  holidays["Holiday source<br/>/api/holidays<br/>id-holidays-fallback"]
  exports["CSV/Excel/Print/PDF<br/>browser print path"]

  attendancePage --> attendanceApi
  attendancePage --> rawApi
  attendancePage --> quickApi
  reviewPage --> reviewApi
  schedulePage --> scheduleApi
  reportPage --> reportApi
  performancePage --> perfApi

  attendanceApi --> helpers
  rawApi --> helpers
  reviewApi --> helpers
  scheduleApi --> helpers
  quickApi --> helpers
  reportApi --> helpers
  perfApi --> helpers
  helpers --> tables
  helpers --> holidays
  attendancePage --> exports
  schedulePage --> exports
```

## Machine And Scanlog Flow

```mermaid
flowchart LR
  machinePage["/machine"]
  scanlogPage["/scanlog"]
  rightOps["Right Ops Sidebar"]
  machineApi["/api/machine<br/>in-process queue"]
  machineStatus["/api/machine/status"]
  syncApi["/api/scanlog/sync<br/>bounded worker queue"]
  streamApi["/api/scanlog/stream<br/>SSE queue snapshot"]
  scanlogApi["/api/scanlog"]
  sdk["SDK adapter<br/>auto -> windows-sdk -> fingerspot"]
  wsdk["Windows SDK REST<br/>EASYLINK_WSDK_*"]
  fingerspot["fingerspot-easylink-ts<br/>EASYLINK_DEVICE_*"]
  scanlogTables["Scan tables<br/>tb_scanlog<br/>scanlog batches/jobs"]
  deviceTables["Device/user tables<br/>tb_device<br/>tb_user"]

  machinePage --> machineApi
  machinePage --> syncApi
  machinePage --> machineStatus
  scanlogPage --> scanlogApi
  scanlogPage --> syncApi
  scanlogPage --> streamApi
  rightOps --> syncApi
  rightOps --> machineApi

  machineApi --> sdk
  machineStatus --> sdk
  syncApi --> sdk
  sdk --> wsdk
  sdk --> fingerspot
  syncApi --> scanlogTables
  scanlogApi --> scanlogTables
  machineApi --> deviceTables
```

## Ops Recovery Flow

```mermaid
sequenceDiagram
  participant Admin as Admin Dashboard
  participant Panel as DashboardOpsPanel
  participant API as /api/ops/recovery
  participant Ops as lib/ops-recovery.js
  participant PS as powershell.exe
  participant Task as Windows Task Scheduler
  participant Health as Health Summary JSON

  Admin->>Panel: Open dashboard
  Panel->>API: GET status
  API->>Ops: queryRecoveryTaskStatus()
  Ops->>PS: Get-ScheduledTask
  PS->>Task: Read EasyLink-Recovery
  Ops->>Health: read optional summary file
  API-->>Panel: task + health_summary
  Admin->>Panel: Run Recovery Task
  Panel->>API: POST
  API->>Ops: startRecoveryTask()
  Ops->>PS: Start-ScheduledTask
  PS->>Task: Trigger task
  API-->>Panel: started/message/task
```

## UAT And Release Gates

```mermaid
flowchart TB
  uat["UAT hold"]
  defaults["Compatibility defaults<br/>policy=legacy<br/>data=legacy_only<br/>machine parity=off<br/>reporting=legacy"]
  docs["Release docs<br/>Windows/Linux runbooks<br/>env contract<br/>UAT policy"]
  deploy["Host-based Node deploy<br/>Windows or Linux"]
  smoke["Smoke checks<br/>auth, attendance, report,<br/>machine queue, print/PDF"]
  rollback["Rollback<br/>reset flags + restart<br/>migration:v3 rollback if required"]
  blockers["Known hardening blockers<br/>forced TLS bypass in SDK client<br/>in-process queues need single app instance"]

  uat --> defaults
  defaults --> deploy
  docs --> deploy
  deploy --> smoke
  smoke -->|fail| rollback
  smoke -->|pass| uat
  blockers --> deploy
```

## Current Planning Read

| Area | State |
|---|---|
| UI shell | Left nav, right admin ops sidebar, theme and locale toggles are active. |
| Auth | Canonical account path exists with NIP and legacy PIN compatibility fallback. |
| Attendance/reporting | Main tables aggregate from scanlog, schedule, shifts, groups, notes, and holiday metadata. |
| Print/PDF | Holiday names are trimmed from compact print cells while color semantics remain. |
| Machine/scanlog | SDK-first machine integration with bounded queues and admin-only surfaces. |
| Ops recovery | Windows Task Scheduler recovery hook exists in current local state. |
| Release posture | UAT hold with compatibility-first defaults and Windows/Linux runbooks. |

