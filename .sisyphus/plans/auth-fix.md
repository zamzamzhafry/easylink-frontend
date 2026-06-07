# Auth Hardening + 429 Login Fix Plan

## TL;DR

> **Quick Summary**: Wire dormant auth hardening helpers into session/login/me flows, preserve legacy compatibility, fail closed on identity ambiguity, and stop auth 429 storms by fixing root retry/loop behavior before touching rate limits.
>
> **Deliverables**:
> - `lib/auth-session.ts` uses helper-backed token encode/decode with explicit `subject_type` support and legacy decode compatibility.
> - `app/api/auth/login/route.js` returns normalized auth user objects and preserves account vs employee lane separation.
> - `app/api/auth/me/route.js` uses shared `buildNormalizedAuthUser()` mapping.
> - Tests cover helper integration, typed cookie routing, legacy cookie decode, mismatch guard, and auth 429/loop behavior.
> - Minimal client/middleware adjustment only if evidence shows 429 caused by repeated `/api/auth/me` calls or proxy IP collision.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves + final verification
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 8 → Final Verification

---

## Context

### Original Request
User asked: "make a fix plan and then do momus review plan too"

### Interview Summary
**Key Discussions**:
- Latest commit `a913762` added auth hardening helpers and tests, but helpers are not wired into production auth paths.
- User wants a fix plan, then Momus plan review.
- Scope stays focused on auth user/login/429 issue; no code implementation in this planning session.

**Research Findings**:
- `lib/auth-hardening-helpers.js` exists with `normalizeSubjectType`, `encodeSessionToken`, `decodeSessionToken`, `hasPrivilegeMismatch`, and `buildNormalizedAuthUser`.
- `lib/auth-session.ts:236-286` has local `encodeSession`/`decodeSession`; local decode ignores `subject_type` and swallows parse errors.
- `lib/auth-session.ts:637-663` dispatches by subject prefixes (`account:`, `nip:`, `pin:`), then legacy waterfall: account → NIP → legacy PIN.
- `lib/auth-session.ts:665-705` prefixes subject string in `setAuthCookie()` even though helper supports explicit `st` subject type.
- `app/api/auth/login/route.js:40-76` handles standalone `auth_accounts` login and sets account cookie.
- `app/api/auth/login/route.js:79-133` handles `tb_karyawan_auth` NIP login and sets employee NIP cookie.
- `app/api/auth/me/route.js:11-31` manually maps normalized user response; helper duplicates this mapping and should become source of truth.
- `middleware.ts:84-92` returns 429 for `/api/auth/*` after 30 requests/min/IP; `middleware.ts:95-103` returns 429 for all `/api/*` after 120 requests/min/IP.
- `hooks/use-auth-session.js:16-55` already has 30s cache and inflight request de-dupe; plan must verify if real 429 comes from another loop, forced refresh, shared IP, or login retry storm.
- `package.json` has `typecheck`, `lint`, `build`, but no test script; direct `node --test tests/auth-hardening.test.js` should be used unless executor finds project-specific runner.

### Metis Review
**Identified Gaps** (addressed):
- Need pin down exact 429 symptom and route. Plan includes evidence-first task before changes.
- Need preserve deployed cookie compatibility. Plan includes dual decode for old prefix cookies and new explicit `st` cookies.
- Need decide mismatch policy. Plan default: fail closed with invalid session/401 and structured server warning, not downgrade silently.
- Need avoid rate-limit weakening. Plan forbids loosening limits unless evidence proves proxy/IP false positive.
- Need include `/api/auth/me` because normalized helper duplicates its mapping.
- Need tests for integration, not only helper unit tests.

---

## Work Objectives

### Core Objective
Stabilize EasyLink auth by making session identity lane explicit, ensuring normalized user responses come from one shared mapper, preserving safe legacy compatibility, and preventing auth endpoint 429 storms from repeated failed auth flows.

### Concrete Deliverables
- Helper-backed session token encode/decode in `lib/auth-session.ts`.
- Explicit `subject_type` routing for account, employee NIP, and legacy PIN.
- Legacy cookie compatibility for currently deployed prefix-based `sub` payloads and older `pin` payloads.
- Normalized user mapping used by login and `/api/auth/me`.
- Privilege mismatch guard applied where account and employee identity lanes can disagree.
- Tests for session decode/routing, login response normalization, `/api/auth/me` response normalization, and rate-limit/loop prevention.

### Definition of Done
- [x] `node --test tests/auth-hardening.test.js` passes.
- [ ] New integration tests for auth session behavior pass with documented command.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes or pre-existing lint failures are documented with exact file:line.
- [ ] Browser/API QA proves login no longer produces `/api/auth/*` 429 under normal admin and employee login flows.
  - [x] Legacy cookie decode compatibility is verified by automated test.

### Must Have
- Helper functions are actually imported and used in production auth paths.
- Existing account login and employee NIP login remain supported.
- Old deployed cookies do not break immediately unless invalid/expired.
- New sessions carry unambiguous identity lane.
- Auth mismatch cannot silently broaden privileges.
- `/api/auth/me` and login responses share one normalized mapping.

