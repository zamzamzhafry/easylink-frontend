# Fix Code Review Findings

## TL;DR

> **Quick Summary**: Fix all EasyLink frontend code review findings across auth security, redirect safety, middleware rate limiting, session compatibility, UI auth consistency, and large-route maintainability without breaking current production auth paths.
>
> **Deliverables**:
> - Harden legacy plaintext password comparison and empty-password behavior.
> - Sanitize login `next` redirect paths.
> - Add safer legacy session fallback telemetry/guardrails.
> - Clean up middleware rate limiting, server lifecycle behavior, and headers.
> - Refactor duplicated cookie secure-flag logic.
> - Improve AuthContext/account-path semantics and NIP login response parity.
> - Document or reduce risk around global auth session cache, users route size, table cache TTL, and dev `AUTH_SECRET` fallback.
> - Add/adjust tests and agent-executed QA evidence for every change.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 implementation waves + final verification
> **Critical Path**: T1/T2/T3 → T8 → T12 → F1-F4

---

## Context

### Original Request
User asked: "do plan of fixing all of those" after code review findings were presented for `/home/user/projects/easylink-frontend`.

### Interview Summary
**Key Discussions**:
- Code review found 15 findings across auth, middleware, login redirect, scanlog UX, and maintainability.
- User requested one plan covering all findings.
- No separate scope split requested; single plan mandated.

**Research Findings**:
- Branch `master` was clean and up to date with `origin/master`; no open PRs existed.
- `lib/auth-session.ts` owns session signing, auth account/NIP/PIN contexts, cookie setting, and legacy fallback.
- `app/login/page.jsx` reads `next` from query string and uses it in `router.replace(nextPath)`.
- `middleware.ts` owns in-memory rate limiting, CSRF origin validation, and security headers.
- `hooks/use-auth-session.js` uses a module-level 30s session cache plus inflight fetch dedup.
- `app/api/auth/login/route.js` has account and NIP login paths, but only account response includes `groups`.
- `app/scanlog/page.jsx` lacks visible client-side session UX in reviewed section.
- `app/api/users/route.js` is large and behavior-sensitive.

### Metis Review
**Identified Gaps** (addressed):
- Preserve current 3 auth paths unless explicitly guarded by env toggles; do not silently disable production login modes.
- Avoid logging secrets: no passwords, raw cookies, raw PIN/NIP, or full identifiers.
- Redirect sanitizer must accept only safe same-app paths and reject protocol-relative/external/control-character paths plus `/login` loops.
- Timing-safe comparison must handle unequal length buffers correctly and never authenticate empty passwords.
- Rate limit semantics should be explicit: allow N requests, block N+1.
- Avoid DB schema changes for telemetry unless migration is explicit; prefer code-only counters/logs.
- Large `users` route refactor should preserve behavior and be split cautiously.
- Add rollback/feature-flag guidance around auth changes.

---

## Execution Prep (MANDATORY)

Before implementation starts, executor must read repo entrypoints:
- `AGENTS.md`
- `docs/README.md`
- `docs/agent-restrictions.md`
- `docs/CONTEXT.md`
- `docs/agent-context/current-project-context.md`
- `docs/agent-context/session-handoff-2026-05-12-network-vm-landing.md`
- `docs/agent-context/session-handoff-2026-06-01-auth-model-and-login-fix.md`
- `docs/auth-domain-glossary.md`
- `docs/adr/0001-auth-identity-resolution-and-capability-model.md`
- `docs/auth-hardening-execution-plan.md` if present

Before execution, executor must read `.multibrain/session.md`, then read relevant bucket indexes/context files. During this session `.multibrain/` was initialized and current session index lives at `.multibrain/session.md` with bucket index `.multibrain/indexes/agents.md`.

Workflow requirement:
1. Read `.multibrain/session.md` first.
2. Read relevant `.multibrain/indexes/*.md` buckets before coding.
3. If auth hardening creates durable context, write `.multibrain/context/YYYY-MM-DD-HHMM-agent-topic.md`.
4. Add newest-first index entry under relevant bucket after work.
5. Update `.multibrain/session.md` only if a new bucket is introduced.

---

## Finding Inventory

| ID | Finding | File(s) | Risk | Fix Strategy | Proof |
|---|---|---|---|---|---|
| F01 | Legacy plaintext/empty password hardening | `lib/auth-session.ts`, tests/helper | High | Reject empty/null/undefined stored or submitted password; test pure helper; keep bcrypt paths unchanged | T1 tests + auth regression |
| F02 | Login `next` open redirect | `app/login/page.jsx` | High | Pure sanitizer allows only safe same-app paths, fallback `/` | T2 helper/browser QA |
| F03 | Legacy session fallback waterfall | `lib/auth-session.ts` | High | Safe telemetry/counters, preserve compatibility, env-flag PIN fallback | T5/T7 tests |
| F04 | Cookie secure flag duplication | `lib/auth-session.ts` | Medium | Shared internal resolver preserving env/proxy behavior | T4 cookie header QA |
| F05 | Middleware rate-limit semantics | `middleware.ts` | Medium | Lock allow-N/block-N+1 semantics with pure test seam | T3 tests/curl |
| F06 | Middleware lifecycle cleanup | `middleware.ts` | Medium | Document single-instance/serverless caveat; unref or lazy cleanup if appropriate | T3 evidence |
| F07 | Deprecated security header | `middleware.ts` | Low | Remove or explicitly document `X-XSS-Protection`; keep modern headers | T14 header QA |
| F08 | AuthContext account semantics/typing | `lib/auth-session.ts`, consumers | Medium | Preserve shape; clarify `subject_type`; search TS/JS consumers before any field changes | T6 build/search |
| F09 | NIP login response parity | `app/api/auth/login/route.js` | Medium | Additive `groups` parity, stable empty array when absent | T8 API QA |
| F10 | Scanlog auth UX consistency | `app/scanlog/page.jsx`, scanlog APIs | Low | Confirm server auth; add 401/403 UX without transient-failure redirect | T10 Playwright/API QA |
| F11 | Global session cache risk | `hooks/use-auth-session.js` | Medium | Document/test stale-positive, stale-negative, cross-tab, route-race behavior; optional low-risk invalidation | T9 mocked tests |
| F12 | Users route maintainability | `app/api/users/route.js` | Low | Assessment-first; only pure behavior-neutral extraction if obvious | T13 assessment/API smoke |
| F13 | Table existence cache stale forever | `lib/auth-session.ts` | Low | TTL/invalidation helper with tests | T11 tests |
| F14 | Dev `AUTH_SECRET` fallback | `lib/auth-session.ts`, docs | Low | Keep prod throw; document deploy requirement; test isolated import behavior | T12 tests/docs |
| F15 | Tests + QA closure | tests, evidence | Medium | Consolidate regression suite and evidence for all tasks | T15 + final review |

Rollback/flag rule: auth behavior changes must be additive or guarded by existing env flags. If a change risks login/session breakage, prefer revertable helper extraction or feature flag over silent behavior change.

---

## Work Objectives

### Core Objective
Close all code review findings with minimal, safe changes that improve security and maintainability while preserving current EasyLink production auth compatibility.

