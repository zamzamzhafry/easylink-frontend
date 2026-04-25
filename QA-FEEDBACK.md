# QA Feedback — EasyLink Frontend

> **How to use this file**
> Work through each section top to bottom. For every test case:
> - Tick `[x]` if it passes
> - Leave `[ ]` and write your finding in the **Feedback / Bug** column
> - Use the free-form **Notes** block at the bottom of each section for anything that doesn't fit a row
> - When done, set the **Section verdict** to `PASS`, `FAIL`, or `PARTIAL`

---

## Session Info

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Build / commit | |
| Browser | |
| OS | |
| Role(s) tested | `admin` / `group_leader` / `employee` |
| SDK connected? | `yes` / `no` |
| Locale tested | `EN` / `ID` / `both` |

---

## 1. Auth

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 1.1 | Visit `/` unauthenticated → redirects to `/login` | `[ ]` | |
| 1.2 | Wrong password → error shown, no redirect | `[ ]` | |
| 1.3 | Login as **admin** → full nav, dashboard loads | `[ ]` | |
| 1.4 | Login as **group_leader** → limited nav, dashboard loads | `[ ]` | |
| 1.5 | Login as **employee** → minimal nav, dashboard loads | `[ ]` | |
| 1.6 | Logout → session cleared, back to `/login` | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```
(write anything here)
```

---

## 2. Dashboard (`/`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 2.1 | Stat cards render without JS errors | `[ ]` | |
| 2.2 | Admin sees all-employee stats | `[ ]` | |
| 2.3 | Group leader stats scoped to their groups | `[ ]` | |
| 2.4 | Employee stats scoped to own data | `[ ]` | |
| 2.5 | Recent scans table loads, timestamps readable | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 3. Attendance (`/attendance`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 3.1 | Admin sees all employees | `[ ]` | |
| 3.2 | Group leader sees only their group members | `[ ]` | |
| 3.3 | Employee sees only own records | `[ ]` | |
| 3.4 | Date range filter re-fetches correctly | `[ ]` | |
| 3.5 | Pagination — page size selector works | `[ ]` | |
| 3.6 | Pagination — prev / next work | `[ ]` | |
| 3.7 | Anomaly flags (late / early leave) visible for admin | `[ ]` | |
| 3.8 | Notes editor visible for admin, hidden for non-admin | `[ ]` | |
| 3.9 | Quick summaries cards load without error | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 4. Attendance Review (`/attendance/review`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 4.1 | Admin can access review queue | `[ ]` | |
| 4.2 | Non-admin gets 403 / redirect | `[ ]` | |
| 4.3 | Approve a revision → status updates | `[ ]` | |
| 4.4 | Reject a revision → status updates | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 5. Report (`/report`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 5.1 | Pie chart renders with status breakdown | `[ ]` | |
| 5.2 | Bar chart renders with monthly data | `[ ]` | |
| 5.3 | Monthly target line visible on bar chart | `[ ]` | |
| 5.4 | Target line labeled "(global config)" | `[ ]` | |
| 5.5 | Click pie slice → drilldown filters to that status | `[ ]` | |
| 5.6 | Drilldown pagination works | `[ ]` | |
| 5.7 | Admin drilldown shows discipline columns | `[ ]` | |
| 5.8 | Non-admin drilldown hides discipline columns | `[ ]` | |
| 5.9 | Group filter changes chart data | `[ ]` | |
| 5.10 | CSV export downloads with correct headers | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 6. Machine (`/machine`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 6.1 | No SDK env vars → page loads, shows grey "Not Configured" pill | `[ ]` | |
| 6.2 | No SDK env vars → no uncaught errors in browser console | `[ ]` | |
| 6.3 | No SDK env vars → 15s status poll fires silently (no error toast) | `[ ]` | |
| 6.4 | No SDK env vars → queuing an action shows "SDK not configured" error | `[ ]` | |
| 6.5 | Non-admin → warning banner shown, all action panels hidden | `[ ]` | |
| 6.6 | SDK connected → connection card shows correct status (online / degraded) | `[ ]` | |
| 6.7 | Queue an action (info / time) → job appears in job list | `[ ]` | |
| 6.8 | Job polling → status updates to success / failed | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 7. Employees (`/employees`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 7.1 | Employee list renders | `[ ]` | |
| 7.2 | Link employee to device user — save succeeds | `[ ]` | |
| 7.3 | Employee detail page loads (`/employees/[id]`) | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 8. Groups (`/groups`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 8.1 | Groups list renders | `[ ]` | |
| 8.2 | Create group → appears in list | `[ ]` | |
| 8.3 | Assign employee to group → persists on reload | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 9. Schedule (`/schedule`)

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 9.1 | Weekly calendar renders shift cells | `[ ]` | |
| 9.2 | Bulk group assignment works | `[ ]` | |
| 9.3 | CSV export downloads | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 10. Locale & Theme

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 10.1 | Switch EN → ID → all UI text in Indonesian | `[ ]` | |
| 10.2 | Switch ID → EN → reverts to English | `[ ]` | |
| 10.3 | Light mode → off-white background, near-black text | `[ ]` | |
| 10.4 | Dark mode → dark background, light text | `[ ]` | |
| 10.5 | Locale choice persists after page refresh | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## 11. Console & Network Health

| # | Test | Pass? | Feedback / Bug |
|---|------|-------|----------------|
| 11.1 | Dashboard — zero `[Error]` in DevTools console on clean load | `[ ]` | |
| 11.2 | Attendance — zero `[Error]` in console | `[ ]` | |
| 11.3 | Report — zero `[Error]` in console | `[ ]` | |
| 11.4 | Machine (no SDK) — zero `[Error]` in console | `[ ]` | |
| 11.5 | Network tab — no 500 responses on initial page loads | `[ ]` | |

**Section verdict:** `PASS / FAIL / PARTIAL`

**Notes:**
```

```

---

## Summary

| Section | Verdict |
|---------|---------|
| 1. Auth | |
| 2. Dashboard | |
| 3. Attendance | |
| 4. Attendance Review | |
| 5. Report | |
| 6. Machine | |
| 7. Employees | |
| 8. Groups | |
| 9. Schedule | |
| 10. Locale & Theme | |
| 11. Console & Network | |

**Overall verdict:** `PASS / FAIL / PARTIAL`

---

## Blocking Issues

> Issues that must be fixed before release.

```
(paste here — one issue per line, include page + steps to reproduce)
```

---

## Non-Blocking Issues

> Cosmetic or low-priority — can ship, fix later.

```
(paste here)
```

---

## General Feedback

```
(anything else — UX impressions, confusing flows, suggestions)
```