### Must NOT Have (Guardrails)
- No full auth rewrite.
- No database schema migration unless a test/proof shows unavoidable need.
- No blind rate limit increase as first fix.
- No removal of legacy compatibility in this work.
- No redirect to login on transient API failure or 429 alone.
- No interval polling/fetch fanout added for auth status.
- No direct SQL privilege mutation flow changes beyond auth read behavior.
- No unrelated cleanup in `ops/landing-page/`.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: PARTIAL (`tests/auth-hardening.test.js`; no package test script)
- **Automated tests**: Tests-after
- **Framework**: Node built-in test runner (`node --test`) unless executor discovers existing preferred runner
- **If TDD**: Not selected. Add/extend tests immediately after each implementation unit.
- **Evidence policy**: `.sisyphus/evidence/` files are produced during execution only and are not committed by default.
- **Legacy flag defaults**: preserve current defaults from `lib/auth-session.ts` (`EASYLINK_ENABLE_LEGACY_PIN_FALLBACK` default enabled; `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` default enabled).
- **Naming contract**: cookie wire payload uses `st`; decoded runtime/session object uses `subject_type`; API response user field uses `subject_type`. Never leak raw `st` key in API responses.
- **Helper boundary**: `auth-session.ts` remains owner of secret, HMAC signing, TTL, and cookie attributes. `lib/auth-hardening-helpers.js` owns payload shape normalization/parsing via injected `sign`, `base64UrlEncode`, and `base64UrlDecode`; do not double-sign tokens.

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright - navigate, login, assert DOM/network, screenshot.
- **API/Backend**: Use Bash/curl or Node fetch scripts - assert status + response fields.
- **Library/Module**: Use Node test runner - import/call functions, compare output.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - investigation + contracts):
├── Task 1: Capture exact 429 reproduction and auth network trace [testing]
├── Task 2: Add/extend auth hardening helper tests [quick]
├── Task 3: Define session payload compatibility contract in tests [quick]
├── Task 4: Map normalized auth response contract [quick]

Wave 2 (After Wave 1 - core implementation, parallel where safe):
├── Task 5: Wire helper-backed encode/decode in auth-session [unspecified-high]
├── Task 6: Normalize login responses and mismatch behavior [unspecified-high]
├── Task 7: Normalize /api/auth/me response [quick]
├── Task 8: Fix verified auth 429 loop/root cause [unspecified-high]