### Concrete Deliverables
- Updated auth helpers and login flow.
- Updated middleware behavior and comments.
- Updated auth/session types and cookie helper internals.
- Updated scanlog auth UX or documented API-only auth guarantee.
- Users route refactor assessment plus safe extraction if low risk.
- Tests and QA evidence for all changed behaviors.

### Definition of Done
- [ ] All 15 findings are either fixed in code or explicitly documented with rationale and guardrail.
- [ ] Existing account login works.
- [ ] Existing NIP login works.
- [ ] Legacy prefixed PIN sessions still work when `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=true`.
- [ ] Login `next` rejects external/protocol-relative/login-loop paths.
- [ ] Middleware rate limit allows exactly threshold requests then blocks next request.
- [ ] No secrets or raw identifiers appear in logs/telemetry changes.
- [ ] Test suite and agent QA scenarios pass.

### Must Have
- Preserve current production behavior for account/NIP auth.
- Keep legacy compatibility behind existing env flags unless task says otherwise.
- Add tests around security-sensitive helpers.
- Use agent-executed QA for every task.

### Must NOT Have (Guardrails)
- Do not add DB schema changes unless a task explicitly includes migration plan.
- Do not log passwords, session cookies, raw PINs, raw NIPs, raw login IDs, tokens, or full credentials.
- Auth telemetry may log only path labels (`account`, `nip`, `pin`, `legacy-unprefixed`), boolean outcomes, counters, and irreversible short digests if absolutely needed.
- Do not remove legacy auth paths outright.
- Do not create redirect behavior that allows external hosts, protocol-relative URLs, or `/login` loops.
- Do not perform broad redesign of `app/api/users/route.js` beyond safe extraction or documented assessment.
- Do not require manual human testing for acceptance.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL implementation verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.
> Evidence files under `.sisyphus/evidence/` are created only during implementation/execution, not during this planning session.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after for most tasks; TDD where helper tests can be written first.
- **Framework**: Node test runner for existing JS helper tests; project build/lint commands as available.
- **If TDD**: Helper/security tasks should write failing test first where possible, then implement.

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

### Test Fixture Policy
For QA scenarios requiring credentials or seeded data, executor must first discover existing local fixture/env conventions from `docs/agent-restrictions.md`, `docs/CONTEXT.md`, `.env.example` if present, and route tests. If valid credentials/fixtures are unavailable, executor must create deterministic local-only mock/unit tests for helper behavior and record API/browser QA as blocked with exact missing fixture requirement; do not use production credentials or invent secrets.

- **Frontend/UI**: Use Playwright skill - navigate, interact, assert DOM, screenshot.
- **TUI/CLI**: Use interactive_bash (tmux) - run command, send keystrokes, validate output.
- **API/Backend**: Use Bash (curl) - send requests, assert status + response fields.
- **Library/Module**: Use Bash (`node --test`, `bun`, or `node -e`) - import/call functions, compare output.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Security + foundation, start immediately):
├── T1: Harden legacy password comparison + tests [unspecified-high]
├── T2: Sanitize login next redirect + tests/QA [quick]
├── T3: Clarify/test middleware rate limit semantics + lifecycle notes [quick]
├── T4: Extract cookie secure-flag resolver [quick]
├── T5: Add auth telemetry/log redaction helpers [quick]
└── T6: Add AuthContext/account-path semantics documentation/type cleanup [unspecified-high]

Wave 2 (Auth compatibility + UX consistency, after relevant Wave 1 foundations):
├── T7: Add legacy session fallback telemetry/guardrails [unspecified-high] (depends: T5)
├── T8: Normalize login response parity for account and NIP paths [quick] (depends: T6)
├── T9: Document/guard global useAuthSession cache semantics [quick]
├── T10: Align scanlog auth UX with app pages or prove API-only auth [visual-engineering]
├── T11: Add tableExistsCache TTL/invalidation helper [quick]
└── T12: Tighten AUTH_SECRET dev fallback guard/docs [quick]

Wave 3 (Maintainability + integration):
├── T13: Assess and safely extract users route internals if behavior-neutral [refactorer]
├── T14: Remove deprecated X-XSS-Protection or replace with documented header policy [quick]
├── T15: Add integration/security regression tests and commands [testing]
└── T16: Auth docs/session handoff update for changed behavior [writing]

