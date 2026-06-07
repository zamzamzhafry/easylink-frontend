# Auth Fix Evidence, Problems, and Needed Solution

## Scope
This document summarizes current evidence for `.sisyphus/plans/auth-fix.md`, especially open Task 1: `Capture exact 429 reproduction and auth network trace`.

## Plan Status
- Tasks 2-11: completed and previously verified.
- Task 1: still open.
- Final wave: blocked because Task 1 acceptance requires successful account login trace and successful employee NIP login trace.

## What Was Fixed in Code
These repo code changes were already completed earlier in session and are not current blocker:
- `lib/auth-session.ts` now uses helper-backed encode/decode with explicit `subject_type` support and legacy compatibility.
- `app/api/auth/login/route.js` now normalizes auth responses and resolves lane collisions fail-closed.
- `app/api/auth/me/route.js` now uses shared normalized auth user mapping.
- `hooks/use-auth-session.js` now caches session results in `sessionStorage` to reduce remount/retry fanout.
- Auth test coverage was expanded across:
  - `tests/auth-hardening.test.js`
  - `tests/auth-session-compat.test.js`
  - `tests/auth-response-contract.test.js`
  - `tests/auth-login-route.test.js`
  - `tests/use-auth-session.test.js`

## Evidence Collected

### 1. Proven 429 path
From earlier runtime reproductions:
- Clean `/login` context produced unauthenticated `GET /api/auth/me -> 401`.
- Forced unauthenticated fanout/remount churn proved first auth `429` appears on `GET /api/auth/me` from same browser/IP.
- Root-cause class proven for this path: invalid session loop or client fanout.
- No rate-limit loosening was applied.

### 2. Runtime instability observed during Task 1
Different repro windows showed different external runtime states:
- `POST /api/auth/login -> 500` due MySQL `ECONNREFUSED` on `localhost:3306`.
- `/login` page broken by stale `.next` artifacts with missing chunk files and refresh-loop behavior.
- Dev server sometimes refused connection on `localhost:3000` and needed restart.
- After clearing `.next` and restarting dev server, `/login` returned `200` again.

### 3. Current DB-backed identity reality
Verified from local `demo_easylinksdk` snapshot:
- `auth_accounts` active row: `admin01`
- `tb_karyawan_auth` active row: `ADMIN01`
- inactive rows: `HRD01`, `99999`
- no `employee001` row exists in current local employee auth table

### 4. Repo fixture hints do not match current DB snapshot
Repo/docs/tests still hint at different fixture set:
- Playwright defaults use `admin001` / `password123`
- runbook mentions `admin001`, `leader001`, `employee001`
- current standalone auth handoff notes describe actual local row as `admin01`

This means repo fixture assumptions and current local DB are not aligned.

### 5. Credential attempts and outcomes
Previously verified attempts:
- `{"login_id":"admin01","password":"password"}` -> `401 {"ok":false,"error":"Invalid credentials"}`
- `{"login_id":"ADMIN01","password":"password123"}` -> `401 {"ok":false,"error":"Invalid credentials"}`
- `{"nip":"ADMIN01","password":"password123"}` -> `401 {"ok":false,"error":"Invalid credentials"}`

New user-supplied candidate:
- `ADMIN01 / Admin@123`

Fresh verified outcomes after restarting dev server:
- `GET /login` -> `200`
- `GET /api/auth/me` -> `401 {"ok":false,"error":"Login required."}`
- `{"login_id":"ADMIN01","password":"Admin@123"}` -> `409 {"ok":false,"error":"Auth identity conflict."}`
- `{"nip":"ADMIN01","password":"Admin@123"}` -> `409 {"ok":false,"error":"Auth identity conflict."}`
- `{"login_id":"admin01","password":"Admin@123"}` -> `409 {"ok":false,"error":"Auth identity conflict."}`

### 6. Offline hash checks
Direct offline bcrypt comparisons against current stored hashes showed:
- `Admin@123` does **not** match current stored hash for `auth_accounts.admin01`
- `Admin@123` does **not** match current stored hash for `tb_karyawan_auth.ADMIN01`

Earlier likely-password checks also failed for both active hashes:
- `password`
- `password123`
- `admin01`
- `ADMIN01`
- `admin001`
- `employee001`

## Why This Is a Blocker
Task 1 acceptance in plan still requires:
- successful account login trace listing every `/api/auth/*` call
- successful employee NIP login trace listing every `/api/auth/*` call
- failing/429 path evidence
- root-cause hypothesis with proof

We have the failing/429 evidence and root-cause proof.
We **do not** have successful account login trace or successful employee NIP login trace.

## Main Problem Statement
Current environment is inconsistent in two important ways:
1. **Runtime/process instability**
   - `.next` artifacts and dev server state can flip between healthy and broken.
2. **Credential/data inconsistency**
   - current DB rows do not match repo fixture hints
   - known candidate passwords fail direct bcrypt comparison
   - yet runtime can still return `409 Auth identity conflict` for `Admin@123`, which suggests auth path is progressing into lane-collision logic even though offline hash checks say the password should not validate against current visible active hashes

This means current local environment is not reliable enough to claim successful login support from captured evidence alone.

## Solution Needed
One of these is required before Task 1 can be closed honestly:

### Option A — provide real current credentials
Provide valid credentials for current local rows:
- standalone account: `admin01`
- active employee auth row: `ADMIN01`

### Option B — restore/load known seed data
Restore DB seed/data that matches repo/test assumptions, especially identities such as:
- `admin001`
- `leader001`
- `employee001`

### Option C — external runtime stabilization first
Before trying more credentials, stabilize local runtime:
- keep MySQL running on `localhost:3306`
- keep Next dev server stable on `localhost:3000`
- rebuild `.next` from clean state if chunk/module errors reappear

## Recommended Workaround Investigation
Because `Admin@123` produced runtime `409 Auth identity conflict` despite offline hash mismatch, next investigation should focus on:
1. confirming exact row(s) and hash source actually used during runtime auth
2. checking whether alternate/canonical identity data or views are feeding lane resolution indirectly
3. capturing server-side auth-route logs around `verifyPassword()` and collision path without leaking secrets
4. verifying whether `findAuthAccountByLoginId`, `createAuthContextByLoginId`, and `createAuthContextByNip` are reading from unexpected joined/canonical sources

## Bottom Line
- Auth code changes are done.
- Task 1 is blocked by external/runtime/data truth, not by unfinished code work.
- Session should continue only after external credential/seed/runtime clarification.
