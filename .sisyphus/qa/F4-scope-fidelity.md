# F4 — Scope Fidelity Check

**App**: EasyLink Frontend  
**Tester**: ___________________  
**Date**: ___________________  

> This checklist verifies that every feature in the 18-task architecture plan was actually shipped. Cross-reference against `docs/agent-context/next-session-master-board.md`.

---

## TASK-16: Leader / Employee Scope Partition

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| 16.1 | Admin sees all employees in attendance | Login as admin → `/attendance` → confirm all employees listed | `PASS / FAIL` | |
| 16.2 | Group leader sees only their group | Login as group_leader → `/attendance` → confirm only group members visible | `PASS / FAIL` | |
| 16.3 | Employee sees only own records | Login as employee → `/attendance` → confirm only own rows | `PASS / FAIL` | |
| 16.4 | API enforces scope server-side | Call `GET /api/attendance` with group_leader cookie → response only contains scoped data | `PASS / FAIL` | |
| 16.5 | Review queue admin-only | `GET /api/attendance/review` with non-admin cookie → 403 | `PASS / FAIL` | |
| 16.6 | Authorization adapter used (no inline role strings) | Code review: `lib/authz/authorization-adapter.ts` functions called in API routes | `PASS / FAIL` | |

**TASK-16 Verdict**: `PASS / FAIL / PARTIAL`

---

## TASK-17: Interactive Reporting

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| 17.1 | SVG pie chart renders | `/report` as admin → pie chart visible with colored slices | `PASS / FAIL` | |
| 17.2 | SVG bar chart renders | `/report` as admin → bar chart visible with monthly bars | `PASS / FAIL` | |
| 17.3 | Monthly target line present | Bar chart has a horizontal target line | `PASS / FAIL` | |
| 17.4 | Target line labeled "(global config)" | Target line label includes "(global config)" text | `PASS / FAIL` | |
| 17.5 | Click pie slice → drilldown filters | Click a slice → drilldown table shows only that status | `PASS / FAIL` | |
| 17.6 | Drilldown pagination works | Drilldown has prev/next, page counter updates | `PASS / FAIL` | |
| 17.7 | Admin sees discipline columns | Drilldown table as admin has discipline-related columns | `PASS / FAIL` | |
| 17.8 | Non-admin discipline columns hidden | Login as group_leader → drilldown has no discipline columns | `PASS / FAIL` | |
| 17.9 | Role-scoped API payload | `GET /api/report` with group_leader cookie → response excludes discipline fields | `PASS / FAIL` | |
| 17.10 | No new npm dependencies added | `package.json` has no recharts/chart.js/d3 added | `PASS / FAIL` | |

**TASK-17 Verdict**: `PASS / FAIL / PARTIAL`

---

## TASK-18: Readability Hardening

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| 18.1 | Semantic CSS classes exist | `app/globals.css` contains `.panel-card`, `.table-shell`, `.table-head-cell`, `.table-cell`, `.control-input`, `.control-select`, `.pill-button`, `.btn-action`, `.btn-outline`, `.btn-danger` | `PASS / FAIL` | |
| 18.2 | Light mode off-white background | Switch to light mode → background is off-white (not pure white) | `PASS / FAIL` | |
| 18.3 | Light mode near-black text | Light mode text is near-black (not pure black) | `PASS / FAIL` | |
| 18.4 | EN locale works | All pages render in English when EN selected | `PASS / FAIL` | |
| 18.5 | ID locale works | All pages render in Indonesian when ID selected | `PASS / FAIL` | |
| 18.6 | Dark mode classes defined | Semantic classes have dark mode variants in globals.css | `PASS / FAIL` | |

**TASK-18 Verdict**: `PASS / FAIL / PARTIAL`

---

## P0: Security Fixes

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| P0.1 | Auth secret throws in prod if missing | `lib/auth-session.ts` — `AUTH_SECRET` check throws when `NODE_ENV=production` and var absent | `PASS / FAIL` | Code review |
| P0.2 | TLS bypass gated to non-production | `lib/easylink-sdk-client.js` line 3 — `NODE_ENV !== 'production'` guard present | `PASS / FAIL` | Code review |
| P0.3 | No hardcoded `1234` password in UI | Search codebase for `1234` — not present in any page or API route | `PASS / FAIL` | Code review |
| P0.4 | DB defaults throw in prod | `lib/db.js` — missing DB env vars throw when `NODE_ENV=production` | `PASS / FAIL` | Code review |

**P0 Verdict**: `PASS / FAIL / PARTIAL`

---

## P1: Code Cleanup

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| P1.1 | Root `page.jsx` duplicate removed | No `page.jsx` at project root (only `app/page.jsx`) | `PASS / FAIL` | |
| P1.2 | Root `sidebar.jsx` duplicate removed | No `sidebar.jsx` at project root | `PASS / FAIL` | |
| P1.3 | `lib/constants.js` exists with `PAGE_SIZE_OPTIONS` | File exists, exports `PAGE_SIZE_OPTIONS` array | `PASS / FAIL` | |
| P1.4 | `hooks/use-auth-session.js` exists | File exists and exports auth fetch hook | `PASS / FAIL` | |

**P1 Verdict**: `PASS / FAIL / PARTIAL`

---

## P2: Quality Gates

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| P2.1 | `.eslintrc.json` exists | File present at project root with `next/core-web-vitals` | `PASS / FAIL` | |
| P2.2 | `npm run lint` script exists | `package.json` has `"lint"` script | `PASS / FAIL` | |
| P2.3 | Playwright specs exist | `tests/auth.spec.ts`, `tests/attendance.spec.ts`, `tests/machine.spec.ts` present | `PASS / FAIL` | |
| P2.4 | `npm run typecheck` passes | Run `npm run typecheck` → exit 0, no errors | `PASS / FAIL` | |

**P2 Verdict**: `PASS / FAIL / PARTIAL`

---

## SDK Non-Blocking (Latest Fix)

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| SDK.1 | Status API returns gracefully without env vars | `GET /api/machine/status` with no SDK env vars → `{ ok: true, status: "offline", not_configured: true }` | `PASS / FAIL` | |
| SDK.2 | Machine page shows "Not Configured" not "Offline" | Load `/machine` with no SDK env vars → grey pill, not red | `PASS / FAIL` | |
| SDK.3 | POST to machine API returns 503 without env vars | `POST /api/machine` with no SDK env vars → `{ ok: false, not_configured: true, status: 503 }` | `PASS / FAIL` | |

**SDK Non-Blocking Verdict**: `PASS / FAIL / PARTIAL`

---

## Ops Recovery

| # | Requirement | Verification Method | Result | Notes |
|---|-------------|---------------------|--------|-------|
| OPS.1 | `runPowerShell` uses `-EncodedCommand` | `lib/ops-recovery.js` — uses base64 encoded command, not `-Command` with positional args | `PASS / FAIL` | Code review |

**Ops Recovery Verdict**: `PASS / FAIL / PARTIAL`

---

## Overall F4 Result

| Area | Verdict |
|------|---------|
| TASK-16 Scope Partition | |
| TASK-17 Interactive Reporting | |
| TASK-18 Readability | |
| P0 Security | |
| P1 Cleanup | |
| P2 Quality Gates | |
| SDK Non-Blocking | |
| Ops Recovery | |

**F4 Final Verdict**: `PASS / FAIL / PARTIAL`

**Features missing or incomplete**:
```
(list any items that were planned but not shipped)
```

**Features shipped but not in original plan**:
```
(list any bonus work done)
```