Wave FINAL (After ALL tasks — required post-implementation review + summarized evidence):
├── F0: Run `/review-work` skill (mandatory for significant implementation)
├── F1: Plan compliance audit (oracle/read-only reasoning)
├── F2: Code quality review (executor/default implementation reviewer)
├── F3: Agent-executed end-to-end QA (Playwright for UI, curl/Bash for API, node tests for modules)
└── F4: Scope fidelity check (deep/read-only reasoning)
```

### Dependency Matrix

- **T1**: Depends: none | Blocks: T15
- **T2**: Depends: none | Blocks: T15
- **T3**: Depends: none | Blocks: T15
- **T4**: Depends: none | Blocks: T15
- **T5**: Depends: none | Blocks: T7
- **T6**: Depends: none | Blocks: T8, T15
- **T7**: Depends: T5 | Blocks: T15, T16
- **T8**: Depends: T6 | Blocks: T15
- **T9**: Depends: none | Blocks: T15, T16
- **T10**: Depends: none | Blocks: T15
- **T11**: Depends: none | Blocks: T15
- **T12**: Depends: none | Blocks: T16
- **T13**: Depends: none | Blocks: T15 only if behavior-neutral extraction changes code; assessment-only outcome does not block security regression tests
- **T14**: Depends: none | Blocks: T15
- **T15**: Depends: T1-T14 | Blocks: F1-F4
- **T16**: Depends: T7, T9, T12 | Blocks: F1-F4
- **F1-F4**: Depends: T1-T16

### Agent Dispatch Summary

> Profile labels below describe work type. If executor environment lacks a named category, use default implementation executor for code tasks, `oracle` for read-only reasoning/review, `playwright` skill for UI/browser QA, `frontend-ui-ux` skill for UI polish, and `/review-work` for final post-implementation review.

- **Wave 1**: 6 agents — T1 security implementation, T2 quick implementation, T3 quick implementation, T4 quick refactor, T5 quick security helper, T6 auth contract/type cleanup
- **Wave 2**: 6 agents — T7 auth compatibility/security, T8 quick API response fix, T9 hook/cache cleanup, T10 UI/browser QA (`playwright`, optional `frontend-ui-ux`), T11 cache helper, T12 docs/guard test
- **Wave 3**: 4 agents — T13 behavior-preserving refactor, T14 middleware cleanup, T15 test executor, T16 docs writer
- **FINAL**: `/review-work` skill plus F1-F4 evidence/audit checks if additional targeted review is needed

---

## TODOs

- [ ] T1. Harden legacy password comparison + tests

  **What to do**:
  - Update `verifyPlainPassword()` in `lib/auth-session.ts` so empty stored/input values never authenticate.
  - Enforce sequencing: reject empty submitted password; reject null/empty stored value; keep hashed `verifyPassword()` paths unchanged; only compare legacy plaintext after basic rejection; rehash only after successful validated login in existing hashed paths.
  - Use timing-safe comparison correctly for equal-length buffers, with safe false return for mismatched lengths.
  - If direct testing `lib/auth-session.ts` is hard because of Next/DB imports, extract pure comparison helper to `lib/auth-hardening-helpers.js` or equivalent testable module and call it from `verifyPlainPassword()`.
  - Add tests for exact match, mismatch, empty stored/input, `null`, `undefined`, whitespace-only values, and unequal-length inputs.
  - Decide and document whitespace behavior explicitly: if trimming remains, whitespace-only must not authenticate; if literal whitespace preserved, tests must cover it intentionally.

  **Must NOT do**:
  - Do not log password values.
  - Do not change account/NIP bcrypt login behavior.
  - Do not remove legacy auth path outright.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive auth behavior with regression risk.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `playwright` not needed; pure helper/API behavior.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T2-T6
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:730-735` - Function being hardened.
  - `app/api/auth/login/route.js:98-105` - Modern hashed password path to avoid changing.
  - `tests/auth-hardening.test.js` - Existing auth helper test style.
  - Node `crypto.timingSafeEqual` docs - Equal-length buffer requirement.

  **Acceptance Criteria**:
  - [ ] Empty stored password + empty input returns false.
  - [ ] Matching non-empty plaintext returns true.
  - [ ] Mismatched values return false without throwing.
  - [ ] Unequal-length values return false without leaking values in logs.
  - [ ] Auth helper tests pass.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Legacy plaintext match succeeds
    Tool: Bash
    Preconditions: Working tree includes updated tests.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Assert test named for `verifyPlainPassword` exact non-empty match passes.
    Expected Result: Command exits 0 and exact-match test passes.
    Failure Indicators: Non-zero exit or failed verifyPlainPassword test.
    Evidence: .sisyphus/evidence/task-T1-legacy-plaintext-match.txt

  Scenario: Empty legacy password rejected
    Tool: Bash
    Preconditions: Working tree includes updated tests.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Assert test named for empty stored/input returns false passes.
    Expected Result: Command exits 0 and empty-password test passes.
    Failure Indicators: Empty stored/input authenticates or command fails.
    Evidence: .sisyphus/evidence/task-T1-empty-password-rejected.txt
  ```

  **Evidence to Capture**:
  - [ ] Test output saved.

  **Commit**: YES
  - Message: `fix(auth): harden legacy password comparison`
  - Files: `lib/auth-session.ts`, `tests/auth-hardening.test.js`
  - Pre-commit: `node --test tests/auth-hardening.test.js`

- [ ] T2. Sanitize login `next` redirect

  **What to do**:
  - Add pure helper in `app/login/page.jsx` or small existing helper module to normalize redirect target.
  - Allow only app-relative paths beginning with a single `/`.
  - Allow examples: `/`, `/dashboard`, `/foo?x=1`, `/foo#bar`.
  - Reject examples: `//evil.com`, `http://evil.com`, `https://evil.com`, `javascript:alert(1)`, `/%0aevil`, any backslash (`\\`) anywhere, control characters, empty/whitespace-only values, `/login`, `/login?...`, and `/login#...` loops.
  - Add tests if helper is extractable; otherwise add focused QA.

  **Must NOT do**:
  - Do not allow external hosts.
  - Do not redirect back to `/login` after successful login.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small client-side security fix.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `playwright` used by QA task, not required for implementation.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T1, T3-T6
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `app/login/page.jsx:18-35` - Current `next` parsing and redirect behavior.
  - `app/login/page.jsx:51-54` - Post-login redirect call.
  - `hooks/use-auth-session.js:57-63` - Session cache reset sequence after login.

  **Acceptance Criteria**:
  - [ ] `?next=/attendance` redirects to `/attendance` after login.
  - [ ] `?next=https://evil.example` falls back to `/`.
  - [ ] `?next=//evil.example` falls back to `/`.
  - [ ] `?next=/login` falls back to `/`.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Safe relative redirect preserved
    Tool: Playwright
    Preconditions: Test account credentials available from environment or seeded fixture.
    Steps:
      1. Navigate to `/login?next=/attendance`.
      2. Fill login ID field with valid login, password field with valid password.
      3. Submit form.
      4. Wait up to 10s for URL path `/attendance`.
    Expected Result: Browser URL path is exactly `/attendance`.
    Failure Indicators: URL path remains `/login`, becomes `/`, or goes external.
    Evidence: .sisyphus/evidence/task-T2-safe-relative-redirect.png

  Scenario: External redirect rejected
    Tool: Playwright
    Preconditions: Test account credentials available.
    Steps:
      1. Navigate to `/login?next=https://evil.example/phish`.
      2. Login with valid credentials.
      3. Wait up to 10s for navigation.
      4. Assert browser origin remains app origin and path is `/`.
    Expected Result: App stays same-origin at `/`.
    Failure Indicators: Browser navigates to `evil.example` or keeps unsafe URL.
    Evidence: .sisyphus/evidence/task-T2-external-redirect-rejected.png
  ```

  **Evidence to Capture**:
  - [ ] Screenshots and URL assertion logs.

  **Commit**: YES
  - Message: `fix(login): sanitize next redirect target`
  - Files: `app/login/page.jsx`, optional helper/test file
  - Pre-commit: `node --test tests/auth-hardening.test.js` if helper tests added

- [ ] T3. Clarify/test middleware rate limit semantics + lifecycle notes

  **What to do**:
  - Make `isRateLimited()` semantics explicit and test-covered: allow exactly `maxRequests`, block request `maxRequests + 1`.
  - Treat current logic as likely correct; lock behavior with tests rather than broad rewrite.
  - Add pure helper extraction or test seam for rate limit behavior if feasible, avoiding brittle curl-only proof.
  - Add server lifecycle note for in-memory single-instance behavior and serverless limitations.
  - If keeping `setInterval`, call `.unref?.()` on timer where supported or move cleanup to request path.

  **Must NOT do**:
  - Do not introduce Redis/external dependency.
  - Do not break CSRF or security headers.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Local middleware logic cleanup.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T1, T2, T4-T6
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `middleware.ts:22-43` - Rate limit implementation and cleanup interval.
  - `middleware.ts:84-112` - Auth/API buckets and CSRF application.
  - `middleware.ts:130-140` - Matcher scope.

  **Acceptance Criteria**:
  - [ ] For max 30 auth requests/min, first 30 allowed, 31st blocked.
  - [ ] For max 120 API requests/min, first 120 allowed, 121st blocked.
  - [ ] Cleanup behavior documented and not process-sticky in tests.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Auth limit blocks N+1
    Tool: Bash
    Preconditions: App server running locally.
    Steps:
      1. Send 30 POST requests to `/api/auth/login` with invalid credentials from same IP.
      2. Send request 31.
      3. Capture status codes.
    Expected Result: Requests 1-30 are not 429; request 31 is 429 with `Retry-After: 60`.
    Failure Indicators: Request 30 blocked, request 31 not blocked, missing Retry-After.
    Evidence: .sisyphus/evidence/task-T3-auth-rate-limit.txt

  Scenario: CSRF still rejects invalid origin
    Tool: Bash (curl)
    Preconditions: App server running locally.
    Steps:
      1. Send POST to `/api/auth/login` with header `Origin: https://evil.example` and app Host.
      2. Capture status and JSON body.
    Expected Result: Status 403, JSON `{ ok: false, error: "Invalid request origin." }` unless rate limit reached first.
    Failure Indicators: Status 200/401 without CSRF rejection.
    Evidence: .sisyphus/evidence/task-T3-csrf-still-rejects.txt
  ```

  **Evidence to Capture**:
  - [ ] Curl/status output.

  **Commit**: YES
  - Message: `fix(middleware): clarify rate limit semantics`
  - Files: `middleware.ts`, optional helper/test file
  - Pre-commit: project test/build command

- [ ] T4. Extract cookie secure-flag resolver

  **What to do**:
  - Extract duplicated secure-cookie detection from `setAuthCookie()` and `clearAuthCookie()` into a shared helper in `lib/auth-session.ts`.
  - Helper should take request-like input and centralize env reads; avoid scattered `process.env` checks.
  - Preserve current behavior for `ALLOW_INSECURE_COOKIES`, `x-forwarded-proto`, `request.nextUrl.protocol`, and production fallback.
  - Add direct tests if helper can be exported safely, or test indirectly through cookie attributes.

  **Must NOT do**:
  - Do not change cookie name, maxAge, path, httpOnly, or sameSite values.
  - Do not weaken production secure-cookie behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small duplication refactor with security-sensitive acceptance.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T1-T3, T5-T6
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:665-705` - `setAuthCookie()` secure logic.
  - `lib/auth-session.ts:708-727` - `clearAuthCookie()` duplicate secure logic.

  **Acceptance Criteria**:
  - [ ] Shared helper used by both cookie functions.
  - [ ] `ALLOW_INSECURE_COOKIES=true` forces insecure cookie only as before.
  - [ ] `x-forwarded-proto=https` yields secure cookie.
  - [ ] Production fallback yields secure cookie.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Login sets secure cookie behind HTTPS proxy
    Tool: Bash (curl)
    Preconditions: App server running, valid credentials available.
    Steps:
      1. POST `/api/auth/login` with `X-Forwarded-Proto: https`.
      2. Capture `Set-Cookie` header.
      3. Assert cookie has `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure`.
    Expected Result: Cookie attributes preserved and `Secure` present.
    Failure Indicators: Missing secure/httpOnly/sameSite/path attributes.
    Evidence: .sisyphus/evidence/task-T4-login-cookie-secure.txt

  Scenario: Logout clears matching cookie attributes
    Tool: Bash (curl)
    Preconditions: App server running.
    Steps:
      1. POST `/api/auth/logout` with `X-Forwarded-Proto: https`.
      2. Capture `Set-Cookie` header.
      3. Assert `easylink_session=` with `Max-Age=0`, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure`.
    Expected Result: Logout cookie clears same cookie scope.
    Failure Indicators: Missing Max-Age=0 or mismatched attributes.
    Evidence: .sisyphus/evidence/task-T4-logout-cookie-clear.txt
  ```

  **Evidence to Capture**:
  - [ ] Header output.

  **Commit**: YES
  - Message: `refactor(auth): share cookie secure flag resolver`
  - Files: `lib/auth-session.ts`
  - Pre-commit: auth tests/build

