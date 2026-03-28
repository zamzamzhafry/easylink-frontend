# More Deep Restructure (Next Agent Todo)

## Next agent todolist

- [x] Expand server-driven pagination patterns across other heavy pages (attendance raw, machine queues, and any all-record fetch endpoint).
- [x] Define a shared paginated response contract and reusable frontend hook for list pages.
- [x] Add consistent exception-first status panels (error/retry) for operational pages.
- [x] Align page layout hierarchy with architecture guide: summary/KPI first, filters second, actionable table next.
- [x] Evaluate query-level optimizations for large joins (scoped joins, pre-aggregation, indexes) and document cutover steps.

## Why this is queued

Current users-page improvement is complete, but broader app scalability requires the same pattern to be applied consistently in later phases.

## Planning update (comparison: completed work vs next steps)

### What is already completed in this cycle

- ✅ Users API moved to server-driven pagination (`page`, `limit`, `search`) with scoped joins and structured paging response.
- ✅ Users page switched from full-list client slicing to backend pagination + debounced search.
- ✅ Users page now has explicit inline error state and retry action (not toast-only).
- ✅ Users page layout now follows architecture hierarchy more closely (summary cards → filters → table).

### Gap analysis against next-agent todolist

1. **Expand server-driven pagination patterns**
   - Current: done for Users page.
   - Gap: apply same pattern to attendance raw, machine queue, and other all-record endpoints.

2. **Define shared pagination contract + reusable frontend hook**
   - Current: pattern exists in multiple pages (users/scanlog) but duplicated.
   - Gap: create one shared response contract and one reusable list hook to remove copy-paste logic.

3. **Exception-first status panels**
   - Current: users has inline error + retry; scanlog has partial status handling.
   - Gap: standardize one reusable status panel component (loading/error/retry) across operational pages.

4. **Architecture-guide-aligned UI hierarchy**
   - Current: users page aligned.
   - Gap: propagate hierarchy to scanlog, machine, and attendance pages.

5. **Query-level optimization for heavy joins**
   - Current: users query now scopes heavy joins to current page pins.
   - Gap: identify other heavy queries, add index recommendations, and document rollout/cutover.

### Next execution plan (ordered)

#### Phase 1 — Contract + foundation (next immediate step)

- Define standard paginated API response shape in docs and implementation notes.
- Build reusable frontend pagination hook (loading, page, limit, total, pages, error, retry).
- Refactor Users and Scanlog pages to use the shared hook (no behavior regressions).

#### Phase 2 — Rollout to heavy pages

- Apply server-driven pagination + error panels to attendance raw and machine queue pages.
- Remove any remaining full-record fetch-on-load flows from UI pages.

#### Phase 3 — Backend performance hardening

- Inventory heavy SQL paths and join costs.
- Add/validate indexes and safe query refinements.
- Capture before/after metrics (response time, payload size, timeout rate).

### Definition of done for the next step

- No target page fetches full records by default.
- Every target page has a visible recoverable error state.
- Shared pagination behavior is centralized (contract + hook), not duplicated.
- Performance baseline for target endpoints is documented before and after optimization.

### Execution status update (completed)

All three planned phases have now been implemented in this cycle:

1. **Phase 1 (Contract + foundation)**
   - Added shared pagination contract helpers (`lib/pagination.js`).
   - Added reusable paginated frontend hook (`hooks/use-paginated-resource.js`).
   - Refactored Users and Scanlog pages to use centralized pagination behavior.

2. **Phase 2 (Rollout to heavy pages)**
   - Migrated Attendance raw tab to server-driven pagination with recoverable error panel.
   - Added machine jobs queue pagination on Machine page and API.
   - Standardized list error banner pattern via `InlineStatusPanel`.

3. **Phase 3 (Backend hardening + metrics docs)**
   - Added/normalized paginated contracts on target APIs:
     - `/api/users`
     - `/api/scanlog`
     - `/api/attendance/raw`
     - `/api/machine`
     - `/api/scanlog/sync`
   - Added rollout metrics and UAT measurement playbook:
     - `docs/learning/pagination_rollout_metrics.md`

# EasyLink troubleshooting and integration notes