Wave 3 (After Wave 2 - integration hardening):
├── Task 9: Add auth integration/regression tests [testing]
├── Task 10: Add runtime logging and rollback knobs [quick]
├── Task 11: Run build/type/lint and fix scoped failures [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 6/8 → Task 9 → Task 11 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4
```

### Dependency Matrix

- **1**: none → 8, 9, F3
- **2**: none → 5, 9
- **3**: none → 5, 9
- **4**: none → 6, 7, 9
- **5**: 2, 3 → 6, 7, 9, 10, 11
- **6**: 4, 5 → 9, 11
- **7**: 4, 5 → 9, 11
- **8**: 1 → 9, 11
- **9**: 5, 6, 7, 8 → 11, F1-F4
- **10**: 5 → 11, F1-F4
- **11**: 9, 10 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `testing` + `playwright`, T2-T4 → `quick`. To avoid test-file conflicts, T2 owns `tests/auth-hardening.test.js`, T3 must create/use `tests/auth-session-compat.test.js`, and T4 must create/use `tests/auth-response-contract.test.js`.
- **Wave 2**: 4 tasks — T5/T6/T8 → `unspecified-high`, T7 → `quick`
- **Wave 3**: 3 tasks — T9 → `testing`, T10 → `quick`, T11 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `playwright`, F4 → `deep`

---

## TODOs

- [x] 1. Capture exact 429 reproduction and auth network trace

  **What to do**:
  - Reproduce normal login and reported failing login from a clean browser context.
  - Capture all `/api/auth/*` requests with method, status, timestamp, and initiator.
  - Identify whether 429 happens before login, after cookie set, during `/api/auth/me`, or due to shared proxy IP.
  - Record whether `x-forwarded-for` / `x-real-ip` contains useful client IP in deployment/dev reproduction.

  **Must NOT do**:
  - Do not change rate limits during investigation.
  - Do not assume `/api/auth/me` is root cause without network evidence.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: Needs reproducible browser/API evidence, not code changes.
  - **Skills**: [`playwright`]
    - `playwright`: Required for browser network capture and login flow evidence.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI design work.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 8, Task 9, Final QA
  - **Blocked By**: None

  **References**:
  - `middleware.ts:84-92` - Auth endpoint 429 source (`RATE_LIMIT_MAX_AUTH = 30`).
  - `middleware.ts:95-103` - General API 429 source (`RATE_LIMIT_MAX_API = 120`).
  - `hooks/use-auth-session.js:16-55` - Existing session cache/inflight de-dupe; verify if another caller bypasses this.
  - `app/api/auth/login/route.js:19-141` - Login endpoint behavior to reproduce.
  - `app/api/auth/me/route.js:5-32` - Session hydration endpoint to monitor.

  **Acceptance Criteria**:
  - [x] Evidence file lists every `/api/auth/*` call during successful account login.
  - [x] Evidence file lists every `/api/auth/*` call during successful employee NIP login.
  - [x] Evidence file captures failing/429 path with exact route that first returns 429.
  - [x] Root-cause hypothesis states one of: client retry/fanout, invalid session loop, login resubmit, proxy shared IP, or unknown with proof.

  **QA Scenarios**:
  ```
  Scenario: Successful login does not exceed auth limit
    Tool: Playwright
    Preconditions: Dev server running; known valid account login available via env/test fixture or documented seed user. If no safe fixture exists, record credential fixture blocker without creating new users.
    Steps:
      1. Open `/login` in clean browser context.
      2. Fill `input[name="login_id"]` with valid account login and `input[name="password"]` with valid password.
      3. Click `button[type="submit"]`.
      4. Capture network requests whose URL contains `/api/auth/` for 60 seconds.
    Expected Result: No `/api/auth/*` response has status 429; total auth requests <= 5.
    Failure Indicators: Any 429, repeated `/api/auth/me` loop, or >5 auth requests without user action.
    Evidence: .sisyphus/evidence/task-1-success-login-network.json

  Scenario: Invalid login remains bounded
    Tool: Playwright
    Preconditions: Dev server running; clean browser context.
    Steps:
      1. Open `/login`.
      2. Fill `input[name="login_id"]` with `invalid-user-429-check` and `input[name="password"]` with `wrong-password`.
      3. Click `button[type="submit"]` once.
      4. Capture `/api/auth/*` network traffic for 60 seconds.
    Expected Result: Login returns 401 once; no 429; no automatic repeated login POST.
    Evidence: .sisyphus/evidence/task-1-invalid-login-network.json
  ```

  **Evidence to Capture**:
  - [ ] Browser network JSON.
  - [ ] Screenshot of final login/dashboard state.

  **Commit**: NO

- [x] 2. Add/extend auth hardening helper tests

  **What to do**:
  - Extend `tests/auth-hardening.test.js` to cover helper behavior needed by production integration. This task is the only owner of `tests/auth-hardening.test.js` edits.
  - Add tests for explicit `st` values: `account`, `employee_nip`, `legacy_pin`, and unknown subject type.
  - Add test for malformed token parse failure and expected logging policy if implementation logs parse errors.

  **Must NOT do**:
  - Do not assert token secret values or leak token contents in logs.
  - Do not rewrite helpers for style only.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused test expansion in one existing test file.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Domain overlap with regression tests for auth helpers.
  - **Skills Evaluated but Omitted**:
    - `tdd`: Tests-after chosen, not strict TDD.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5, Task 9
  - **Blocked By**: None

  **References**:
  - `tests/auth-hardening.test.js` - Existing Node test patterns and helper imports.
  - `lib/auth-hardening-helpers.js:1-85` - Public helper functions under test.
  - `package.json:5-16` - No test script; use direct `node --test`.

  **Acceptance Criteria**:
  - [x] `tests/auth-hardening.test.js` covers all valid `subject_type` values.
  - [x] Unknown `subject_type` normalizes to `undefined`/null behavior as helper defines.
  - [x] `node --test tests/auth-hardening.test.js` passes.

  **QA Scenarios**:
  ```
  Scenario: Helper test suite passes
    Tool: Bash
    Preconditions: Dependencies installed.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Capture stdout/stderr and exit code.
    Expected Result: Exit code 0; all tests pass.
    Failure Indicators: Non-zero exit code or failed assertion.
    Evidence: .sisyphus/evidence/task-2-node-test.txt

  Scenario: Malformed token does not authenticate
    Tool: Bash
    Preconditions: Tests include malformed token case.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js --test-name-pattern malformed` if supported, otherwise full suite.
      2. Verify decoded result is null.
    Expected Result: Malformed token returns null and no token content appears in logs.
    Evidence: .sisyphus/evidence/task-2-malformed-token.txt
  ```

  **Evidence to Capture**:
  - [x] Node test output.

  **Commit**: NO unless user explicitly asks
  - Message: `test(auth): expand hardening helper coverage`
  - Files: `tests/auth-hardening.test.js`
  - Pre-commit: `node --test tests/auth-hardening.test.js`

- [x] 3. Define session payload compatibility contract in tests

  **What to do**:
  - Add tests documenting old and new cookie payload compatibility before implementation in a new file such as `tests/auth-session-compat.test.js`; do not edit `tests/auth-hardening.test.js` unless coordinating with Task 2 owner.
  - Cover current deployed prefix payloads: `sub: "account:..."`, `sub: "nip:..."`, `sub: "pin:..."`.
  - Cover helper-style explicit subject type payload: `sub: "...", st: "account" | "employee_nip" | "legacy_pin"`.
  - Cover oldest legacy `pin` payload when `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT` is enabled and disabled.

  **Must NOT do**:
  - Do not require immediate invalidation of existing valid cookies.
  - Do not encode business privileges into cookie payload.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused contract tests.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Ensures deployed cookie compatibility remains guarded.
  - **Skills Evaluated but Omitted**:
    - `diagnose`: No complex debugging once contract is clear.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5, Task 9
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:236-286` - Current encode/decode behavior.
  - `lib/auth-session.ts:637-663` - Current routing compatibility behavior.
  - `lib/auth-hardening-helpers.js:5-54` - Helper encode/decode payload shape.
  - `docs/auth-domain-glossary.md:9-29` - Subject, subject type, identity lane definitions.

  **Acceptance Criteria**:
  - [x] Tests describe expected decode result for old prefix cookies.
  - [x] Tests describe expected decode result for new `st` cookies.
  - [x] Tests describe disabled legacy payload compat behavior.
  - [x] Tests fail before Task 5 if integration missing, then pass after Task 5.

  **QA Scenarios**:
  ```
  Scenario: Old prefix cookie remains compatible
    Tool: Bash
    Preconditions: Contract test exists.
    Steps:
      1. Run auth session compatibility test command documented by executor.
      2. Inspect test output for `account:`, `nip:`, and `pin:` cases.
    Expected Result: Old prefix cookies decode into correct subject and subject_type.
    Evidence: .sisyphus/evidence/task-3-prefix-compat-test.txt

  Scenario: Disabled legacy pin payload is rejected
    Tool: Bash
    Preconditions: Test toggles legacy compatibility flag.
    Steps:
      1. Run compatibility test covering old `pin` payload with compat disabled.
      2. Verify decode result is null.
    Expected Result: Legacy `pin` payload is rejected when compat flag is disabled.
    Evidence: .sisyphus/evidence/task-3-legacy-disabled-test.txt
  ```

  **Evidence to Capture**:
  - [x] Test output showing pass/fail before and after implementation.

  **Commit**: NO unless user explicitly asks
  - Message: `test(auth): capture session compatibility contract`
  - Files: `tests/...`
  - Pre-commit: `node --test tests/auth-hardening.test.js` plus new test command

- [x] 4. Map normalized auth response contract

  **What to do**:
  - Create/extend tests or documented fixture assertions for login and `/api/auth/me` response shape in a new file such as `tests/auth-response-contract.test.js`; do not edit `tests/auth-hardening.test.js` unless coordinating with Task 2 owner.
  - Assert response includes `pin`, `nama`, `privilege`, `is_admin`, `is_hr`, `is_leader`, `can_schedule`, `can_dashboard`, `groups`, `canonical_roles`, `subject_type`, `account_id`, `login_id`, `role_key`, `nip`, `karyawan_id`.
  - Assert missing optional values are `null`, not omitted or inconsistent.

  **Must NOT do**:
  - Do not remove compatibility fields still consumed by UI.
  - Do not expose password hashes or token internals.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Contract mapping and assertions are small and targeted.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Prevents future response drift.
  - **Skills Evaluated but Omitted**:
    - `frontend-patterns`: No component work yet.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 6, Task 7, Task 9
  - **Blocked By**: None

  **References**:
  - `lib/auth-hardening-helpers.js:66-85` - Desired normalized response mapper.
  - `app/api/auth/me/route.js:11-31` - Current manual response shape.
  - `app/api/auth/login/route.js:61-73` - Current account login partial response.
  - `app/api/auth/login/route.js:120-130` - Current employee NIP partial response.

  **Acceptance Criteria**:
  - [x] Contract states exact normalized user fields and null/default behavior.
  - [x] Account login, employee login, and `/api/auth/me` use same shape after implementation.
  - [x] No sensitive fields are returned.

  **QA Scenarios**:
  ```
  Scenario: Normalized user contract has stable fields
    Tool: Bash
    Preconditions: Contract test or Node assertion script exists.
    Steps:
      1. Run response contract test command documented by executor.
      2. Validate all expected keys exist for account and employee fixtures.
    Expected Result: All expected keys exist; optional absent values are null.
    Evidence: .sisyphus/evidence/task-4-normalized-contract.txt

  Scenario: Sensitive fields absent
    Tool: Bash
    Preconditions: Contract test checks disallowed fields.
    Steps:
      1. Run contract test.
      2. Assert `password_hash`, cookie token, and raw SQL rows are absent from response objects.
    Expected Result: Sensitive fields absent.
    Evidence: .sisyphus/evidence/task-4-sensitive-fields.txt
  ```

  **Evidence to Capture**:
  - [x] Contract test output.

  **Commit**: NO unless user explicitly asks
  - Message: `test(auth): define normalized user contract`
  - Files: `tests/...`
  - Pre-commit: response contract test command

- [x] 5. Wire helper-backed encode/decode in auth-session

  **What to do**:
  - Import `encodeSessionToken`, `decodeSessionToken`, `normalizeSubjectType`, and any needed helper from `lib/auth-hardening-helpers.js` into `lib/auth-session.ts`.
  - Extend `SessionPayload` to carry optional `subject_type`.
  - Replace local encode/decode internals with helper-backed encode/decode while preserving ownership boundary: `auth-session.ts` owns secret, `sign`, `base64UrlEncode`, `base64UrlDecode`, TTL, and cookie attributes; helpers receive those functions and own payload parsing/normalization only.
  - Decode both new explicit `st` payloads and current prefix-based `sub` payloads; map wire `st` to runtime `subject_type` and never expose `st` in API JSON.
  - Update `getAuthContextFromCookies()` to prefer explicit `subject_type`, then prefix compatibility, then legacy waterfall only when compatibility flag allows.
  - Add safe parse-error logging that does not include raw token or signature.

  **Must NOT do**:
  - Do not store privileges/roles in cookie.
  - Do not break current deployed prefix cookies.
  - Do not log full token values.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive session behavior with compatibility risk.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Needed to keep old/new cookie behavior guarded.
  - **Skills Evaluated but Omitted**:
    - `ultrabrain`: Logic is careful but bounded.

  **Parallelization**:
  - **Can Run In Parallel**: PARTIAL
  - **Parallel Group**: Wave 2 (can run alongside Task 8; blocks Tasks 6, 7, 9)
  - **Blocks**: Tasks 6, 7, 9, 10, 11
  - **Blocked By**: Tasks 2, 3

  **References**:
  - `lib/auth-session.ts:224-286` - Current base64/sign/encode/decode internals.
  - `lib/auth-session.ts:637-663` - Current auth context dispatch logic.
  - `lib/auth-session.ts:665-705` - Current cookie setter with prefix subject.
  - `lib/auth-hardening-helpers.js:1-54` - Helper implementation to wire in.
  - `tests/auth-hardening.test.js` - Existing helper tests to keep passing.
  - `docs/auth-domain-glossary.md:9-29` - Subject/subject type semantics.

  **Acceptance Criteria**:
  - [x] `auth-session.ts` imports and uses helper token encode/decode.
  - [x] New cookies preserve explicit identity lane via `subject_type`/`st` or equivalent helper-supported shape.
  - [x] Old prefix cookies route correctly.
  - [x] Expired, malformed, unsigned, or bad-signature tokens return null.
  - [x] Parse-error log contains generic message only, no raw token.
  - [x] Relevant session tests pass.

  **QA Scenarios**:
  ```
  Scenario: New explicit account cookie routes to account context
    Tool: Bash
    Preconditions: Test fixture can sign helper-style token with `st: "account"`.
    Steps:
      1. Run session integration test for explicit account token.
      2. Assert `createAuthContextByLoginId` path is selected with raw login ID, not prefixed value.
    Expected Result: Account context returned with `subject_type: "account"`.
    Evidence: .sisyphus/evidence/task-5-explicit-account-token.txt

  Scenario: Malformed token rejected safely
    Tool: Bash
    Preconditions: Test or script invokes session decode with malformed token.
    Steps:
      1. Run malformed-token test.
      2. Assert result is null.
      3. Assert captured logs do not contain raw token string.
    Expected Result: Null auth context; safe generic log only.
    Evidence: .sisyphus/evidence/task-5-malformed-token-safe-log.txt
  ```

  **Evidence to Capture**:
  - [x] Session integration test output.
  - [x] Log capture proving no token leakage.

  **Commit**: NO unless user explicitly asks
  - Message: `fix(auth): use typed session payloads`
  - Files: `lib/auth-session.ts`, `lib/auth-hardening-helpers.js` if logging helper updated, tests
  - Pre-commit: `node --test tests/auth-hardening.test.js` plus session tests

- [x] 6. Normalize login responses and mismatch behavior

  **What to do**:
  - Use `buildNormalizedAuthUser(authContext)` for successful standalone account and employee NIP login responses.
  - Apply deterministic lane selection: if active `auth_accounts.login_id` exists for submitted login ID, treat request as account lane only; employee NIP lane is used only when no active auth account matches. Wrong account password returns 401 and must not fall through to NIP.
  - Apply `hasPrivilegeMismatch` only after successful credential verification for the selected lane and only if the implementation can safely compare an existing alternate context without authenticating alternate lane after primary failure.
  - Collision policy: if same identifier exists in both `auth_accounts.login_id` and `tb_karyawan_auth.nip`, log safe reason code `AUTH_IDENTITY_COLLISION`. Return HTTP 409 Conflict with `{ ok: false, error: 'Auth identity conflict.' }` only when both contexts can be safely built and `hasPrivilegeMismatch` reports disagreement; otherwise selected-lane login proceeds without privilege broadening.
  - Use 401 only for invalid credentials/session.
  - Preserve password verification and rehash behavior for both lanes.

  **Must NOT do**:
  - Do not allow employee NIP login to inherit admin account privileges.
  - Do not allow account login to fall through into employee login after password failure.
  - Do not return partial user shape different from `/api/auth/me`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Login security and privilege separation are high-risk.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Regression coverage for privilege separation.
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Endpoint behavior only.

  **Parallelization**:
  - **Can Run In Parallel**: YES after Task 5
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Task 9, Task 11
  - **Blocked By**: Tasks 4, 5

  **References**:
  - `app/api/auth/login/route.js:40-76` - Standalone account login flow.
  - `app/api/auth/login/route.js:79-133` - Employee NIP login flow.
  - `lib/auth-hardening-helpers.js:56-85` - Mismatch guard and normalized mapper.
  - `lib/auth-session.ts:363-421` - Account context builder.
  - `lib/auth-session.ts` around `createAuthContextByNip` - Employee NIP context builder.
  - `docs/auth-hardening-execution-plan.md:32-40` - Safe restriction and visibility principles.

  **Acceptance Criteria**:
  - [x] Login success response uses shared normalized mapper for both lanes.
  - [x] Wrong password for account returns 401 and does not try employee lane.
  - [x] Deterministic lane selection is enforced: account row wins lane selection; wrong account password does not fall through to NIP.
  - [x] Identity collision logs `AUTH_IDENTITY_COLLISION` safely.
  - [x] Privilege mismatch returns 409 only when both contexts are safely built and mismatch is proven.
  - [x] Existing password rehash updates remain intact.

  **QA Scenarios**:
  ```
  Scenario: Account login returns normalized account user
    Tool: Bash (curl)
    Preconditions: Dev server running; valid account credentials available in test fixture.
    Steps:
      1. POST `/api/auth/login` with JSON `{"login_id":"<valid-account>","password":"<valid-password>"}`.
      2. Assert HTTP 200 and `ok: true`.
      3. Assert response `user.subject_type === "account"` and includes all normalized keys.
    Expected Result: Account user shape matches contract; no password fields.
    Evidence: .sisyphus/evidence/task-6-account-login-response.json

  Scenario: Account password failure does not fall through
    Tool: Bash (curl)
    Preconditions: Existing account login ID also resembles or matches employee NIP test case if fixture available.
    Steps:
      1. POST `/api/auth/login` with account login and wrong password.
      2. Capture response and DB/log evidence if available.
    Expected Result: HTTP 401; no employee session cookie; no employee auth success.
    Evidence: .sisyphus/evidence/task-6-no-fallthrough.txt
  ```

  **Evidence to Capture**:
  - [x] curl response JSON.
  - [x] Set-Cookie header redacted except cookie presence/attributes.

  **Commit**: NO unless user explicitly asks
  - Message: `fix(auth): normalize login responses`
  - Files: `app/api/auth/login/route.js`, tests
  - Pre-commit: login response tests

- [x] 7. Normalize /api/auth/me response

  **What to do**:
  - Replace manual user mapping in `/api/auth/me` with `buildNormalizedAuthUser(auth)`.
  - Preserve `unauthorizedResponse('Login required.')` behavior.
  - Ensure response shape matches login response shape.

  **Must NOT do**:
  - Do not change auth guard behavior of unrelated API routes.
  - Do not omit compatibility fields.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small endpoint mapping change.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Prevents response drift.
  - **Skills Evaluated but Omitted**:
    - `frontend-patterns`: No React changes unless Task 8 proves needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES after Task 5
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Task 9, Task 11
  - **Blocked By**: Tasks 4, 5

  **References**:
  - `app/api/auth/me/route.js:5-32` - Current manual response mapper.
  - `lib/auth-hardening-helpers.js:66-85` - Shared normalized mapper.
  - `lib/auth-session.ts:637-663` - Auth context source for `/me`.

  **Acceptance Criteria**:
  - [x] `/api/auth/me` uses `buildNormalizedAuthUser`.
  - [x] Authenticated response fields match login normalized shape.
  - [x] Unauthenticated response remains 401 with `Login required.`.

  **QA Scenarios**:
  ```
  Scenario: /api/auth/me returns normalized user after login
    Tool: Bash (curl)
    Preconditions: Auth cookie captured from successful login.
    Steps:
      1. GET `/api/auth/me` with captured cookie.
      2. Assert HTTP 200, `ok: true`, and normalized `user` keys.
      3. Compare key set with login response key set.
    Expected Result: Same normalized shape.
    Evidence: .sisyphus/evidence/task-7-auth-me-normalized.json

  Scenario: /api/auth/me rejects missing cookie
    Tool: Bash (curl)
    Preconditions: No auth cookie.
    Steps:
      1. GET `/api/auth/me` without Cookie header.
      2. Assert HTTP 401 and error text `Login required.`.
    Expected Result: 401 unauthorized; no retry instruction or redirect payload.
    Evidence: .sisyphus/evidence/task-7-auth-me-unauthorized.json
  ```

  **Evidence to Capture**:
  - [x] curl response JSON for authenticated and unauthenticated cases.

  **Commit**: NO unless user explicitly asks
  - Message: `fix(auth): normalize auth me response`
  - Files: `app/api/auth/me/route.js`, tests
  - Pre-commit: auth me response tests

- [x] 8. Fix verified auth 429 loop/root cause

  **What to do**:
  - Use Task 1 evidence to choose minimal fix.
  - If client retry/fanout is root cause: update only the specific hook/component to de-dupe, back off on 429, and avoid treating transient failure as auth expiry.
  - If invalid-session loop is root cause: clear/replace invalid cookie once and stop repeated `/api/auth/me` fetches.
  - If proxy shared IP is root cause: update `getClientIp()` or deployment trust logic only with evidence, preserving safe defaults.
  - If login form resubmit is root cause: disable submit during in-flight request and ensure one POST per click.
  - Run any test that intentionally triggers 429 last, then restart dev server or reset isolated test process because middleware limiter is in-memory per IP and can poison later QA.

  **Must NOT do**:
  - Do not increase `RATE_LIMIT_MAX_AUTH` as first-line fix.
  - Do not add interval polling.
  - Do not redirect to login on 429 or generic network failure.
  - Do not change unrelated API rate limits unless proven root cause.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires evidence-based debugging across middleware/client/auth.
  - **Skills**: [`diagnose`, `frontend-patterns`]
    - `diagnose`: Fits root-cause workflow for 429.
    - `frontend-patterns`: Relevant if fix is hook/component fetch behavior.
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: No visual redesign.

  **Parallelization**:
  - **Can Run In Parallel**: YES with Tasks 6/7 after Task 1
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9, Task 11
  - **Blocked By**: Task 1

  **References**:
  - `middleware.ts:14-33` - Client IP and rate-limit counter implementation.
  - `middleware.ts:84-103` - Auth/API rate-limit response behavior.
  - `hooks/use-auth-session.js:16-55` - Existing auth session cache/inflight de-dupe.
  - `hooks/use-auth-session.js:71-87` - Hook load/refresh behavior.
  - Task 1 evidence files - Mandatory root-cause source.
  - `AGENTS.md` repo defaults - Do not treat transient API failure as auth expiry; prefer event-driven refresh/manual fallback over interval polling.

  **Acceptance Criteria**:
  - [x] Fix directly matches Task 1 root cause.
  - [x] Normal login produces no 429 and bounded auth requests.
  - [x] Invalid login produces one bounded failure per user action.
  - [x] 429 response does not trigger auth-expiry redirect loop.
  - [x] Rate limits unchanged unless evidence proves proxy/IP correction needed.

  **QA Scenarios**:
  ```
  Scenario: Reproduced 429 path is fixed
    Tool: Playwright
    Preconditions: Same setup as Task 1 failing scenario.
    Steps:
      1. Repeat exact Task 1 failing scenario.
      2. Capture `/api/auth/*` traffic for 60 seconds.
      3. Compare request count/status to Task 1 baseline.
    Expected Result: No 429 under normal flow; request count bounded according to acceptance criteria.
    Evidence: .sisyphus/evidence/task-8-fixed-429-network.json

  Scenario: 429 does not trigger login redirect loop
    Tool: Playwright
    Preconditions: Ability to simulate/mock 429 from `/api/auth/me` or temporarily drive rate limit in test context.
    Steps:
      1. Trigger one `/api/auth/me` 429.
      2. Observe route and network for 30 seconds.
      3. Assert no repeated redirect between dashboard/login and no repeated auth fetch loop.
    Expected Result: UI shows bounded error/retry state or stays stable; no loop.
    Evidence: .sisyphus/evidence/task-8-429-no-loop.json
  ```

  **Evidence to Capture**:
  - [ ] Before/after network comparison.
  - [ ] Screenshot or terminal output showing stable state.

  **Commit**: NO unless user explicitly asks
  - Message: `fix(auth): prevent auth rate-limit loops`
  - Files: exact root-cause files from Task 1, tests
  - Pre-commit: targeted 429 regression test plus typecheck/lint

- [x] 9. Add auth integration/regression tests

  **What to do**:
  - Add integration tests or executable Node test harnesses for session decode/routing, login normalization, `/api/auth/me`, mismatch behavior, and 429 non-regression.
  - Ensure tests can run without production DB secrets; use mocks/stubs where direct DB integration is not safe.
  - Document exact command(s) in evidence and final success criteria if different from initial plan.

  **Must NOT do**:
  - Do not require live production database.
  - Do not store real credentials in repo or evidence.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: Cross-cutting regression suite.
  - **Skills**: [`ocs-test-regression-guard`]
    - `ocs-test-regression-guard`: Core purpose is behavior-proof regression guards.
  - **Skills Evaluated but Omitted**:
    - `tdd`: Implementation already in place by this wave.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11, Final Verification
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References**:
  - `tests/auth-hardening.test.js` - Existing test style.
  - `package.json:5-16` - Available scripts.
  - Outputs from Tasks 2-8 - Behaviors to lock.

  **Acceptance Criteria**:
  - [x] Tests cover explicit subject type and prefix compatibility.
  - [x] Tests cover normalized response shape for login and `/me`.
  - [x] Tests cover mismatch fail-closed behavior.
  - [x] Tests cover bounded 429/retry behavior at unit or integration level.
  - [x] Test commands are documented and pass.

  **QA Scenarios**:
  ```
  Scenario: Full auth regression suite passes
    Tool: Bash
    Preconditions: All auth changes complete.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Run any new auth integration test command documented by executor.
      3. Capture outputs and exit codes.
    Expected Result: All auth tests pass with exit code 0.
    Evidence: .sisyphus/evidence/task-9-auth-regression-suite.txt

  Scenario: Tests do not require production secrets
    Tool: Bash
    Preconditions: Clean env without production DB credentials.
    Steps:
      1. Run auth unit/regression tests with production DB env vars unset.
      2. Confirm tests use mocks/stubs or skip DB integration with explicit message.
    Expected Result: No secret lookup failure; no real credentials printed.
    Evidence: .sisyphus/evidence/task-9-no-prod-secrets.txt
  ```

  **Evidence to Capture**:
  - [x] Test outputs.
  - [x] Documented commands.

  **Commit**: NO unless user explicitly asks
  - Message: `test(auth): add integration regressions`
  - Files: `tests/...`
  - Pre-commit: all auth test commands

- [x] 10. Add runtime logging and rollback knobs

  **What to do**:
  - Add minimal structured warnings for invalid token decode, subject type mismatch, and privilege mismatch.
  - Ensure logs include stable reason codes but not raw tokens/passwords.
  - Document existing rollback flags: `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK`, `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT`, `ALLOW_INSECURE_COOKIES` if touched or relevant.
  - Add any new flag only if implementation needs staged rollout; prefer existing flags.

  **Must NOT do**:
  - Do not add noisy per-request success logs.
  - Do not log secrets, password hashes, cookies, or full SQL rows.
  - Do not create broad docs outside scoped plan unless executor needs inline comments/tests only.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small logging/flag audit after core behavior.
  - **Skills**: []
    - No specialized skill needed beyond code/test care.
  - **Skills Evaluated but Omitted**:
    - `ocs-technical-copy-seo`: Not buyer-facing copy.

  **Parallelization**:
  - **Can Run In Parallel**: YES after Task 5
  - **Parallel Group**: Wave 3 (with Task 9 after core behavior)
  - **Blocks**: Task 11, Final Verification
  - **Blocked By**: Task 5

  **References**:
  - `lib/auth-session.ts:12-19` - `AUTH_SECRET` and dev fallback warning pattern.
  - `lib/auth-session.ts:29-36` - Existing legacy compatibility flags.
  - `lib/auth-hardening-helpers.js:51-52` - Current swallowed parse failure noted by review agent.
  - `docs/auth-hardening-execution-plan.md:32-40` - Add visibility before removal.

  **Acceptance Criteria**:
  - [x] Invalid token parse emits safe warning/error without token value.
  - [x] Mismatch emits safe reason-coded warning.
  - [x] Existing rollback flags still work and are tested or verified.
  - [x] No success-log spam added.

  **QA Scenarios**:
  ```
  Scenario: Invalid token log is safe
    Tool: Bash
    Preconditions: Test captures console warning/error.
    Steps:
      1. Invoke decode/get auth context with malformed token `not-a-real-token`.
      2. Capture logs.
      3. Assert logs contain reason code and do not contain token string.
    Expected Result: Safe log only; auth result null.
    Evidence: .sisyphus/evidence/task-10-safe-invalid-token-log.txt

  Scenario: Legacy compat flag still gates old pin payload
    Tool: Bash
    Preconditions: Tests can toggle `EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT`.
    Steps:
      1. Run legacy pin payload test with flag enabled.
      2. Run same with flag disabled.
    Expected Result: Enabled accepts valid legacy payload; disabled rejects it.
    Evidence: .sisyphus/evidence/task-10-legacy-flag.txt
  ```

  **Evidence to Capture**:
  - [ ] Log capture.
  - [ ] Flag behavior test output.

  **Commit**: NO unless user explicitly asks
  - Message: `chore(auth): add safe auth diagnostics`
  - Files: `lib/auth-session.ts`, `lib/auth-hardening-helpers.js`, tests if needed
  - Pre-commit: auth tests

- [x] 11. Run build/type/lint and fix scoped failures

  **What to do**:
  - Run all required verification commands.
  - Fix failures caused by this auth work only.
  - If pre-existing failures exist, document exact command, file:line, and why unrelated.
  - Ensure no unrelated docs/landing page changes are included.

  **Must NOT do**:
  - Do not fix broad unrelated lint debt.
  - Do not mask errors with `@ts-ignore`, `as any`, or disabled lint rules unless reviewed and justified in evidence.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Final integration verification may require scoped fixes.
  - **Skills**: []
    - No specialized domain skill required.
  - **Skills Evaluated but Omitted**:
    - `ai-slop-remover`: Only use later if review flags specific file smells.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 final task
  - **Blocks**: Final Verification
  - **Blocked By**: Tasks 9, 10

  **References**:
  - `package.json:5-16` - Verification scripts.
  - `.gitignore` - Ensure evidence/temp files do not pollute commit unless intended.
  - This plan's Must Have / Must NOT Have sections - Scope control.

  **Acceptance Criteria**:
  - [x] `node --test tests/auth-hardening.test.js` passes.
  - [x] New auth integration tests pass.
  - [x] `npm run typecheck` passes.
  - [x] `npm run lint` passes or unrelated pre-existing failures documented.
  - [x] `npm run build` passes or unrelated environmental blockers documented.
  - [x] `git diff --stat` contains only scoped auth/test files unless Task 8 evidence justified specific client/middleware file.

  **QA Scenarios**:
  ```
  Scenario: Verification command suite passes
    Tool: Bash
    Preconditions: All implementation tasks complete.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Run new auth integration test command(s).
      3. Run `npm run typecheck`.
      4. Run `npm run lint`.
      5. Run `npm run build`.
    Expected Result: All commands exit 0, or unrelated blockers documented with exact file:line.
    Evidence: .sisyphus/evidence/task-11-verification-suite.txt

  Scenario: Diff remains scoped
    Tool: Bash
    Preconditions: Implementation complete before commit.
    Steps:
      1. Run `git diff --stat`.
      2. Run `git diff --name-only`.
      3. Compare changed paths to this plan.
    Expected Result: Only auth/session/login/me/tests and Task 8 justified file(s) changed.
    Evidence: .sisyphus/evidence/task-11-diff-scope.txt
  ```

  **Evidence to Capture**:
  - [ ] Full verification command output.
  - [ ] Diff scope output.

  **Commit**: NO unless user explicitly asks
  - Message: `chore(auth): verify hardening integration`
  - Files: scoped verification/test updates only
  - Pre-commit: all verification commands

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + auth tests. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod paths, commented-out code, unused imports, vague names, over-abstraction. Verify parse-error logging uses warning/error intentionally and does not leak token values.
  Output: `Typecheck [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Browser QA / Runtime QA** — `unspecified-high` + `playwright`
  Start from clean browser context. Execute EVERY QA scenario from EVERY task. Verify account login, employee NIP login, invalid login, expired/invalid cookie, and 429 non-regression. Save screenshots, network logs, and API responses to `.sisyphus/evidence/final-qa/`. Evidence files are execution artifacts, not default commit contents.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Compare actual diff to this plan. Verify only scoped files changed unless Task 1 evidence justified additional auth-loop file. Reject unrelated landing page/docs/broad auth rewrite changes. Verify no global rate-limit weakening without evidence.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Commit creation is OPTIONAL and requires explicit user request. If user asks to commit, use these suggested atomic groups:

- **Commit 1**: `test(auth): capture hardening contracts` — helper/session/login contract tests.
- **Commit 2**: `fix(auth): use typed session payloads` — `lib/auth-session.ts`, helper integration.
- **Commit 3**: `fix(auth): normalize auth responses` — login + `/api/auth/me` normalization.
- **Commit 4**: `fix(auth): prevent auth rate-limit loops` — minimal root-cause 429 fix + evidence.
- **Commit 5**: `test(auth): add integration regressions` — integration tests and QA evidence updates.

Do not create commits unless user explicitly asks. Evidence files under `.sisyphus/evidence/` are execution artifacts and should not be committed unless user explicitly requests archival.

---

## Success Criteria

### Verification Commands
```bash
node --test tests/auth-hardening.test.js
npm run typecheck
npm run lint
npm run build
```

### Final Checklist
- [ ] Helpers imported and used in production auth/session paths.
- [ ] New cookies include explicit subject type or equivalent unambiguous helper-supported lane.
- [ ] Legacy prefix cookies still decode and route correctly.
- [ ] Account login cannot accidentally resolve as employee NIP.
- [ ] Employee NIP login cannot inherit account/admin privileges.
- [ ] `/api/auth/me` uses shared normalized user mapping.
- [ ] Normal login flow does not exceed `/api/auth/*` rate limit.
- [ ] Invalid login remains bounded and returns 401, not retry storm.
- [ ] All tests/typecheck/lint/build pass or documented existing failures are isolated.