- [ ] T5. Add auth telemetry/log redaction helpers

  **What to do**:
  - Add small helper(s) for safe auth telemetry labels.
  - Redact sensitive identifiers: never log password, cookie, raw PIN, raw NIP, or full login ID.
  - Provide subject type + short non-reversible digest/truncated safe marker if needed.
  - Use helper in legacy fallback warnings/telemetry added by T7.

  **Must NOT do**:
  - Do not add DB audit schema.
  - Do not emit raw auth secrets or user identifiers.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small helper, security guardrail.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T1-T4, T6
  - **Blocks**: T7
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:212-220` - Existing legacy fallback telemetry counter.
  - `lib/auth-session.ts:555-558` - Current raw PIN warning to replace/redact.
  - `lib/auth-session.ts:637-662` - Legacy waterfall path to instrument later.

  **Acceptance Criteria**:
  - [ ] Helper never returns raw credential/subject.
  - [ ] Existing raw PIN console warning removed or redacted.
  - [ ] Telemetry/log output contains only path labels (`account`, `nip`, `pin`, `legacy-unprefixed`), boolean outcomes/counters, and irreversible short digest if correlation is unavoidable.
  - [ ] Tests assert redacted output excludes original identifier, raw cookie/token, and password-like values.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Redaction helper hides raw identifier
    Tool: Bash
    Preconditions: Tests added for telemetry helper.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Assert test input `1234567890` never appears in helper output.
    Expected Result: Tests pass and output uses safe digest/marker only.
    Failure Indicators: Raw identifier appears in test output or helper return.
    Evidence: .sisyphus/evidence/task-T5-redaction-helper.txt

  Scenario: Legacy warning avoids raw PIN
    Tool: Bash
    Preconditions: Code search available.
    Steps:
      1. Search changed `lib/auth-session.ts` for `Legacy PIN fallback used for subject:`.
      2. Assert no raw subject logging remains.
    Expected Result: Raw-subject log string absent; redacted helper used.
    Failure Indicators: Console warning includes raw `pin`/`nip`/subject value.
    Evidence: .sisyphus/evidence/task-T5-no-raw-pin-log.txt
  ```

  **Evidence to Capture**:
  - [ ] Test output and search output.

  **Commit**: YES
  - Message: `fix(auth): redact legacy auth telemetry`
  - Files: `lib/auth-session.ts`, tests
  - Pre-commit: `node --test tests/auth-hardening.test.js`

- [ ] T6. Clarify AuthContext account-path semantics and reduce `any` risk

  **What to do**:
  - Clarify standalone account path where `pin` currently equals `login_id`.
  - Add explicit field such as existing `subject_type: 'account'` usage to downstream guidance, and avoid new code treating `auth.pin` as employee PIN for account sessions.
  - Tighten type annotations for DB connection/rows in `lib/auth-session.ts` where low-risk.
  - If changing `pin` value would break callers, do not change it; document and add guard comments/tests instead.
  - Search both TS and JS consumers for property-name assumptions before renaming or reshaping AuthContext fields.

  **Must NOT do**:
  - Do not make broad AuthContext shape changes without updating all consumers.
  - Do not break `lib/authz/authorization-adapter.ts` assumptions around `canonical_roles`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Type/contract cleanup in central auth module.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 with T1-T5
  - **Blocks**: T8, T15
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:84-101` - `AuthContext` shape.
  - `lib/auth-session.ts:363-414` - Account auth context, including `pin: account.login_id`.
  - `lib/authz/authorization-adapter.ts:1-79` - AuthContext consumer.
  - `components/app-shell.jsx:58-60` - Client app shell auth consumption.

  **Acceptance Criteria**:
  - [ ] Account sessions remain valid.
  - [ ] `subject_type` clearly distinguishes account/NIP/PIN paths.
  - [ ] No new unsafe `any` added.
  - [ ] Existing authz adapter still typechecks/builds.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Account auth context still includes canonical roles
    Tool: Bash
    Preconditions: Test or local script can call auth helper with fixture/mocked account.
    Steps:
      1. Run auth helper test/build command.
      2. Assert account context has `subject_type: "account"` and `canonical_roles` array.
    Expected Result: Account context contract preserved.
    Failure Indicators: Missing subject_type/canonical_roles or build failure.
    Evidence: .sisyphus/evidence/task-T6-account-context-contract.txt

  Scenario: Authz adapter still accepts AuthContext
    Tool: Bash
    Preconditions: Project dependencies installed.
    Steps:
      1. Run `npm run build` or available TypeScript check.
      2. Confirm no errors in `lib/authz/authorization-adapter.ts`.
    Expected Result: Build/typecheck passes for authz adapter.
    Failure Indicators: Type errors or runtime import errors.
    Evidence: .sisyphus/evidence/task-T6-authz-typecheck.txt
  ```

  **Evidence to Capture**:
  - [ ] Build/typecheck output.

  **Commit**: YES
  - Message: `refactor(auth): clarify auth context subject semantics`
  - Files: `lib/auth-session.ts`, optional docs/tests
  - Pre-commit: build/typecheck command