## Context

Project uses Fingerspot EasyLink SDK through FService.exe and a frontend project based on Next/React. Initial testing on Windows 11 used PowerShell and `Invoke-WebRequest` because Linux-style curl flags conflicted with PowerShell alias behavior.

## Main findings

1. On Windows PowerShell, `curl` may resolve to `Invoke-WebRequest`, so `curl.exe` is safer for raw curl syntax.
2. `/scanlog/new` worked once called in Windows-compatible form.
3. `/dev/info` is the best lightweight connectivity check.
4. `/dev/settime` can fail due to server-side FService/runtime/permission issues, not necessarily client-side script problems.
5. `/user/all/paging` is prone to timeout because returned payload can include large templates.
6. The best mitigation is smaller batch size, longer timeout, visible progress logging, partial persistence, and small pauses between batches.

## Recommended architecture

### Do not call FService directly from the browser

Instead:

- Next.js route handlers call FService.
- React components call Next.js internal APIs.
- Logging and timeout control stay on the server side.

### Suggested routes

- `app/api/device-info/route.ts`
- `app/api/scanlog/new/route.ts`
- `app/api/users/fetch/route.ts`

## Paging timeout strategy

For `/user/all/paging`:

- Start with batch size 10.
- Use timeout 120-180 seconds per batch.
- Print progress per batch.
- Save partial results after each successful batch.
- Add 300-500 ms delay between batches.

## Keep-alive interpretation

FService likely does not stream partial JSON per request. Because of that, “keep-alive” here should mean:

- terminal keeps showing progress after each batch,
- process remains visible and controlled,
- partial files exist even before the final fetch ends.

This is operational keep-alive, not HTTP chunked streaming.

## PowerShell baseline

The PowerShell script should support:

- device info,
- new scanlog fetch,
- safe user paging fetch,
- live logs with timestamps,
- partial JSON save,
- final JSON save.

## Migration path to Next.js

1. Stabilize PowerShell operator script first.
2. Extract shared request logic into server-side utility.
3. Build internal API routes in Next.js.
4. Add React UI for progress and results.
5. If real-time UI progress is needed, add SSE, WebSocket, or polling to a progress endpoint.

## Repo-level recommendation

Frontend repository should focus on:

- UI state,
- progress rendering,
- normalized API consumption,
- not direct device communication.

Direct machine communication should remain server-side.

