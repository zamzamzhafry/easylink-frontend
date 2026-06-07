# F3 — Manual QA Checklist

**App**: EasyLink Frontend (`npm run dev` → http://localhost:3000)  
**Tester**: ___________________  
**Date**: ___________________  
**Build**: ___________________  

> Fill each checkbox. Add notes in the `Notes` column. Mark `PASS` / `FAIL` / `SKIP` at the end of each section.

---

## Setup

- [ ] `npm run dev` starts without errors
- [ ] App loads at http://localhost:3000
- [ ] DB is reachable (XAMPP MySQL running on port 3306)
- [ ] At least one admin account exists in `tb_user`
- [ ] At least one group_leader account exists
- [ ] At least one employee account exists

---

## 1. Auth Flow

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1.1 | Visit `/` unauthenticated | Redirect to `/login` | `PASS / FAIL` | |
| 1.2 | Login with wrong password | Error message shown, no redirect | `PASS / FAIL` | |
| 1.3 | Login as admin | Redirect to dashboard, full nav visible | `PASS / FAIL` | |
| 1.4 | Login as group_leader | Redirect to dashboard, limited nav | `PASS / FAIL` | |
| 1.5 | Login as employee | Redirect to dashboard, minimal nav | `PASS / FAIL` | |
| 1.6 | Logout | Session cleared, redirect to `/login` | `PASS / FAIL` | |
| 1.7 | Visit `/machine` as employee | Warning banner shown, admin controls hidden | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 2. Dashboard (`/`)

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 2.1 | Load as admin | Stat cards render, no JS errors in console | `PASS / FAIL` | |
| 2.2 | Load as group_leader | Stat cards scoped to leader's groups | `PASS / FAIL` | |
| 2.3 | Load as employee | Stat cards scoped to own data | `PASS / FAIL` | |
| 2.4 | Recent scans table | Rows load, timestamps formatted correctly | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 3. Attendance Page (`/attendance`) — TASK-16

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 3.1 | Load as admin | All employees visible, date range filter works | `PASS / FAIL` | |
| 3.2 | Load as group_leader | Only leader's group members visible | `PASS / FAIL` | |
| 3.3 | Load as employee | Only own records visible | `PASS / FAIL` | |
| 3.4 | Admin: anomaly alerts | Late/early-leave flags shown | `PASS / FAIL` | |
| 3.5 | Admin: notes editor | Can add/edit note on a scan row | `PASS / FAIL` | |
| 3.6 | Non-admin: notes editor | Notes editor hidden or read-only | `PASS / FAIL` | |
| 3.7 | Date range filter | Changing dates re-fetches correctly | `PASS / FAIL` | |
| 3.8 | Pagination | Page size selector works, prev/next work | `PASS / FAIL` | |
| 3.9 | Quick summaries | Summary cards load without error | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 4. Attendance Review (`/attendance/review`) — TASK-16

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 4.1 | Access as admin | Review queue loads | `PASS / FAIL` | |
| 4.2 | Access as non-admin | 403 / redirect / hidden | `PASS / FAIL` | |
| 4.3 | Approve a revision | Status updates to approved | `PASS / FAIL` | |
| 4.4 | Reject a revision | Status updates to rejected | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 5. Report Page (`/report`) — TASK-17

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 5.1 | Load as admin | Pie chart renders with status breakdown | `PASS / FAIL` | |
| 5.2 | Load as admin | Bar chart renders with monthly data | `PASS / FAIL` | |
| 5.3 | Monthly target line | Target line visible on bar chart, labeled "(global config)" | `PASS / FAIL` | |
| 5.4 | Click pie slice | Drilldown table filters to that status | `PASS / FAIL` | |
| 5.5 | Drilldown pagination | Prev/next pages work | `PASS / FAIL` | |
| 5.6 | Admin drilldown | Discipline columns visible | `PASS / FAIL` | |
| 5.7 | Load as group_leader | Charts scoped to leader's groups | `PASS / FAIL` | |
| 5.8 | Non-admin drilldown | Discipline columns hidden | `PASS / FAIL` | |
| 5.9 | CSV export | Download triggers, file has correct headers | `PASS / FAIL` | |
| 5.10 | Group filter | Changing group re-fetches charts | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 6. Machine Page (`/machine`) — SDK Non-Blocking

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 6.1 | Load with no SDK env vars set | Page loads, connection card shows "Not Configured" pill (grey, not red) | `PASS / FAIL` | |
| 6.2 | No SDK: console errors | No uncaught exceptions in browser console | `PASS / FAIL` | |
| 6.3 | No SDK: status poll | 15s poll fires, returns gracefully (no error toast) | `PASS / FAIL` | |
| 6.4 | No SDK: queue actions | Admin action buttons visible but clicking shows "SDK not configured" error | `PASS / FAIL` | |
| 6.5 | Load as non-admin | Warning banner shown, all action panels hidden | `PASS / FAIL` | |
| 6.6 | Locale switch EN→ID | "Not Configured" pill text changes to "Belum Dikonfigurasi" | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 7. Employees (`/employees`)

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 7.1 | Load as admin | Employee list renders | `PASS / FAIL` | |
| 7.2 | Link employee to device user | Dropdown works, save succeeds | `PASS / FAIL` | |
| 7.3 | Employee detail (`/employees/[id]`) | Profile loads | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 8. Groups (`/groups`)

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 8.1 | Load as admin | Groups list renders | `PASS / FAIL` | |
| 8.2 | Create group | New group appears in list | `PASS / FAIL` | |
| 8.3 | Assign employee to group | Assignment persists on reload | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 9. Schedule (`/schedule`)

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 9.1 | Load weekly calendar | Shift cells render | `PASS / FAIL` | |
| 9.2 | Bulk group assignment | Assign shift to group for a week | `PASS / FAIL` | |
| 9.3 | CSV export | Download triggers | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 10. Locale / Theme

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 10.1 | Switch EN → ID | All visible UI text changes to Indonesian | `PASS / FAIL` | |
| 10.2 | Switch ID → EN | Reverts to English | `PASS / FAIL` | |
| 10.3 | Switch to light mode | Background becomes off-white, text near-black | `PASS / FAIL` | |
| 10.4 | Switch to dark mode | Background dark, text light | `PASS / FAIL` | |
| 10.5 | Locale persists on reload | Selected locale survives page refresh | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## 11. Console / Network Health

| # | Step | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 11.1 | Open DevTools console on dashboard | Zero `[Error]` entries on clean load | `PASS / FAIL` | |
| 11.2 | Open DevTools console on attendance | Zero `[Error]` entries | `PASS / FAIL` | |
| 11.3 | Open DevTools console on report | Zero `[Error]` entries | `PASS / FAIL` | |
| 11.4 | Open DevTools console on machine | Zero `[Error]` entries (no SDK configured) | `PASS / FAIL` | |
| 11.5 | Network tab: no 500 responses on load | All initial fetches return 200/204 | `PASS / FAIL` | |

**Section result**: `PASS / FAIL / PARTIAL`

---

## Overall F3 Result

| Section | Result |
|---------|--------|
| 1. Auth | |
| 2. Dashboard | |
| 3. Attendance | |
| 4. Attendance Review | |
| 5. Report | |
| 6. Machine | |
| 7. Employees | |
| 8. Groups | |
| 9. Schedule | |
| 10. Locale/Theme | |
| 11. Console/Network | |

**F3 Final Verdict**: `PASS / FAIL / PARTIAL`

**Blocking issues found**:
```
(list any FAIL items that block release)
```

**Non-blocking issues found**:
```
(list any FAIL items that are cosmetic or low-priority)
```