- [ ] T7. Add legacy session fallback telemetry and guardrails

  **What to do**:
  - Instrument untyped legacy session waterfall in `getAuthContextFromCookies()`.
  - Count canonical prefix hits vs untyped waterfall hits in process memory, using safe labels only (`account`, `nip`, `pin`, `legacy-unprefixed`) and boolean/result counters.
  - If identifier correlation is unavoidable, use irreversible short digest only; never raw `login_id`, `nip`, `pin`, cookie, token, or password.
  - Add small accessor/reset helper for in-memory telemetry tests if needed; avoid log-based assertions where a pure counter can be asserted.
  - Keep compatibility for current untyped sessions, but add explicit comments/env guidance for future sunset.
  - Ensure `pin:` path still respects `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK`.

  **Must NOT do**:
  - Do not remove account/NIP/PIN compatibility.
  - Do not log raw subjects.
  - Do not add persistent telemetry schema.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Central session dispatch logic with compatibility risk.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES after T5
  - **Parallel Group**: Wave 2 with T8-T12
  - **Blocks**: T15, T16
  - **Blocked By**: T5

  **References**:
  - `lib/auth-session.ts:637-662` - Session dispatch and legacy waterfall.
  - `lib/auth-session.ts:29-36` - Legacy env flags.
  - `lib/auth-session.ts:212-220` - Existing fallback hit counter.
  - T5 helper - Safe telemetry output.

  **Acceptance Criteria**:
  - [ ] Prefix subjects dispatch directly with no waterfall.
  - [ ] Untyped sessions increment safe waterfall telemetry.
  - [ ] `EASYLINK_ENABLE_LEGACY_PIN_FALLBACK=false` blocks PIN fallback.
  - [ ] No raw subject appears in warnings/logs.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Canonical account subject skips waterfall
    Tool: Bash
    Preconditions: Helper test or local test harness available.
    Steps:
      1. Decode/use session subject `account:admin` in test harness.
      2. Assert account path chosen without incrementing waterfall counter.
    Expected Result: Account dispatch occurs and waterfall counter unchanged.
    Failure Indicators: Waterfall counter increments for prefixed subject.
    Evidence: .sisyphus/evidence/task-T7-prefixed-skips-waterfall.txt

  Scenario: Untyped legacy subject increments redacted telemetry
    Tool: Bash
    Preconditions: Helper test or local test harness available.
    Steps:
      1. Simulate untyped subject `1234567890`.
      2. Assert waterfall telemetry increments.
      3. Assert logs/telemetry do not include `1234567890`.
    Expected Result: Counter increments and raw subject absent.
    Failure Indicators: No counter increment or raw subject leaked.
    Evidence: .sisyphus/evidence/task-T7-untyped-telemetry-redacted.txt
  ```

  **Evidence to Capture**:
  - [ ] Test output/log capture.

  **Commit**: YES
  - Message: `fix(auth): instrument legacy session fallback safely`
  - Files: `lib/auth-session.ts`, tests/docs
  - Pre-commit: auth tests

- [ ] T8. Normalize login response parity for account and NIP paths

  **What to do**:
  - Ensure NIP login response includes `groups` and other safe auth context fields matching account response where applicable.
  - Keep response minimal: no password_hash, no secret tokens, no raw DB internals.
  - Consider small response builder helper to avoid divergence.

  **Must NOT do**:
  - Do not expose sensitive fields.
  - Do not change cookie/session behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Local API response normalization.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES after T6
  - **Parallel Group**: Wave 2 with T7, T9-T12
  - **Blocks**: T15
  - **Blocked By**: T6

  **References**:
  - `app/api/auth/login/route.js:61-75` - Account login response includes groups.
  - `app/api/auth/login/route.js:120-132` - NIP login response missing groups.
  - `lib/auth-session.ts:449-553` - NIP context includes groups/canonical roles.

  **Acceptance Criteria**:
  - [ ] Inspect all callers of login response fields before changing payload.
  - [ ] Changes are additive only: no rename/removal of existing account or NIP response fields.
  - [ ] Account login response still includes `groups`.
  - [ ] NIP login response includes `groups` with exact same array item shape as account path; if source data has no groups, return stable empty array rather than omitting field.
  - [ ] No password_hash/secret fields in response.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: NIP login returns groups
    Tool: Bash (curl)
    Preconditions: App server running with valid NIP credentials.
    Steps:
      1. POST `/api/auth/login` with JSON `{ "login_id": "<valid-nip>", "password": "<valid-password>" }`.
      2. Capture JSON response.
      3. Assert `ok: true` and `user.groups` is an array.
    Expected Result: Response has user.groups array and no password_hash.
    Failure Indicators: Missing groups, 401 for valid user, or sensitive field present.
    Evidence: .sisyphus/evidence/task-T8-nip-login-groups.json

  Scenario: Account login response unchanged
    Tool: Bash (curl)
    Preconditions: App server running with valid standalone account credentials.
    Steps:
      1. POST `/api/auth/login` with account credentials.
      2. Capture JSON response.
      3. Assert `ok: true`, `user.groups` array, `user.role_key` present.
    Expected Result: Account response contract preserved.
    Failure Indicators: Missing fields or sensitive fields leaked.
    Evidence: .sisyphus/evidence/task-T8-account-login-response.json
  ```

  **Evidence to Capture**:
  - [ ] Redacted curl JSON outputs.

  **Commit**: YES
  - Message: `fix(auth): align login response user fields`
  - Files: `app/api/auth/login/route.js`, optional tests
  - Pre-commit: auth tests/build

