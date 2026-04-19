# Session Handoff - Attendance/Performance Planning Backlog

## Status

This is a planning backlog, not an implementation spec.
It captures the open items that remain after the current attendance/performance thread work.

## Backlog items

### 1. Tighten the role story

- Keep the canonical `admin` / `group_leader` / `employee` model as the policy source.
- Decide which legacy capability labels should remain as compatibility shims.
- Make the employee-facing visibility story easier to explain in one place.

### 2. Finish the attendance/performance access map

- Confirm whether the current `can_dashboard` path should continue to grant performance access to employee-style accounts.
- Keep attendance review readable for non-admin users without exposing raw mutation tooling.
- Preserve the admin-only boundary around raw attendance and machine control.

### 3. Reduce thread confusion around “planning” vs “review”

- Clarify what belongs in Attendance summary, Attendance review, and Performance.
- Avoid making the review surface look like a raw admin console.
- Keep note editing, punch review, and raw mutation boundaries explicit.

### 4. Keep exports and summaries aligned

- Make the attendance/performance export story consistent with the current compact-date summary direction.
- Preserve the same date-range semantics across screen, CSV, Excel, and print flows.
- Keep export-scope controls clearly tied to export actions, not the data table itself.

### 5. Verify the performance/dashboard experience

- Re-check how the performance route behaves for non-admin users who only have dashboard capability.
- Decide whether additional copy is needed so employees understand why some screens are visible but not editable.
- Add focused regression coverage around access and export behavior.

## Suggested next pass

If we resume this thread, the next useful step is to turn the backlog into a short decision list:

1. Which employee roles should see Performance?
2. Which attendance actions should remain leader-only?
3. Which legacy flags can be retired without breaking existing users?

## Source anchors

- `app/page.jsx`
- `app/attendance/page.jsx`
- `app/attendance/review/page.jsx`
- `app/performance/page.jsx`
- `lib/auth-session.ts`
- `lib/authz/authorization-adapter.ts`
- `docs/learning/role-capability-matrix.md`