Untuk fresh deploy, saya sarankan kamu mulai dengan schema ORM yang memisahkan **raw machine data**, **master employee**, **schedule**, **attendance result**, dan **sync jobs**, karena itu paling aman untuk UAT dan sample data. Pola ini membuat kamu bisa re-import log, mengubah rule absensi, lalu recompute tanpa merusak data mentah. [github](https://github.com/dewadg/easylink-js)

Di bawah ini saya berikan versi **Prisma ORM schema** karena paling mudah dipakai untuk migrasi database baru, seed sample data, dan testing UAT di stack Node/Next. Secara konsep, schema ini tetap bisa diterjemahkan ke TypeORM, Drizzle, atau Sequelize. [github](https://github.com/dewadg/easylink-js)

## Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum DeviceStatus {
  ACTIVE
  INACTIVE
  ERROR
}

enum SyncJobType {
  DEVICE_INFO
  FETCH_USERS
  FETCH_SCANLOG
  REBUILD_ATTENDANCE
}

enum SyncJobStatus {
  QUEUED
  RUNNING
  SUCCESS
  PARTIAL_SUCCESS
  FAILED
  CANCELLED
}

enum VerifyModeType {
  FP
  PASSWORD
  CARD
  FACE
  OTHER
}

enum IoModeType {
  CHECK_IN
  CHECK_OUT
  UNKNOWN
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
  RESIGNED
}

enum ShiftType {
  FIXED
  FLEXIBLE
  CROSS_DAY
}

enum AttendanceStatus {
  PRESENT
  LATE
  EARLY_OUT
  ABSENT
  INCOMPLETE
  OFFDAY
  HOLIDAY
  LEAVE
}

model Device {
  id              String        @id @default(cuid())
  serialNumber    String        @unique
  name            String?
  baseUrl         String?
  ipAddress       String?
  port            Int?
  location        String?
  firmwareVersion String?
  platform        String?
  status          DeviceStatus  @default(ACTIVE)
  lastSeenAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  rawScanLogs     RawScanLog[]
  syncJobs        SyncJob[]
}

model Employee {
  id                String             @id @default(cuid())
  pin               String             @unique
  employeeCode      String?            @unique
  fullName          String
  departmentId      String?
  positionId        String?
  defaultShiftId    String?
  cardNumber        String?
  passwordHash      String?
  privilege         Int?
  machineUserRaw    Json?
  status            EmployeeStatus     @default(ACTIVE)
  joinDate          DateTime?
  resignDate        DateTime?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  department        Department?        @relation(fields: [departmentId], references: [id])
  position          Position?          @relation(fields: [positionId], references: [id])
  defaultShift      Shift?             @relation("EmployeeDefaultShift", fields: [defaultShiftId], references: [id])

  rawScanLogs       RawScanLog[]
  scheduleAssignments ScheduleAssignment[]
  dailySchedules    DailySchedule[]
  attendances       AttendanceDaily[]
}

model Department {
  id          String      @id @default(cuid())
  code        String?     @unique
  name        String      @unique
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  employees   Employee[]
}

model Position {
  id          String      @id @default(cuid())
  code        String?     @unique
  name        String      @unique
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  employees   Employee[]
}

model Shift {
  id                 String               @id @default(cuid())
  code               String               @unique
  name               String
  type               ShiftType            @default(FIXED)
  startTimeMinutes   Int
  endTimeMinutes     Int
  crossDay           Boolean              @default(false)
  lateToleranceMin   Int                  @default(0)
  earlyOutToleranceMin Int                @default(0)
  checkInStartMin    Int?
  checkInEndMin      Int?
  checkOutStartMin   Int?
  checkOutEndMin     Int?
  breakStartMin      Int?
  breakEndMin        Int?
  workHours          Decimal?             @db.Decimal(5,2)
  isActive           Boolean              @default(true)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  employeesDefault   Employee[]           @relation("EmployeeDefaultShift")
  scheduleAssignments ScheduleAssignment[]
  dailySchedules     DailySchedule[]
  attendances        AttendanceDaily[]
}

model ScheduleAssignment {
  id            String      @id @default(cuid())
  employeeId    String
  shiftId       String
  validFrom     DateTime
  validTo       DateTime?
  isActive      Boolean     @default(true)
  notes         String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  employee      Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift         Shift       @relation(fields: [shiftId], references: [id])

  @@index([employeeId, validFrom, validTo])
}

model DailySchedule {
  id              String      @id @default(cuid())
  employeeId      String
  shiftId         String?
  workDate        DateTime
  isOffday        Boolean     @default(false)
  isHoliday       Boolean     @default(false)
  holidayName     String?
  plannedStartAt  DateTime?
  plannedEndAt    DateTime?
  source          String?     // generated/manual/imported
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  employee        Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift           Shift?      @relation(fields: [shiftId], references: [id])
  attendances     AttendanceDaily[]

  @@unique([employeeId, workDate])
  @@index([workDate])
}

model RawScanLog {
  id                String          @id @default(cuid())
  deviceId          String
  employeeId        String?
  pin               String
  workCode          Int?
  serialNumber      String?
  verifyModeCode    Int?
  verifyMode        VerifyModeType  @default(OTHER)
  ioModeCode        Int?
  ioMode            IoModeType      @default(UNKNOWN)
  scannedAt         DateTime
  machineDateText   String?
  sourceHash        String          @unique
  rawPayload        Json
  createdAt         DateTime        @default(now())

  device            Device          @relation(fields: [deviceId], references: [id])
  employee          Employee?       @relation(fields: [employeeId], references: [id])

  attendanceLinks   AttendanceLogLink[]

  @@index([pin, scannedAt])
  @@index([employeeId, scannedAt])
  @@index([deviceId, scannedAt])
}

model AttendanceDaily {
  id                   String             @id @default(cuid())
  employeeId           String
  shiftId              String?
  dailyScheduleId      String?
  workDate             DateTime
  firstInAt            DateTime?
  lastOutAt            DateTime?
  effectiveCheckInAt   DateTime?
  effectiveCheckOutAt  DateTime?
  lateMinutes          Int                @default(0)
  earlyOutMinutes      Int                @default(0)
  workMinutes          Int                @default(0)
  overtimeMinutes      Int                @default(0)
  status               AttendanceStatus
  isMissingCheckIn     Boolean            @default(false)
  isMissingCheckOut    Boolean            @default(false)
  isAutoComputed       Boolean            @default(true)
  notes                String?
  calcVersion          Int                @default(1)
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  employee             Employee           @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift                Shift?             @relation(fields: [shiftId], references: [id])
  dailySchedule        DailySchedule?     @relation(fields: [dailyScheduleId], references: [id])
  logLinks             AttendanceLogLink[]

  @@unique([employeeId, workDate])
  @@index([workDate, status])
  @@index([employeeId, workDate])
}

model AttendanceLogLink {
  id                String           @id @default(cuid())
  attendanceId      String
  rawScanLogId      String
  role              String           // CHECK_IN, CHECK_OUT, SUPPORTING, IGNORED_CANDIDATE
  createdAt         DateTime         @default(now())

  attendance        AttendanceDaily  @relation(fields: [attendanceId], references: [id], onDelete: Cascade)
  rawScanLog        RawScanLog       @relation(fields: [rawScanLogId], references: [id], onDelete: Cascade)

  @@unique([attendanceId, rawScanLogId, role])
  @@index([rawScanLogId])
}

model SyncJob {
  id                String         @id @default(cuid())
  deviceId          String?
  type              SyncJobType
  status            SyncJobStatus  @default(QUEUED)
  startedAt         DateTime?
  finishedAt        DateTime?
  requestedBy       String?
  fromTime          DateTime?
  toTime            DateTime?
  batchSize         Int?
  totalFetched      Int            @default(0)
  totalProcessed    Int            @default(0)
  successCount      Int            @default(0)
  failCount         Int            @default(0)
  progressMessage   String?
  errorMessage      String?
  meta              Json?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  device            Device?        @relation(fields: [deviceId], references: [id])

  logs              SyncJobLog[]

  @@index([type, status])
  @@index([deviceId, createdAt])
}

model SyncJobLog {
  id            String      @id @default(cuid())
  syncJobId     String
  level         String
  message       String
  context       Json?
  createdAt     DateTime    @default(now())

  syncJob       SyncJob     @relation(fields: [syncJobId], references: [id], onDelete: Cascade)

  @@index([syncJobId, createdAt])
}
```

## Kenapa schema ini

Schema ini sengaja memisahkan:

- `RawScanLog` sebagai data mentah dari mesin.
- `AttendanceDaily` sebagai hasil olahan.
- `AttendanceLogLink` sebagai jejak audit dari hasil ke log mentah.
- `SyncJob` dan `SyncJobLog` untuk observability saat fetch users dan scanlog. [github](https://github.com/dewadg/easylink-js)

Dengan pola ini, UAT jadi jauh lebih aman karena tester bisa memeriksa apakah “late”, “missing checkout”, atau “absent” berasal dari aturan schedule atau memang dari scanlog mentahnya. Ini penting untuk sistem absensi yang akan sering diprotes kalau hasilnya tidak bisa diaudit balik ke event aslinya. [github](https://github.com/dewadg/easylink-js)

## Seed sample data

Untuk fresh deploy UAT, saya sarankan minimal seed:

- 1 device.
- 2 department.
- 2–3 shift, termasuk 1 shift malam.
- 20–50 employee sample.
- 7–30 hari daily schedule.
- raw scanlog sample untuk kasus normal, telat, lupa checkout, double scan, dan shift lintas hari. [github](https://github.com/dewadg/easylink-js)

Kasus sample yang **harus** ada saat UAT:

- Tepat waktu masuk dan keluar.
- Telat masuk.
- Pulang cepat.
- Missing check-out.
- Missing check-in.
- Shift malam lewat tengah malam.
- Dua scan masuk berdekatan.
- User ada di scanlog tetapi belum sinkron di master employee. [github](https://github.com/dewadg/easylink-js)

## Mapping endpoint

Saat migrasi dari EasyLink/FService:

- `/user/all/paging` masuk ke `Employee` dan simpan raw payload ke `machineUserRaw`.
- `/scanlog/new` atau `/scanlog/all/paging` masuk ke `RawScanLog`.
- Rule engine membaca `DailySchedule + RawScanLog` lalu menghasilkan `AttendanceDaily`. [github](https://github.com/dewadg/easylink-js)

Untuk mencegah duplikasi log, gunakan `sourceHash` yang dibentuk dari kombinasi seperti `serialNumber + pin + scannedAt + verifyModeCode + ioModeCode`. Itu membantu retry fetch saat timeout tanpa membuat log yang sama masuk dua kali. [github](https://github.com/dewadg/easylink-js)

## Saran implementasi

Kalau kamu pakai Next.js, alur backend yang aman biasanya:

1. Route trigger membuat `SyncJob`.
2. Worker atau server action fetch data batch per batch.
3. Setiap batch menulis `SyncJobLog`.
4. UI membaca progres dari `SyncJob`.
5. Setelah fetch selesai, jalankan proses attendance compute. [github](https://github.com/dewadg/easylink-js)

Untuk UAT, jangan dulu optimize terlalu cepat ke dashboard kompleks. Prioritaskan tiga layar:

- Sync monitor.
- Raw log explorer.
- Attendance daily explorer dengan a

## Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum DeviceStatus {
  ACTIVE
  INACTIVE
  ERROR
}

enum SyncJobType {
  DEVICE_INFO
  FETCH_USERS
  FETCH_SCANLOG
  REBUILD_ATTENDANCE
}

enum SyncJobStatus {
  QUEUED
  RUNNING
  SUCCESS
  PARTIAL_SUCCESS
  FAILED
  CANCELLED
}

enum VerifyModeType {
  FP
  PASSWORD
  CARD
  FACE
  OTHER
}

enum IoModeType {
  CHECK_IN
  CHECK_OUT
  UNKNOWN
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
  RESIGNED
}

enum ShiftType {
  FIXED
  FLEXIBLE
  CROSS_DAY
}

enum AttendanceStatus {
  PRESENT
  LATE
  EARLY_OUT
  ABSENT
  INCOMPLETE
  OFFDAY
  HOLIDAY
  LEAVE
}

model Device {
  id              String        @id @default(cuid())
  serialNumber    String        @unique
  name            String?
  baseUrl         String?
  ipAddress       String?
  port            Int?
  location        String?
  firmwareVersion String?
  platform        String?
  status          DeviceStatus  @default(ACTIVE)
  lastSeenAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  rawScanLogs     RawScanLog[]
  syncJobs        SyncJob[]
}

model Employee {
  id                String             @id @default(cuid())
  pin               String             @unique
  employeeCode      String?            @unique
  fullName          String
  departmentId      String?
  positionId        String?
  defaultShiftId    String?
  cardNumber        String?
  passwordHash      String?
  privilege         Int?
  machineUserRaw    Json?
  status            EmployeeStatus     @default(ACTIVE)
  joinDate          DateTime?
  resignDate        DateTime?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  department        Department?        @relation(fields: [departmentId], references: [id])
  position          Position?          @relation(fields: [positionId], references: [id])
  defaultShift      Shift?             @relation("EmployeeDefaultShift", fields: [defaultShiftId], references: [id])

  rawScanLogs       RawScanLog[]
  scheduleAssignments ScheduleAssignment[]
  dailySchedules    DailySchedule[]
  attendances       AttendanceDaily[]
}

model Department {
  id          String      @id @default(cuid())
  code        String?     @unique
  name        String      @unique
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  employees   Employee[]
}

model Position {
  id          String      @id @default(cuid())
  code        String?     @unique
  name        String      @unique
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  employees   Employee[]
}

model Shift {
  id                 String               @id @default(cuid())
  code               String               @unique
  name               String
  type               ShiftType            @default(FIXED)
  startTimeMinutes   Int
  endTimeMinutes     Int
  crossDay           Boolean              @default(false)
  lateToleranceMin   Int                  @default(0)
  earlyOutToleranceMin Int                @default(0)
  checkInStartMin    Int?
  checkInEndMin      Int?
  checkOutStartMin   Int?
  checkOutEndMin     Int?
  breakStartMin      Int?
  breakEndMin        Int?
  workHours          Decimal?             @db.Decimal(5,2)
  isActive           Boolean              @default(true)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  employeesDefault   Employee[]           @relation("EmployeeDefaultShift")
  scheduleAssignments ScheduleAssignment[]
  dailySchedules     DailySchedule[]
  attendances        AttendanceDaily[]
}

model ScheduleAssignment {
  id            String      @id @default(cuid())
  employeeId    String
  shiftId       String
  validFrom     DateTime
  validTo       DateTime?
  isActive      Boolean     @default(true)
  notes         String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  employee      Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift         Shift       @relation(fields: [shiftId], references: [id])

  @@index([employeeId, validFrom, validTo])
}

model DailySchedule {
  id              String      @id @default(cuid())
  employeeId      String
  shiftId         String?
  workDate        DateTime
  isOffday        Boolean     @default(false)
  isHoliday       Boolean     @default(false)
  holidayName     String?
  plannedStartAt  DateTime?
  plannedEndAt    DateTime?
  source          String?     // generated/manual/imported
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  employee        Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift           Shift?      @relation(fields: [shiftId], references: [id])
  attendances     AttendanceDaily[]

  @@unique([employeeId, workDate])
  @@index([workDate])
}

model RawScanLog {
  id                String          @id @default(cuid())
  deviceId          String
  employeeId        String?
  pin               String
  workCode          Int?
  serialNumber      String?
  verifyModeCode    Int?
  verifyMode        VerifyModeType  @default(OTHER)
  ioModeCode        Int?
  ioMode            IoModeType      @default(UNKNOWN)
  scannedAt         DateTime
  machineDateText   String?
  sourceHash        String          @unique
  rawPayload        Json
  createdAt         DateTime        @default(now())

  device            Device          @relation(fields: [deviceId], references: [id])
  employee          Employee?       @relation(fields: [employeeId], references: [id])

  attendanceLinks   AttendanceLogLink[]

  @@index([pin, scannedAt])
  @@index([employeeId, scannedAt])
  @@index([deviceId, scannedAt])
}

model AttendanceDaily {
  id                   String             @id @default(cuid())
  employeeId           String
  shiftId              String?
  dailyScheduleId      String?
  workDate             DateTime
  firstInAt            DateTime?
  lastOutAt            DateTime?
  effectiveCheckInAt   DateTime?
  effectiveCheckOutAt  DateTime?
  lateMinutes          Int                @default(0)
  earlyOutMinutes      Int                @default(0)
  workMinutes          Int                @default(0)
  overtimeMinutes      Int                @default(0)
  status               AttendanceStatus
  isMissingCheckIn     Boolean            @default(false)
  isMissingCheckOut    Boolean            @default(false)
  isAutoComputed       Boolean            @default(true)
  notes                String?
  calcVersion          Int                @default(1)
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  employee             Employee           @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift                Shift?             @relation(fields: [shiftId], references: [id])
  dailySchedule        DailySchedule?     @relation(fields: [dailyScheduleId], references: [id])
  logLinks             AttendanceLogLink[]

  @@unique([employeeId, workDate])
  @@index([workDate, status])
  @@index([employeeId, workDate])
}

model AttendanceLogLink {
  id                String           @id @default(cuid())
  attendanceId      String
  rawScanLogId      String
  role              String           // CHECK_IN, CHECK_OUT, SUPPORTING, IGNORED_CANDIDATE
  createdAt         DateTime         @default(now())

  attendance        AttendanceDaily  @relation(fields: [attendanceId], references: [id], onDelete: Cascade)
  rawScanLog        RawScanLog       @relation(fields: [rawScanLogId], references: [id], onDelete: Cascade)

  @@unique([attendanceId, rawScanLogId, role])
  @@index([rawScanLogId])
}

model SyncJob {
  id                String         @id @default(cuid())
  deviceId          String?
  type              SyncJobType
  status            SyncJobStatus  @default(QUEUED)
  startedAt         DateTime?
  finishedAt        DateTime?
  requestedBy       String?
  fromTime          DateTime?
  toTime            DateTime?
  batchSize         Int?
  totalFetched      Int            @default(0)
  totalProcessed    Int            @default(0)
  successCount      Int            @default(0)
  failCount         Int            @default(0)
  progressMessage   String?
  errorMessage      String?
  meta              Json?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  device            Device?        @relation(fields: [deviceId], references: [id])

  logs              SyncJobLog[]

  @@index([type, status])
  @@index([deviceId, createdAt])
}

model SyncJobLog {
  id            String      @id @default(cuid())
  syncJobId     String
  level         String
  message       String
  context       Json?
  createdAt     DateTime    @default(now())

  syncJob       SyncJob     @relation(fields: [syncJobId], references: [id], onDelete: Cascade)

  @@index([syncJobId, createdAt])
}
```

## Kenapa schema ini

Schema ini sengaja memisahkan:

- `RawScanLog` sebagai data mentah dari mesin.
- `AttendanceDaily` sebagai hasil olahan.
- `AttendanceLogLink` sebagai jejak audit dari hasil ke log mentah.
- `SyncJob` dan `SyncJobLog` untuk observability saat fetch users dan scanlog. [github](https://github.com/dewadg/easylink-js)

Dengan pola ini, UAT jadi jauh lebih aman karena tester bisa memeriksa apakah “late”, “missing checkout”, atau “absent” berasal dari aturan schedule atau memang dari scanlog mentahnya. Ini penting untuk sistem absensi yang akan sering diprotes kalau hasilnya tidak bisa diaudit balik ke event aslinya. [github](https://github.com/dewadg/easylink-js)

## Seed sample data

Untuk fresh deploy UAT, saya sarankan minimal seed:

- 1 device.
- 2 department.
- 2–3 shift, termasuk 1 shift malam.
- 20–50 employee sample.
- 7–30 hari daily schedule.
- raw scanlog sample untuk kasus normal, telat, lupa checkout, double scan, dan shift lintas hari. [github](https://github.com/dewadg/easylink-js)

Kasus sample yang **harus** ada saat UAT:

- Tepat waktu masuk dan keluar.
- Telat masuk.
- Pulang cepat.
- Missing check-out.
- Missing check-in.
- Shift malam lewat tengah malam.
- Dua scan masuk berdekatan.
- User ada di scanlog tetapi belum sinkron di master employee. [github](https://github.com/dewadg/easylink-js)

## Mapping endpoint

Saat migrasi dari EasyLink/FService:

- `/user/all/paging` masuk ke `Employee` dan simpan raw payload ke `machineUserRaw`.
- `/scanlog/new` atau `/scanlog/all/paging` masuk ke `RawScanLog`.
- Rule engine membaca `DailySchedule + RawScanLog` lalu menghasilkan `AttendanceDaily`. [github](https://github.com/dewadg/easylink-js)

Untuk mencegah duplikasi log, gunakan `sourceHash` yang dibentuk dari kombinasi seperti `serialNumber + pin + scannedAt + verifyModeCode + ioModeCode`. Itu membantu retry fetch saat timeout tanpa membuat log yang sama masuk dua kali. [github](https://github.com/dewadg/easylink-js)

## Saran implementasi

Kalau kamu pakai Next.js, alur backend yang aman biasanya:

1. Route trigger membuat `SyncJob`.
2. Worker atau server action fetch data batch per batch.
3. Setiap batch menulis `SyncJobLog`.
4. UI membaca progres dari `SyncJob`.
5. Setelah fetch selesai, jalankan proses attendance compute. [github](https://github.com/dewadg/easylink-js)

Untuk UAT, jangan dulu optimize terlalu cepat ke dashboard kompleks. Prioritaskan tiga layar:

- Sync monitor.
- Raw log explorer.
- Attendance daily explorer dengan audit trail.
  Kalau kamu mau, saya bisa lanjutkan dengan **seed file Prisma** dan **contoh migration plan dari data EasyLink lama ke schema baru ini**.