- [ ] T9. Document/guard global `useAuthSession` cache semantics

  **What to do**:
  - Add comments or small safeguards around module-level `sessionCache` and `inflightSessionPromise` in `hooks/use-auth-session.js`.
  - Analyze stale positive after logout, stale negative after login, cross-tab drift, and rapid route-change race with `/api/auth/me`.
  - Preserve 30s TTL and inflight dedup behavior unless adding safe invalidation event/hook.
  - Ensure logout/login reset remains explicit via `resetSessionCache()`.
  - Either add bounded-risk rationale for cross-tab drift or add low-risk invalidation hook/event.
  - If feasible, add tests for `fetchAuthSession(force)` behavior using mocked fetch.

  **Must NOT do**:
  - Do not remove shared cache/dedup benefit.
  - Do not make transient API failure trigger login redirect by itself.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small hook hardening/documentation.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `playwright` not needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 with T7, T8, T10-T12
  - **Blocks**: T15, T16
  - **Blocked By**: None

  **References**:
  - `hooks/use-auth-session.js:5-24` - TTL cache and inflight dedup.
  - `hooks/use-auth-session.js:57-63` - Reset API.
  - `app/login/page.jsx:51-54` - Post-login reset/refresh path.
  - `components/app-shell.jsx:58-60` - Shared hook consumer.

  **Acceptance Criteria**:
  - [ ] Cache semantics documented in-code or tests.
  - [ ] `refresh()` still forces fetch.
  - [ ] `resetSessionCache()` clears user/status/error/fetchedAt.
  - [ ] Transient fetch error does not itself redirect from app shell.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Force refresh bypasses cache
    Tool: Bash
    Preconditions: Hook helper test or mocked fetch script available.
    Steps:
      1. Mock `fetch` to count calls.
      2. Call `fetchAuthSession(false)` twice within 30s.
      3. Call `fetchAuthSession(true)` once.
      4. Assert fetch call count is 2 total, not 1 or 3.
    Expected Result: Cache hit for second normal call, force call bypasses cache.
    Failure Indicators: Dedup/cache broken.
    Evidence: .sisyphus/evidence/task-T9-force-refresh-cache.txt

  Scenario: Reset clears cached session
    Tool: Bash
    Preconditions: Hook helper test available.
    Steps:
      1. Populate session cache through mocked successful fetch.
      2. Call `resetSessionCache()`.
      3. Call `fetchAuthSession(false)` and assert fetch called again.
    Expected Result: Cache reset forces fresh fetch.
    Failure Indicators: Stale user returned after reset.
    Evidence: .sisyphus/evidence/task-T9-reset-cache.txt
  ```

  **Evidence to Capture**:
  - [ ] Test/mock output.

  **Commit**: YES
  - Message: `refactor(auth): document session cache behavior`
  - Files: `hooks/use-auth-session.js`, optional tests
  - Pre-commit: related tests/build

- [ ] T10. Align scanlog auth UX or prove API-only auth is sufficient

  **What to do**:
  - Inspect `app/scanlog/page.jsx` and backing scanlog API routes.
  - If API routes enforce auth, add UI handling for unauthenticated/401 state consistent with other pages.
  - If API routes do not enforce auth, add server-side auth checks to APIs and client redirect/status treatment.
  - Prefer `useAuthSession()` for UX consistency if it does not create request loops.

  **Must NOT do**:
  - Do not fan out expensive reads on every mount.
  - Do not treat transient API failure as auth expiry unless 401/403 or another confirmed auth-meaningful failure.
  - Do not redirect to login on generic scanlog/API/data failure; show recoverable error with manual retry instead.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI auth-state behavior and page feedback.
  - **Skills**: [`playwright`]
    - `playwright`: Needed for browser QA screenshots and redirects.
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 with T7-T9, T11-T12
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `app/scanlog/page.jsx:1-18` - Current page imports; lacks `useAuthSession` in reviewed section.
  - `app/attendance/page.jsx:34-40` - Auth/session and authorization pattern to compare.
  - `components/app-shell.jsx:58-60` - App shell auth state source.
  - `lib/request-json.js:10-24` - API error behavior.

  **Acceptance Criteria**:
  - [ ] Unauthenticated scanlog access receives consistent login/unauthorized UX.
  - [ ] Authenticated scanlog access still works.
  - [ ] API protection remains server-enforced or is added if missing.
  - [ ] No interval polling or repeated auth fetch loop introduced.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Unauthenticated scanlog access handled safely
    Tool: Playwright
    Preconditions: Browser context has no `easylink_session` cookie.
    Steps:
      1. Navigate to `/scanlog`.
      2. Wait up to 10s for page response.
      3. Assert either redirected to `/login` with safe `next=/scanlog` or unauthorized panel appears with login action.
    Expected Result: No protected scanlog data shown while unauthenticated.
    Failure Indicators: Data table visible or endless loading.
    Evidence: .sisyphus/evidence/task-T10-unauth-scanlog.png

  Scenario: Authenticated scanlog loads data shell
    Tool: Playwright
    Preconditions: Valid logged-in session cookie exists.
    Steps:
      1. Navigate to `/scanlog`.
      2. Wait for scanlog table/status panel selector.
      3. Assert page title/filter/table shell visible.
    Expected Result: Scanlog UI loads without auth error.
    Failure Indicators: Redirect to login for valid session or repeated fetch loop.
    Evidence: .sisyphus/evidence/task-T10-auth-scanlog.png
  ```

  **Evidence to Capture**:
  - [ ] Screenshots and network/status logs.

  **Commit**: YES
  - Message: `fix(scanlog): align auth access feedback`
  - Files: `app/scanlog/page.jsx`, scanlog API route if needed
  - Pre-commit: build/lint

- [ ] T11. Add `tableExistsCache` TTL/invalidation helper

  **What to do**:
  - Replace permanent boolean cache for table existence with TTL-based cache or explicit invalidation helper.
  - Preserve performance benefit while avoiding stale process-lifetime schema state.
  - Keep no-schema-change behavior.

  **Must NOT do**:
  - Do not query information_schema on every request if avoidable.
  - Do not change DB schema.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small cache helper change.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 with T7-T10, T12
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:222` - Current `tableExistsCache` map.
  - `lib/auth-session.ts:288-304` - `hasTable()` implementation.
  - `app/api/users/route.js` - Similar schema detection patterns may exist; avoid conflicting changes.

  **Acceptance Criteria**:
  - [ ] Cached table existence expires after documented TTL.
  - [ ] Helper can be invalidated in tests/dev if exported safely.
  - [ ] Existing auth behavior unchanged.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: hasTable cache hit avoids duplicate query
    Tool: Bash
    Preconditions: Unit/helper test with mocked pool query available.
    Steps:
      1. Call `hasTable("auth_accounts")` twice within TTL.
      2. Assert information_schema query count is 1.
    Expected Result: Cache hit used for second call.
    Failure Indicators: Query count 2 within TTL.
    Evidence: .sisyphus/evidence/task-T11-cache-hit.txt

  Scenario: hasTable cache expires after TTL
    Tool: Bash
    Preconditions: Unit/helper test can fake time or use exported invalidation.
    Steps:
      1. Call `hasTable("auth_accounts")` once.
      2. Advance time past TTL or invalidate cache.
      3. Call `hasTable("auth_accounts")` again.
      4. Assert query count increments to 2.
    Expected Result: Expired cache revalidates.
    Failure Indicators: Permanent stale cache persists.
    Evidence: .sisyphus/evidence/task-T11-cache-ttl.txt
  ```

  **Evidence to Capture**:
  - [ ] Test output.

  **Commit**: YES
  - Message: `refactor(auth): bound table existence cache lifetime`
  - Files: `lib/auth-session.ts`, tests
  - Pre-commit: auth tests/build

