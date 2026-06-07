# Session Handoff — Auth Fix Plan

## Session Goal
Finish `.sisyphus/plans/auth-fix.md` (`auth-fix` plan).

## Current Completion State
- Tasks 2-11: complete.
- Task 1: open.
- Final wave F1-F4: cannot pass while Task 1 remains open.

## What Was Completed
### Auth/session code
- `lib/auth-session.ts`
- `app/api/auth/login/route.js`
- `app/api/auth/me/route.js`
- `hooks/use-auth-session.js`
- `lib/auth-login-helpers.js`

### Auth tests added/expanded
- `tests/auth-hardening.test.js`
- `tests/auth-session-compat.test.js`
- `tests/auth-response-contract.test.js`
- `tests/auth-login-route.test.js`
- `tests/use-auth-session.test.js`

### Prior verification state
- scoped auth tests passed
- build passed in prior healthy runtime window
- lint still has unrelated repo debt on home/docs files
- Task 9-11 plan checkboxes already updated

## Open Plan Task
### Task 1 — Capture exact 429 reproduction and auth network trace
Plan acceptance still unmet because these remain unchecked:
- successful account login trace
- successful employee NIP login trace

Already satisfied from evidence:
- failing/429 path captured
- first proven 429 route identified as `/api/auth/me`
- root-cause class documented with proof

## Most Important Evidence Files
### Primary summary
- `.sisyphus/notepads/auth-fix/auth-fix-evidence-and-blockers.md`

### Raw evolving blocker log
- `.sisyphus/notepads/auth-fix/problems.md`

### Verification/lint notes
- `.sisyphus/notepads/auth-fix/issues.md`
- `.sisyphus/notepads/auth-fix/learnings.md`

## Fresh Runtime Facts To Trust
### DB snapshot
- active standalone auth row: `admin01`
- active employee auth row: `ADMIN01`
- inactive employee rows: `HRD01`, `99999`
- no `employee001` row in current local DB snapshot

### Repo/test fixture mismatch
Repo hints mention different identities:
- `admin001`
- `leader001`
- `employee001`
- often with `password123`

Current local DB does not match that fixture set.

### Credential results already tested
#### Earlier invalid credential results
- `admin01 / password` -> `401 Invalid credentials`
- `ADMIN01 / password123` -> `401 Invalid credentials`
- `nip=ADMIN01 / password123` -> `401 Invalid credentials`

#### User-supplied candidate
- `ADMIN01 / Admin@123`

Fresh results after dev restart:
- `GET /login` -> `200`
- `GET /api/auth/me` -> `401 Login required`
- `login_id=ADMIN01 / Admin@123` -> `409 Auth identity conflict`
- `nip=ADMIN01 / Admin@123` -> `409 Auth identity conflict`
- `login_id=admin01 / Admin@123` -> `409 Auth identity conflict`

### Offline hash fact
Direct bcrypt compare says `Admin@123` matches neither:
- `auth_accounts.admin01.password_hash`
- `tb_karyawan_auth.ADMIN01.password_hash`

This mismatch is important: runtime behavior and direct stored-hash reality are not lining up cleanly.

## Runtime Instability Seen During Session
These failures happened in different windows:
- MySQL down -> `/api/auth/login` `500`
- stale `.next` chunks -> `/login` broken / 404 refresh loops
- dev server fully down on `localhost:3000`
- healthy window after deleting `.next` and restarting `npm run dev`

So do not assume latest runtime state is stable unless you verify both:
- port `3000` alive
- port `3306` alive

## Exact Next Steps For Next Agent / Human
1. Verify runtime alive:
   - `localhost:3000`
   - `localhost:3306`
2. Read:
   - `.sisyphus/notepads/auth-fix/auth-fix-evidence-and-blockers.md`
   - `.sisyphus/notepads/auth-fix/problems.md`
3. Decide one of:
   - provide real current credentials for `admin01` and `ADMIN01`
   - restore/load seed data matching `admin001 / leader001 / employee001`
   - inspect runtime auth data source to explain why `Admin@123` returns `409` despite offline hash mismatch
4. Once valid success-path creds exist, rerun Task 1 with clean browser context and capture:
   - every `/api/auth/*` request for successful account login
   - every `/api/auth/*` request for successful employee NIP login
   - whether any first `429` occurs in those success-path flows
5. Then rerun final wave reviewers.

## Best Workaround Direction
If consulting someone else, ask specifically:
- Which credentials are actually valid for current local DB?
- Is there alternate identity/canonical auth source besides visible `auth_accounts` and `tb_karyawan_auth` rows?
- Why does `Admin@123` produce `409 Auth identity conflict` while offline bcrypt says it should fail both visible active hashes?
- Should local DB be reseeded to `admin001 / leader001 / employee001` fixture set before any more Task 1 QA?

## Final Truth At Session End
- Code work done.
- Remaining block is environment/data truth.
- Do **not** mark Task 1 complete until successful account and employee traces are actually captured.
