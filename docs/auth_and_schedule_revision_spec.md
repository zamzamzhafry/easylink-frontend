# Authentication & Schedule Revision Specifications

## 1. Authentication Restructure

**Current State**:
- Users log in using `tb_user.pin`, which represents a device/fingerspot machine user.
- Privileges are stored directly on `tb_user.privilege` (which is volatile as it syncs with machines).

**New Design (Target State)**:
- Login will be bound to employees via their NIP (Employee ID).
- We maintain `tb_user` ONLY for the physical machine ingest identity.
- We create new tables for application login and role-based access.

**New Tables**:
1. `tb_karyawan_auth`
   - `karyawan_id` (PK, FK to tb_karyawan)
   - `nip` (Unique login ID)
   - `password_hash`
   - `is_active`
   - `last_login_at`

2. `tb_karyawan_roles`
   - `id` (PK)
   - `karyawan_id` (FK to tb_karyawan)
   - `role_key` (ENUM: admin, hr, group_leader, scheduler, viewer)
   - `group_id` (NULL if admin/hr, populated if group_leader)

**API Changes**:
- `POST /api/auth/login` -> Queries `tb_karyawan_auth` by `nip`.
- `createAuthContext` -> Rebuilt to map the session to `karyawan_id`, `nip`, and their roles/groups.

---

## 2. Schedule Revision Workflow

**Objective**: Group leaders (or non-admins) can draft changes to the schedule, but it must be approved by an Admin or HR before taking effect.

**New Database Entity**:
`tb_schedule_revision_requests`
- `id` (PK)
- `requester_karyawan_id`
- `group_id`
- `revision_type` (create, edit, delete)
- `payload` (JSON of the proposed schedule change)
- `status` (pending, approved, rejected)
- `reviewed_by_karyawan_id`
- `review_note`

**Process**:
1. **Submission**: Group Leader edits a schedule -> App saves a `pending` record in `tb_schedule_revision_requests`.
2. **Alert/Queue**: Admin and HR users see a notification badge/modal with the pending queue.
3. **Approval**: Admin/HR clicks 'Approve' -> The system applies the `payload` JSON to the actual schedule tables and updates status to `approved`.
4. **Rejection**: Admin/HR rejects with an optional note -> Status becomes `rejected`.

---

## 3. Data Migration (`tb_scanlog` -> `scanlog`)

**Goal**: Safely migrate historical scan logs from the old structure (`tb_scanlog`) into the new normalized event table (`scanlog_events` or `scanlog`).

**Implementation**:
- Create an Admin UI button: "Migrate Legacy Scan Logs".
- Trigger an API endpoint `POST /api/admin/migrate-scanlogs` that safely reads from `tb_scanlog` and upserts into the new table, ignoring duplicates using a unique composite key or the `source_event_key`.