- [ ] T12. Tighten AUTH_SECRET dev fallback guard/docs

  **What to do**:
  - Keep production throw when `AUTH_SECRET` missing.
  - Make dev fallback warning explicit and searchable.
  - Add doc note or test ensuring production without `AUTH_SECRET` throws.
  - Consider opt-in env for dev fallback if low risk, but do not break local dev unexpectedly.

  **Must NOT do**:
  - Do not allow missing `AUTH_SECRET` in production.
  - Do not print actual secret values.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small guard/documentation/test work.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 with T7-T11
  - **Blocks**: T16
  - **Blocked By**: None

  **References**:
  - `lib/auth-session.ts:12-19` - `AUTH_SECRET` fallback logic.
  - `docs/agent-context/session-handoff-2026-06-01-auth-model-and-login-fix.md` - Existing auth context doc.

  **Acceptance Criteria**:
  - [ ] Production missing `AUTH_SECRET` still throws.
  - [ ] Dev fallback warning remains explicit.
  - [ ] Documentation records deploy requirement.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Production without AUTH_SECRET throws
    Tool: Bash
    Preconditions: Test can import auth module in isolated process.
    Steps:
      1. Run Node process with `NODE_ENV=production` and no `AUTH_SECRET`.
      2. Import `lib/auth-session.ts` through available test/build path.
      3. Capture thrown error.
    Expected Result: Error text includes `AUTH_SECRET env var is required in production`.
    Failure Indicators: Module loads successfully without secret.
    Evidence: .sisyphus/evidence/task-T12-prod-secret-required.txt

  Scenario: Dev fallback warns without exposing secret
    Tool: Bash
    Preconditions: Test can import auth module in dev env without AUTH_SECRET.
    Steps:
      1. Run Node process with `NODE_ENV=development` and no `AUTH_SECRET`.
      2. Capture stderr.
      3. Assert warning contains `dev-only` and does not print secret value.
    Expected Result: Warning emitted, no secret printed.
    Failure Indicators: Silent fallback or secret leakage.
    Evidence: .sisyphus/evidence/task-T12-dev-fallback-warning.txt
  ```

  **Evidence to Capture**:
  - [ ] Isolated process output.

  **Commit**: YES
  - Message: `docs(auth): clarify auth secret requirement`
  - Files: `lib/auth-session.ts`, docs/tests
  - Pre-commit: auth tests/build

- [ ] T13. Assess and safely extract `app/api/users/route.js` internals if behavior-neutral

  **What to do**:
  - Map responsibilities in `app/api/users/route.js`: GET merge/dedup, POST create identity rows, PUT update canonical/legacy rows, DELETE multi-table removal, schema detection helpers.
  - If safe, extract pure helpers to adjacent module(s) with no behavior change.
  - If not safe within this hardening scope, leave code intact and add concise documented assessment with future extraction boundaries.
  - Add regression tests around extracted pure helpers if extraction occurs.

  **Must NOT do**:
  - Do not rewrite CRUD behavior.
  - Do not change DB write ordering or schema assumptions.
  - Do not create broad service architecture beyond behavior-neutral extraction.

  **Recommended Agent Profile**:
  - **Category**: `refactorer`
    - Reason: Behavior-preserving refactor assessment/extraction.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 with T14-T16
  - **Blocks**: T15 if extraction happens
  - **Blocked By**: None

  **References**:
  - `app/api/users/route.js` - Large route under review.
  - `docs/agent-context/session-handoff-2026-06-01-auth-model-and-login-fix.md` - Auth/user model caveats.
  - Existing route helper patterns in repo if found by executor.

  **Acceptance Criteria**:
  - [ ] Responsibility map documented in plan evidence or code comments/docs.
  - [ ] If extraction occurs, public API behavior unchanged for GET/POST/PUT/DELETE.
  - [ ] If extraction does not occur, rationale is explicit and future extraction seams listed.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Users route GET behavior unchanged
    Tool: Bash (curl)
    Preconditions: App server running with authenticated admin session.
    Steps:
      1. GET `/api/users?page=1&pageSize=10` before/after or against updated route.
      2. Assert status 200 and JSON shape still includes expected pagination/user fields.
    Expected Result: Response shape unchanged.
    Failure Indicators: 500 error, missing pagination, changed field names.
    Evidence: .sisyphus/evidence/task-T13-users-get-shape.json

  Scenario: Refactor assessment recorded
    Tool: Bash
    Preconditions: Task completed.
    Steps:
      1. Check evidence or docs for `users-route-refactor-assessment`.
      2. Assert GET/POST/PUT/DELETE responsibilities and future seams are listed.
    Expected Result: Assessment exists even if no extraction done.
    Failure Indicators: No assessment and no extraction/tests.
    Evidence: .sisyphus/evidence/task-T13-refactor-assessment.txt
  ```

  **Evidence to Capture**:
  - [ ] API response output and assessment file/log.

  **Commit**: YES if code/docs changed
  - Message: `refactor(users): document route extraction seams`
  - Files: `app/api/users/route.js`, optional helper/docs/tests
  - Pre-commit: build/API smoke

- [ ] T14. Remove deprecated `X-XSS-Protection` or replace with documented header policy

  **What to do**:
  - Decide whether to remove `X-XSS-Protection` from `SECURITY_HEADERS` or leave with comment; recommended: remove deprecated header and rely on modern headers.
  - Do not add a partial CSP unless app assets/scripts are audited.
  - Confirm remaining security headers still set.

  **Must NOT do**:
  - Do not introduce CSP that breaks Next.js/runtime assets.
  - Do not remove `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small middleware header cleanup.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 with T13, T15-T16
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `middleware.ts:45-57` - Security header map.
  - `middleware.ts:114-125` - Header application.

  **Acceptance Criteria**:
  - [ ] Deprecated `X-XSS-Protection` handled intentionally.
  - [ ] Other existing security headers still present.
  - [ ] HSTS still production-only.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Modern security headers still present
    Tool: Bash (curl)
    Preconditions: App server running.
    Steps:
      1. GET `/` and capture response headers.
      2. Assert `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` present.
    Expected Result: Modern headers present.
    Failure Indicators: Any required header missing.
    Evidence: .sisyphus/evidence/task-T14-security-headers.txt

  Scenario: Deprecated header policy explicit
    Tool: Bash
    Preconditions: Code changed.
    Steps:
      1. Inspect `middleware.ts` for `X-XSS-Protection`.
      2. If absent, assert removal noted in commit/task evidence. If present, assert comment explains legacy compatibility.
    Expected Result: Header status intentional, not accidental.
    Failure Indicators: Deprecated header remains without rationale.
    Evidence: .sisyphus/evidence/task-T14-xss-header-policy.txt
  ```

  **Evidence to Capture**:
  - [ ] Header output and code search result.

  **Commit**: YES
  - Message: `fix(middleware): update security header policy`
  - Files: `middleware.ts`
  - Pre-commit: build/lint

- [ ] T15. Add integration/security regression tests and commands

  **What to do**:
  - Consolidate tests from T1-T14 into reliable commands.
  - Add missing regression coverage for redirect sanitizer, password comparison, legacy fallback telemetry, rate limit helper, cookie secure helper, login response parity, cache semantics, and table cache TTL where practical.
  - Record unavailable commands/scripts clearly if project lacks lint/build/test script.

  **Must NOT do**:
  - Do not make tests depend on production secrets or real credentials unless using explicit local fixtures/env.
  - Do not leave flaky timing-based tests without fake timers or deterministic invalidation.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: Cross-cutting regression coverage.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `playwright` handled in QA scenarios; this task focuses automated tests.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 after T1-T14 where tests depend on final code.
  - **Blocks**: F1-F4
  - **Blocked By**: T1-T14

  **References**:
  - `tests/auth-hardening.test.js` - Existing Node test runner suite.
  - `lib/auth-hardening-helpers.js` - Existing pure helper test pattern.
  - `package.json` - Available scripts.
  - All changed files from T1-T14.

  **Acceptance Criteria**:
  - [ ] Automated tests cover high-risk security helper changes.
  - [ ] `node --test tests/auth-hardening.test.js` passes.
  - [ ] Build/lint available commands pass or are documented unavailable.
  - [ ] QA evidence paths for all tasks exist.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Security regression suite passes
    Tool: Bash
    Preconditions: T1-T14 complete.
    Steps:
      1. Run `node --test tests/auth-hardening.test.js`.
      2. Capture full output.
      3. Assert exit code 0.
    Expected Result: All security regression tests pass.
    Failure Indicators: Any failed/skipped unexpectedly test.
    Evidence: .sisyphus/evidence/task-T15-security-regression-suite.txt

  Scenario: Project build or nearest equivalent passes
    Tool: Bash
    Preconditions: Dependencies installed.
    Steps:
      1. Inspect `package.json` scripts.
      2. Run `npm run build` if available; otherwise nearest equivalent documented by executor.
      3. Capture full output.
    Expected Result: Build/equivalent exits 0 or documented unavailable with rationale.
    Failure Indicators: Build error or missing rationale.
    Evidence: .sisyphus/evidence/task-T15-build-equivalent.txt
  ```

  **Evidence to Capture**:
  - [ ] Full test/build outputs.

  **Commit**: YES
  - Message: `test(auth): add security regression coverage`
  - Files: tests and helpers
  - Pre-commit: test/build commands

- [ ] T16. Update auth docs/session handoff for changed behavior

  **What to do**:
  - Update existing auth/session handoff doc or nearest project auth context doc.
  - Record redirect sanitization, legacy fallback telemetry/guardrails, plaintext password behavior, cookie secure helper behavior, table cache TTL, and `AUTH_SECRET` production requirement.
  - Keep docs concise and operational.

  **Must NOT do**:
  - Do not create broad new documentation tree unless existing docs are insufficient.
  - Do not include credentials or secrets.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation/handoff update.
  - **Skills**: []
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES after relevant auth tasks
  - **Parallel Group**: Wave 3 with T13-T15
  - **Blocks**: F1-F4
  - **Blocked By**: T7, T9, T12

  **References**:
  - `docs/agent-context/session-handoff-2026-06-01-auth-model-and-login-fix.md` - Existing auth model context.
  - `docs/agent-context/current-project-context.md` - Current project context if auth behavior belongs there.
  - `AGENTS.md` - Repo defaults around auth failures and request loops.

  **Acceptance Criteria**:
  - [ ] Docs reflect changed auth/session behavior.
  - [ ] No secrets or raw identifiers included.
  - [ ] Future agents can understand legacy fallback state and env flags.

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Auth docs mention security changes
    Tool: Bash
    Preconditions: Docs updated.
    Steps:
      1. Search docs for `AUTH_SECRET`, `legacy`, `next`, and `plaintext`.
      2. Assert updated doc includes concise notes for each.
    Expected Result: Required topics present.
    Failure Indicators: Missing any required topic.
    Evidence: .sisyphus/evidence/task-T16-doc-topics.txt

  Scenario: Docs contain no secrets
    Tool: Bash
    Preconditions: Docs updated.
    Steps:
      1. Search updated docs for obvious secret patterns: `password=`, `AUTH_SECRET=`, `easylink_session=`.
      2. Assert no real values are present.
    Expected Result: No secrets or session tokens in docs.
    Failure Indicators: Secret-looking value found.
    Evidence: .sisyphus/evidence/task-T16-no-secrets.txt
  ```

  **Evidence to Capture**:
  - [ ] Search output.

  **Commit**: YES
  - Message: `docs(auth): record hardening guardrails`
  - Files: existing docs under `docs/agent-context/`
  - Pre-commit: none, plus secret search

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated evidence summary after agent verification.
>
> Implementation verification remains agent-executed; no acceptance criterion may require human manual testing. User-facing summary is handoff/status, not a verification dependency.

- [ ] F0. **Required Post-Implementation Review** — `/review-work`
  Invoke the `review-work` skill after all implementation tasks complete. It launches the required multi-agent post-implementation review for significant changes. All findings must be addressed or explicitly documented before final handoff.
  Output: `Review-work [PASS/FAIL] | Findings [N addressed/N open] | VERDICT`

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run available typecheck/build/lint/test commands. Review all changed files for `as any`/`@ts-ignore`, empty catches, console.log in production, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Agent-Executed End-to-End QA** — default QA executor (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Use Playwright for browser/UI, Bash/curl for API, and node tests for modules. Test account login, NIP login, invalid redirect, invalid credentials, session check, scanlog access, and middleware limits. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond spec built. Check "Must NOT do" compliance. Detect cross-task contamination and unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1**: `fix(auth): harden login and session compatibility` — T1, T2, T5, T6, T7, T8, T12
- **Commit 2**: `fix(middleware): clarify rate limits and headers` — T3, T14
- **Commit 3**: `refactor(auth): share cookie security and cache helpers` — T4, T9, T11
- **Commit 4**: `fix(scanlog): align auth access feedback` — T10
- **Commit 5**: `refactor(users): extract route internals safely` — T13 if behavior-neutral extraction occurs
- **Commit 6**: `test(auth): add security regression coverage` — T15
- **Commit 7**: `docs(auth): record auth hardening behavior` — T16

---

## Success Criteria

### Verification Commands
```bash
node --test tests/auth-hardening.test.js
npm run typecheck
npm run lint
npm run build
```

Minimum closure also requires clean `lsp_diagnostics` on changed files.
If project lacks one of these scripts, executor must document unavailable command and run nearest available equivalent from `package.json`.

### Final Checklist
- [ ] All 15 review findings resolved or explicitly documented with accepted rationale.
- [ ] Account login still succeeds.
- [ ] NIP login still succeeds.
- [ ] Legacy session fallback behavior is measured/guarded, not silently removed.
- [ ] Empty legacy password never authenticates.
- [ ] Login redirect rejects external and protocol-relative targets.
- [ ] Rate limit behavior matches "allow N, block N+1".
- [ ] No sensitive auth values in logs.
- [ ] All task QA evidence exists.
- [ ] Final verification agents approve.
