# HOP B Windows-to-VM Scanlog Sync Plan

## TL;DR

> **Quick Summary**: Build missing HOP B so Windows local staging DB sends scanlog batches to Linux VM over private HTTP ingest, and Linux VM becomes canonical writer for app-side attendance data.
>
> **Deliverables**:
> - Windows-side outbound scanlog batch sender from local DB
> - Linux VM private ingest API for scanlog batches
> - Idempotent ingest ledger + dedupe/ack flow
> - Direct-cutover rollout path for Windows + Linux update together
> - Post-implementation tests-after coverage and agent-run QA evidence
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 -> Task 4 -> Task 8 -> Task 12 -> F1-F4

---

## Context

### Original Request
Create missing HOP B plan for syncing scanlogs from Windows local DB into Linux VM app side, assuming HOP B is not persistent or created yet, with simultaneous Windows and Linux updates.

### Interview Summary
**Key Discussions**:
- Intended architecture is `Device/FService -> Windows local staging DB -> Linux VM ingest API -> canonical Linux DB/UI`.
- User selected **scanlogs only** for first scope.
- User selected **direct cutover** instead of shadow mode.
- User selected **tests after** instead of TDD.

**Research Findings**:
- `ops/fservice-sync/FULL-SETUP-STEPS.md` is only repo artifact that explicitly describes HOP B direction.
- `ops/fservice-sync/sync.php` currently fetches from FService and writes only to local MySQL.
- `ops/fservice-sync/web/index.php` currently controls bridge/local DB sync only; no VM push path exists.
- `app/api/scanlog/sync/route.js` is VM-side pull/ingest from SDK bridge, not Windows DB push ingest.
- Current repo lacks Windows outbox sender, VM ingest endpoint, auth contract, retry/ack ledger, and HOP B observability.

### Metis Review
**Identified Gaps** (addressed):
- Missing decision on ack boundary -> plan locks sent-state update to durable VM commit only.
- Missing direct-cutover outage behavior -> plan assumes Windows keeps buffering locally, retries with backoff, and raises operator-visible alarm thresholds.
- Missing replay/conflict policy -> plan locks deterministic idempotency key + immutable ingest ledger.
- Missing scope-creep guardrails -> plan excludes user sync, machine sync redesign, and HOP A rework beyond minimum handoff changes.

---

## Work Objectives

### Core Objective
Create production-safe HOP B path so scanlog records already stored in Windows local DB can be sent to Linux VM through a private API, durably ingested once-or-safely-retried, and then used by canonical app reporting on Linux.

### Concrete Deliverables
- Windows-side scanlog outbox model and sender flow inside `ops/fservice-sync/`
- Linux VM ingest endpoint(s) under `app/api/**` for private scanlog batch intake
- Ingest ledger, replay-safe idempotency, and deterministic dedupe rules
- Operator-visible error/reporting path for direct cutover failures
- Tests-after coverage for contract, ingest, replay, and failure handling

### Definition of Done
- [ ] Windows can send unsynced scanlogs from local DB to Linux VM ingest API and receive durable ack
- [ ] Linux VM writes accepted scanlogs into canonical app-side storage without duplicate inserts on replay
- [ ] Retry flow preserves unsent data during VM outage and resumes after recovery
- [ ] Direct cutover removes dependency on VM pull route for target scanlog path
- [ ] Automated tests selected for this work pass
- [ ] Agent-executed QA evidence exists for happy path and outage/retry path

### Must Have
- Private HTTP ingest path from Windows to Linux VM
- At-least-once delivery with idempotent replay safety
- Durable ingest ledger on Linux VM
- Durable outbound state on Windows local DB
- Clear auth between Windows sender and Linux ingest
- No human-only verification steps

### Must NOT Have (Guardrails)
- No direct Windows -> remote MySQL writes
- No scope expansion into user sync in this plan
- No full HOP A rewrite unless strictly needed for HOP B handoff
- No silent drop of scanlogs on partial failures
- No marking records as sent before durable Linux ack
- No dependence on manual browser clicks for regular sync execution

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: project-native JavaScript test/build tooling already in repo
- **If TDD**: Not selected for this plan

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright only if admin screens or cutover status UI changes are added
- **TUI/CLI**: Use Bash / PowerShell for PHP worker runs, logs, and exit-code checks
- **API/Backend**: Use Bash (`curl`) against Linux ingest endpoints and existing Next.js API routes
- **Library/Module**: Use project test command and targeted script execution for mapper/dedupe logic

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately - contract + schema + boundaries):
├── Task 1: Define batch contract + field mapping [writing]
├── Task 2: Add Windows outbox schema/state model [quick]
├── Task 3: Add Linux ingest ledger schema/state model [quick]
├── Task 4: Define auth/config contract for private ingest [quick]
└── Task 5: Define direct-cutover observability + alarms [writing]

Wave 2 (After Wave 1 - Windows sender + Linux ingest core):
├── Task 6: Build Windows batch selector/serializer [unspecified-high]
├── Task 7: Build Windows sender + ack handling [unspecified-high]
├── Task 8: Build Linux private ingest endpoint [deep]
├── Task 9: Build Linux dedupe + canonical write service [deep]
└── Task 10: Build failure logging + retry scheduling hooks [unspecified-high]

Wave 3 (After Wave 2 - integration + cutover):
├── Task 11: Wire Windows worker execution path [quick]
├── Task 12: Cut app path to canonical HOP B ingest flow [deep]
├── Task 13: Add operational status surfaces/log export [unspecified-high]
└── Task 14: Add tests-after coverage for sender/ingest/replay [testing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 -> Task 4 -> Task 8 -> Task 12 -> F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5
```

### Dependency Matrix

- **1**: - -> 6, 8, 9, 14
- **2**: - -> 6, 7, 10, 11
- **3**: - -> 8, 9, 10, 12
- **4**: - -> 7, 8, 11, 12
- **5**: - -> 10, 13, F3
- **6**: 1,2 -> 7, 14
- **7**: 2,4,6 -> 11, 14
- **8**: 1,3,4 -> 9, 12, 14
- **9**: 1,3,8 -> 12, 14
- **10**: 2,3,5 -> 11, 13, 14
- **11**: 2,4,7,10 -> 12, F3
- **12**: 3,4,8,9,11 -> 13, 14, F1-F4
- **13**: 5,10,12 -> F3, F4
- **14**: 6,7,8,9,10,12 -> F2, F3

### Agent Dispatch Summary

- **1**: **5** - T1 -> `writing`, T2 -> `quick`, T3 -> `quick`, T4 -> `quick`, T5 -> `writing`
- **2**: **5** - T6 -> `unspecified-high`, T7 -> `unspecified-high`, T8 -> `deep`, T9 -> `deep`, T10 -> `unspecified-high`
- **3**: **4** - T11 -> `quick`, T12 -> `deep`, T13 -> `unspecified-high`, T14 -> `testing`
- **FINAL**: **4** - F1 -> `oracle`, F2 -> `unspecified-high`, F3 -> `unspecified-high`, F4 -> `deep`

---

## TODOs

- [x] 1. Define scanlog batch contract + field mapping

  **What to do**:
  - Define exact outbound scanlog payload envelope for Windows -> Linux VM.
  - Freeze required fields, optional fields, batch metadata, schema version, ack response shape, and field mapping from Windows local DB rows into VM ingest records.
  - Record deterministic idempotency key policy and conflict-resolution rule for duplicate/replayed records.

  **Must NOT do**:
  - Do not include user sync fields or user-sync behavior.
  - Do not rely on implicit field naming without written mapping.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: contract/spec work with cross-system clarity needs more precision than code-first speed.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-patterns`: no frontend domain overlap.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: 6, 8, 9, 14
  - **Blocked By**: None

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\FULL-SETUP-STEPS.md` - only existing repo description of intended HOP B and staging/ingest direction.
  - `E:\Project\easylink-frontend\ops\fservice-sync\sync.php` - current Windows-local scanlog source shape and field extraction behavior.
  - `E:\Project\easylink-frontend\app\api\scanlog\sync\route.js` - existing VM-side normalization/ingest behavior to align canonical write expectations.

  **Acceptance Criteria**:
  - [ ] Batch envelope fields and ack response fields documented in code-adjacent spec or plan-linked artifact.
  - [ ] Idempotency key formula is explicit and executable.
  - [ ] Field mapping covers every scanlog field required for canonical VM write.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Valid batch contract accepted by schema validator
    Tool: Bash
    Preconditions: Contract/schema artifact exists in repo
    Steps:
      1. Run project command or script that validates sample outbound scanlog batch against schema
      2. Use sample batch with concrete fields: `device_sn="Fio66208021230737"`, `batch_id="batch-001"`, one record with concrete scan time
      3. Assert validator exits 0 and prints success/accepted result
    Expected Result: Sample valid batch passes validation
    Failure Indicators: Missing required field, wrong type, non-zero exit code
    Evidence: .sisyphus/evidence/task-1-valid-contract.txt

  Scenario: Replay/duplicate key policy rejects ambiguous record shape
    Tool: Bash
    Preconditions: Duplicate-policy validator or targeted test exists
    Steps:
      1. Run targeted test with two records missing required dedupe fields
      2. Assert output marks payload invalid or rejected
    Expected Result: Invalid duplicate-prone payload fails with explicit reason
    Failure Indicators: Payload accepted without deterministic key
    Evidence: .sisyphus/evidence/task-1-invalid-dedupe.txt
  ```

  **Evidence to Capture:**
  - [ ] Validator output or targeted test output

  **Commit**: NO

- [x] 2. Add Windows outbox schema/state model

  **What to do**:
  - Add durable local DB state so Windows can track unsent, in-flight, sent, failed, retryable scanlog batches.
  - Define batch table(s), row state transitions, batch watermark/checkpoint behavior, and retention rules for direct cutover.
  - Include minimum schema changes needed for local observability and retry safety.

  **Must NOT do**:
  - Do not mark rows sent before Linux durable ack.
  - Do not require remote DB connectivity for local state transitions.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused schema/state definition touching narrow DB concern.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `tdd`: user selected tests-after.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6, 7, 10, 11
  - **Blocked By**: None

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\FULL-SETUP-STEPS.md` - proposed staging/outbox concepts (`sync_batch`, `sync_batch_item`, `fetch_checkpoint`).
  - `E:\Project\easylink-frontend\ops\fservice-sync\sync.php` - current local source tables and write pattern feeding outbox selection.
  - `E:\Project\easylink-frontend\docs\remote-machine-findings\responses.md` - evidence of current Windows DB drift and minimal current table set.

  **Acceptance Criteria**:
  - [ ] Windows local schema can represent unsent/in-flight/sent/failed batch lifecycle.
  - [ ] Schema includes retry metadata and last-error capture.
  - [ ] Outbox schema avoids coupling to Linux DB internals.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Local schema supports unsent to sent transition after simulated ack
    Tool: Bash
    Preconditions: Local DB schema migration applied in test/staging DB
    Steps:
      1. Insert one unsent batch row with concrete batch_id `batch-001`
      2. Run targeted state-transition test/script simulating success ack
      3. Query local batch table and assert status is `sent` and ack timestamp set
    Expected Result: Batch transitions only after simulated durable ack
    Failure Indicators: Status changes before ack or required timestamps missing
    Evidence: .sisyphus/evidence/task-2-state-success.txt

  Scenario: Failed ack keeps batch retryable
    Tool: Bash
    Preconditions: Local DB schema migration applied
    Steps:
      1. Insert one in-flight batch row
      2. Run targeted test/script simulating 500 response from VM
      3. Query row and assert status is `failed` or `retryable`, with last_error populated
    Expected Result: Failed batch remains present and retry metadata updates
    Failure Indicators: Batch deleted or marked sent on failure
    Evidence: .sisyphus/evidence/task-2-state-failure.txt
  ```

  **Evidence to Capture:**
  - [ ] Query output showing state transitions

  **Commit**: NO

- [x] 3. Add Linux ingest ledger schema/state model

  **What to do**:
  - Add durable Linux-side ingest ledger for batch receipt, payload hash, ack state, and replay detection.
  - Define per-batch and per-record persistence needed to safely reject or ignore duplicate replay.
  - Ensure canonical write flow can tie accepted rows back to source batch.

  **Must NOT do**:
  - Do not rely only on in-memory queue state.
  - Do not treat duplicate detection as best-effort logging only.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: bounded schema/ledger concern with strong contract dependency.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: no UI work here.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 8, 9, 10, 12
  - **Blocked By**: None

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\FULL-SETUP-STEPS.md` - proposed ingest and staging concepts.
  - `E:\Project\easylink-frontend\app\api\scanlog\sync\route.js` - existing safe-batch/event model to align or reuse patterns.
  - Oracle guidance recorded in draft `.sisyphus/drafts/hop-b-sync-plan.md` - recommends durable `ingest_batches` style ledger and at-least-once idempotent handling.

  **Acceptance Criteria**:
  - [ ] Linux schema persists batch receipt before response ack.
  - [ ] Replay of same batch_id is detectable without relying on app memory.
  - [ ] Canonical record linkage to source batch is queryable.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: First-time batch receipt creates ledger row
    Tool: Bash
    Preconditions: Linux schema migration applied in dev DB
    Steps:
      1. POST one concrete batch payload to ingest endpoint test harness or persistence function
      2. Query ingest ledger table by `batch_id="batch-001"`
      3. Assert row exists with status `accepted` or equivalent durable state
    Expected Result: Batch receipt stored durably before final success path completes
    Failure Indicators: No ledger row or missing payload hash/status
    Evidence: .sisyphus/evidence/task-3-ledger-create.txt

  Scenario: Replay of same batch_id does not create second accepted batch
    Tool: Bash
    Preconditions: Same batch already inserted once
    Steps:
      1. Submit same payload again
      2. Query ledger and canonical scanlog count
      3. Assert no duplicate canonical insert and duplicate/replay outcome recorded
    Expected Result: Replay handled idempotently
    Failure Indicators: Duplicate canonical rows or second accepted ledger row without replay mark
    Evidence: .sisyphus/evidence/task-3-ledger-replay.txt
  ```

  **Evidence to Capture:**
  - [ ] Ledger query output and replay query output

  **Commit**: NO

- [x] 4. Define auth/config contract for private ingest

  **What to do**:
  - Define how Windows sender authenticates to Linux ingest on private LAN/VPN.
  - Freeze required env/config names for Windows and Linux, secret placement, request headers, and failure codes for auth problems.
  - Include replay-safe request signing or fixed bearer policy chosen for MVP.

  **Must NOT do**:
  - Do not depend on browser session auth.
  - Do not hardcode env-sensitive hostnames or secrets.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: small but security-critical config boundary.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `ocs-runtime-validation`: useful later in execution, not required for plan authoring.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 7, 8, 11, 12
  - **Blocked By**: None

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\FULL-SETUP-STEPS.md` - mentions `VM_API_BASE` and `VM_API_TOKEN` as intended config knobs.
  - `E:\Project\easylink-frontend\docs\agent-context\current-project-context.md` - private-only LAN/VPN deployment constraint.
  - `E:\Project\easylink-frontend\docs\agent-restrictions.md` - avoid hardcoded env-sensitive endpoints and preserve auth rigor.

  **Acceptance Criteria**:
  - [ ] Config variable names and header contract are explicitly defined for both sides.
  - [ ] Unauthorized request outcome is deterministic and logged.
  - [ ] Secret material is read from environment or secure config, never source literals.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Valid auth header accepted by ingest
    Tool: Bash (curl)
    Preconditions: Ingest endpoint running with configured secret
    Steps:
      1. POST concrete sample batch to Linux ingest endpoint with valid auth header
      2. Assert HTTP status is 200/202 and JSON ack returned
    Expected Result: Authorized request accepted
    Failure Indicators: 401/403 or non-JSON response
    Evidence: .sisyphus/evidence/task-4-auth-valid.txt

  Scenario: Invalid auth header rejected cleanly
    Tool: Bash (curl)
    Preconditions: Ingest endpoint running
    Steps:
      1. POST same sample batch with invalid token `bad-token`
      2. Assert HTTP status is 401 or 403 and body includes machine-readable auth error
    Expected Result: Unauthorized request rejected without data write
    Failure Indicators: Request accepted or server error 500
    Evidence: .sisyphus/evidence/task-4-auth-invalid.txt
  ```

  **Evidence to Capture:**
  - [ ] Curl request/response outputs

  **Commit**: NO

- [x] 5. Define direct-cutover observability + alarms

  **What to do**:
  - Define minimum logs, counters, backlog indicators, and operator-visible alarms required because user selected direct cutover.
  - Include outage thresholds, where failures surface, and what evidence executor must capture during failures.
  - Define success/failure operational checklist for first deployment.

  **Must NOT do**:
  - Do not rely on hidden logs only.
  - Do not leave backlog growth or repeated auth failures without operator signal.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: operational contract/spec task spanning Windows and Linux behavior.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `ocs-seo-audit`: unrelated domain.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 10, 13, F3
  - **Blocked By**: None

  **References**:
  - `.sisyphus/drafts/hop-b-sync-plan.md` - Metis highlighted direct-cutover outage, alarm, and blind-spot risks.
  - `E:\Project\easylink-frontend\docs\agent-context\current-project-context.md` - private deployment context affects who sees and acts on alarms.

  **Acceptance Criteria**:
  - [ ] Backlog, retry, auth-failure, and ingest-failure signals are explicitly defined.
  - [ ] First-deploy operational checks are documented.
  - [ ] Failure evidence locations are specified.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Failed VM connection produces visible backlog/error signal
    Tool: Bash
    Preconditions: Sender configured, VM endpoint intentionally unreachable
    Steps:
      1. Run sender against unreachable VM host
      2. Inspect defined status/log output location
      3. Assert backlog count/error indicator increased and message names VM connectivity issue
    Expected Result: Outage becomes visible to operator tooling/logs
    Failure Indicators: Silent failure or no backlog signal
    Evidence: .sisyphus/evidence/task-5-outage-visibility.txt

  Scenario: Repeated auth failures trigger distinct alarm path
    Tool: Bash
    Preconditions: Sender configured with invalid token
    Steps:
      1. Run sender twice with invalid auth
      2. Inspect log/status output
      3. Assert auth failures are distinguishable from network failures
    Expected Result: Auth problem logged/flagged separately
    Failure Indicators: Generic unknown error only
    Evidence: .sisyphus/evidence/task-5-auth-visibility.txt
  ```

  **Evidence to Capture:**
  - [ ] Status output and error log samples

  **Commit**: NO

- [x] 6. Build Windows batch selector/serializer

  **What to do**:
  - Implement Windows-side logic that selects unsynced scanlogs from local DB and serializes them into contract-compliant outbound batches.
  - Support deterministic ordering, bounded batch size, and repeatable serialization for retries.
  - Ensure selected rows can be traced back to local source records.

  **Must NOT do**:
  - Do not serialize rows without stable ordering.
  - Do not mutate source rows during selection before ack.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: logic-heavy worker behavior with DB + payload construction.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-patterns`: no frontend overlap.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: 7, 14
  - **Blocked By**: 1, 2

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\sync.php` - current local scanlog shape and source table usage.
  - `E:\Project\easylink-frontend\ops\fservice-sync\FULL-SETUP-STEPS.md` - intended fetch/checkpoint/outbox direction.
  - Task 1 output - canonical contract and field mapping.
  - Task 2 output - local outbox state model.

  **Acceptance Criteria**:
  - [ ] Selector returns only unsent/retryable records in deterministic order.
  - [ ] Serializer output conforms to contract from Task 1.
  - [ ] Re-running serialization for same batch yields stable payload shape.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Selector builds deterministic batch from unsent rows
    Tool: Bash
    Preconditions: Local DB seeded with 3 concrete unsent scanlog rows
    Steps:
      1. Run batch-selection command/script twice without changing DB state
      2. Capture payload output both times
      3. Assert same batch_id inputs produce same record order and same serialized fields
    Expected Result: Deterministic payload generation
    Failure Indicators: Different ordering/fields across runs
    Evidence: .sisyphus/evidence/task-6-deterministic-batch.txt

  Scenario: Sent rows excluded from new batch
    Tool: Bash
    Preconditions: Local DB seeded with 2 sent rows and 1 unsent row
    Steps:
      1. Run batch selection
      2. Assert payload contains only unsent row identifiers
    Expected Result: Already-sent rows omitted
    Failure Indicators: Sent rows included in payload
    Evidence: .sisyphus/evidence/task-6-exclude-sent.txt
  ```

  **Evidence to Capture:**
  - [ ] Payload output files for repeated runs

  **Commit**: NO

- [x] 7. Build Windows sender + ack handling

  **What to do**:
  - Implement Windows-side HTTP sender that posts serialized batches to Linux VM ingest and updates local batch state only after durable ack.
  - Handle success, auth failure, transport failure, timeout, and retryable server failure distinctly.
  - Persist ack metadata and error metadata for later operator inspection.

  **Must NOT do**:
  - Do not mark batch sent on timeout or connection drop.
  - Do not collapse auth failure and network failure into same result path.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: outbound reliability logic with multiple error classes.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `ocs-runtime-validation`: better for later validation than core build.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 14
  - **Blocked By**: 2, 4, 6

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\sync.php` - existing curl usage patterns on Windows PHP side.
  - Task 2 output - local state lifecycle.
  - Task 4 output - auth/config contract.
  - Task 6 output - serialized batch payloads.

  **Acceptance Criteria**:
  - [ ] Successful ack marks batch sent and stores ack metadata.
  - [ ] 401/403 auth failures do not mark batch sent and are distinguishable.
  - [ ] Timeout/5xx failures leave batch retryable with captured error state.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Successful POST updates batch to sent
    Tool: Bash
    Preconditions: Linux ingest test endpoint reachable; one unsent batch exists
    Steps:
      1. Run sender for `batch-001`
      2. Query local batch table
      3. Assert status is `sent`, ack timestamp recorded, and response metadata stored
    Expected Result: Durable ack transitions batch to sent
    Failure Indicators: Batch remains unsent after 2xx ack or no ack metadata
    Evidence: .sisyphus/evidence/task-7-send-success.txt

  Scenario: 500 response keeps batch retryable
    Tool: Bash
    Preconditions: Ingest endpoint stub returns HTTP 500
    Steps:
      1. Run sender for `batch-002`
      2. Query local batch table
      3. Assert status is `failed` or `retryable`, `last_error` captures 500
    Expected Result: Batch not marked sent on server error
    Failure Indicators: Batch marked sent or removed
    Evidence: .sisyphus/evidence/task-7-send-500.txt
  ```

  **Evidence to Capture:**
  - [ ] Sender output and DB query output

  **Commit**: NO

- [x] 8. Build Linux private ingest endpoint

  **What to do**:
  - Add private Linux VM API route that accepts Windows scanlog batch payloads, authenticates request, validates contract, persists ledger receipt, and returns machine-readable ack.
  - Ensure non-JSON and malformed requests get deterministic JSON error responses.
  - Separate request validation from canonical write internals.

  **Must NOT do**:
  - Do not reuse browser-session-only auth.
  - Do not return ambiguous plain-text errors.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: server endpoint with security, validation, and transaction boundaries.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: no UI overlap.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 9, 12, 14
  - **Blocked By**: 1, 3, 4

  **References**:
  - `E:\Project\easylink-frontend\app\api\machine\sync\route.js` - existing authenticated API/proxy style and JSON response conventions.
  - `E:\Project\easylink-frontend\app\api\scanlog\sync\route.js` - existing scanlog ingest-related response and batching patterns.
  - Task 1 output - contract details.
  - Task 3 output - durable ingest ledger model.
  - Task 4 output - private auth/config contract.

  **Acceptance Criteria**:
  - [ ] Valid authorized batch returns deterministic JSON ack.
  - [ ] Invalid/malformed batch returns deterministic JSON error.
  - [ ] Receipt is durably recorded before success ack is returned.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Authorized valid batch returns JSON ack
    Tool: Bash (curl)
    Preconditions: Next.js dev/server running with ingest endpoint enabled
    Steps:
      1. POST valid sample batch with concrete auth header to ingest route
      2. Assert HTTP status 200/202
      3. Assert response JSON contains `ok`, `batch_id`, and accepted count fields
    Expected Result: Deterministic JSON ack for valid input
    Failure Indicators: Non-JSON response, 500, or missing ack fields
    Evidence: .sisyphus/evidence/task-8-ingest-valid.json

  Scenario: Malformed payload rejected with JSON error
    Tool: Bash (curl)
    Preconditions: Ingest endpoint running
    Steps:
      1. POST malformed payload missing `records`
      2. Assert HTTP status 400/422
      3. Assert response JSON includes machine-readable validation error
    Expected Result: Clear JSON validation failure
    Failure Indicators: Plain text error or 500
    Evidence: .sisyphus/evidence/task-8-ingest-invalid.json
  ```

  **Evidence to Capture:**
  - [ ] Request/response bodies for success and validation failure

  **Commit**: NO

- [x] 9. Build Linux dedupe + canonical write service

  **What to do**:
  - Implement server-side logic that takes accepted batch records, applies idempotency/dedupe rules, and writes canonical scanlog records into Linux app-side storage.
  - Reuse or align with existing normalization/merge behavior where safe.
  - Ensure replayed records do not create duplicate canonical rows.

  **Must NOT do**:
  - Do not bypass dedupe on direct cutover.
  - Do not fork canonical scanlog semantics from existing app behavior without explicit reason.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: high-risk canonical write path with replay and data-integrity concerns.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `tdd`: user selected tests-after.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 12, 14
  - **Blocked By**: 1, 3, 8

  **References**:
  - `E:\Project\easylink-frontend\app\api\scanlog\sync\route.js` - current safe-event insertion and legacy merge behavior.
  - `E:\Project\easylink-frontend\lib\easylink-sdk-client.js` - upstream scanlog field semantics from existing SDK pull flow.
  - Task 1 output - dedupe key and contract rules.
  - Task 3 output - ingest ledger linkage.
  - Task 8 output - validated accepted payload shape.

  **Acceptance Criteria**:
  - [ ] First-time records insert into canonical storage successfully.
  - [ ] Replay of same record set does not duplicate canonical rows.
  - [ ] Canonical writes remain traceable to source batch/device.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: New accepted batch inserts canonical scanlogs
    Tool: Bash
    Preconditions: Ingest route and canonical write service running; canonical table empty for test device
    Steps:
      1. Submit valid batch with 2 concrete scanlog records
      2. Query canonical Linux scanlog table by device and timestamp
      3. Assert exactly 2 rows inserted with expected mapped fields
    Expected Result: Canonical rows created once
    Failure Indicators: Missing rows or wrong mapped fields
    Evidence: .sisyphus/evidence/task-9-canonical-insert.txt

  Scenario: Replay of same records does not duplicate canonical rows
    Tool: Bash
    Preconditions: Same batch already accepted once
    Steps:
      1. Submit same batch again
      2. Query canonical table count for same natural key set
      3. Assert row count unchanged
    Expected Result: Duplicate replay ignored or marked safely
    Failure Indicators: Count increases on replay
    Evidence: .sisyphus/evidence/task-9-canonical-replay.txt
  ```

  **Evidence to Capture:**
  - [ ] Canonical table query outputs

  **Commit**: NO

- [x] 10. Build failure logging + retry scheduling hooks

  **What to do**:
  - Implement retry scheduling/backoff hooks and structured logging for sender and ingest failures.
  - Support distinct handling for transport failures, auth failures, validation failures, and replay/no-op outcomes.
  - Ensure direct-cutover operators can inspect what will retry next.

  **Must NOT do**:
  - Do not retry permanently invalid payloads forever.
  - Do not hide next-retry timing or last error detail.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: reliability and operational control logic spanning two runtimes.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `ui-demo`: no demo/video need.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 13, 14
  - **Blocked By**: 2, 3, 5

  **References**:
  - Task 2 output - Windows batch states.
  - Task 3 output - Linux ledger states.
  - Task 5 output - observability/alarm requirements.
  - `E:\Project\easylink-frontend\ops\fservice-sync\sync.php` - current worker entry style for future retry wiring.

  **Acceptance Criteria**:
  - [ ] Retryable failures schedule next retry with visible timing.
  - [ ] Non-retryable validation/auth failures are clearly marked.
  - [ ] Structured logs distinguish failure classes.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Transport failure schedules retry with backoff
    Tool: Bash
    Preconditions: Sender configured to unreachable VM host; retry metadata storage available
    Steps:
      1. Run sender once for queued batch
      2. Query retry metadata or inspect status output
      3. Assert next_retry_at is set and last_error indicates transport failure
    Expected Result: Retry scheduled visibly
    Failure Indicators: No retry scheduling or missing error detail
    Evidence: .sisyphus/evidence/task-10-retry-schedule.txt

  Scenario: Validation failure marked non-retryable
    Tool: Bash
    Preconditions: Batch with malformed payload available
    Steps:
      1. Submit malformed batch through sender/test hook
      2. Inspect batch state/log output
      3. Assert batch marked invalid/non-retryable and not requeued indefinitely
    Expected Result: Permanently bad payload exits retry loop
    Failure Indicators: Same invalid batch remains endlessly retryable
    Evidence: .sisyphus/evidence/task-10-nonretryable.txt
  ```

  **Evidence to Capture:**
  - [ ] Retry metadata and structured log output

  **Commit**: NO

- [x] 11. Wire Windows worker execution path

  **What to do**:
  - Integrate batch selection, sender, and retry hooks into Windows execution entry path so regular sync can run without manual browser interaction.
  - Update launcher/runtime path as needed for scheduled or operator-invoked execution.
  - Preserve ability to inspect/debug failures locally.

  **Must NOT do**:
  - Do not require admin UI button clicks for routine HOP B sync.
  - Do not remove local debugging entrypoints.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: narrow wiring/integration task after core pieces exist.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: no buyer-facing UI work.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12, 13, 14)
  - **Blocks**: 12, F3
  - **Blocked By**: 2, 4, 7, 10

  **References**:
  - `E:\Project\easylink-frontend\ops\fservice-sync\run.bat` - current Windows startup/orchestration entrypoint.
  - `E:\Project\easylink-frontend\ops\fservice-sync\sync.php` - current CLI worker entrypoint and option style.
  - Task 7 output - sender behavior.
  - Task 10 output - retry/logging behavior.

  **Acceptance Criteria**:
  - [ ] Windows execution path can trigger queued scanlog send without browser UI.
  - [ ] Execution path exposes non-zero exit or clear failure output on send failure.
  - [ ] Existing local debug workflow remains usable.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Worker execution sends queued batch end-to-end
    Tool: Bash
    Preconditions: One queued batch exists locally; VM ingest reachable
    Steps:
      1. Run Windows worker command/entrypoint
      2. Assert command exits 0
      3. Query local batch state and Linux ledger state for same batch_id
    Expected Result: Batch sent and acknowledged through normal worker path
    Failure Indicators: Exit failure or inconsistent states across Windows/Linux
    Evidence: .sisyphus/evidence/task-11-worker-success.txt

  Scenario: Worker exit indicates failed send when VM unreachable
    Tool: Bash
    Preconditions: One queued batch exists; VM endpoint unreachable
    Steps:
      1. Run same worker command
      2. Assert output/log includes VM connectivity failure and batch remains queued/retryable
    Expected Result: Failure visible through normal entrypoint
    Failure Indicators: Silent success or batch loss
    Evidence: .sisyphus/evidence/task-11-worker-failure.txt
  ```

  **Evidence to Capture:**
  - [ ] Worker command output and DB state outputs

  **Commit**: NO

- [x] 12. Cut app path to canonical HOP B ingest flow

  **What to do**:
  - Adjust app-side scanlog flow so direct-cutover target path uses Linux canonical data fed by HOP B ingest instead of relying on VM pull from Windows SDK bridge for this scope.
  - Update any route/service/wiring needed so reporting reads canonical Linux-side records produced by HOP B.
  - Keep fallback boundaries explicit if old pull route remains temporarily for unrelated use.

  **Must NOT do**:
  - Do not leave ambiguous dual-source behavior for scanlogs in direct cutover.
  - Do not break unrelated machine-management routes unnecessarily.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: integration cutover across current and target data paths.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-patterns`: maybe useful if UI shifts, but main work is data-path integration.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 13, 14, F1-F4
  - **Blocked By**: 3, 4, 8, 9, 11

  **References**:
  - `E:\Project\easylink-frontend\app\api\scanlog\sync\route.js` - current pull-based scanlog flow to be isolated or superseded for this scope.
  - `E:\Project\easylink-frontend\lib\easylink-sdk-client.js` - current Windows bridge dependency that direct cutover should avoid for target path.
  - `E:\Project\easylink-frontend\docs\CONTEXT.md` - canonical app/data constraints and machine integration context.
  - Task 8 output - ingest route contract.
  - Task 9 output - canonical write service.
  - Task 11 output - Windows send path.

  **Acceptance Criteria**:
  - [ ] Target scanlog reporting path reads Linux canonical data produced by HOP B.
  - [ ] Direct cutover no longer requires VM-side pull from Windows bridge for scoped scanlog path.
  - [ ] Unrelated machine admin actions continue to function or are explicitly isolated.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: New scanlog appears in app through HOP B canonical path
    Tool: Bash + Playwright
    Preconditions: Windows sender and Linux ingest running; app reachable; one new test scanlog exists in Windows local DB
    Steps:
      1. Run Windows worker to send batch
      2. Query Linux canonical table to confirm insert
      3. Open target app reporting page or API and assert concrete scanlog timestamp/user/device appears
    Expected Result: App reflects HOP B-ingested canonical record
    Failure Indicators: Record exists in local Windows DB only or app still depends on bridge pull path
    Evidence: .sisyphus/evidence/task-12-app-cutover.txt

  Scenario: Disabled/removed bridge pull path does not break scoped reporting
    Tool: Bash
    Preconditions: HOP B data already ingested; bridge pull path stubbed/disabled for test
    Steps:
      1. Request scoped reporting API/page without invoking old pull flow
      2. Assert reporting still returns expected record from canonical DB
    Expected Result: Reporting works without old bridge pull dependency for this scope
    Failure Indicators: Empty result or runtime error due to old dependency
    Evidence: .sisyphus/evidence/task-12-no-bridge-dependency.txt
  ```

  **Evidence to Capture:**
  - [ ] Reporting/API outputs and optional screenshot

  **Commit**: YES
  - Message: `feat(fsync): cut over scanlog sync to hop-b`
  - Files: `ops/fservice-sync/*`, `app/api/**`, related lib/data files
  - Pre-commit: `npm run typecheck && npm run build && npm test`

- [x] 13. Add operational status surfaces/log export

  **What to do**:
  - Add minimal operator-facing way to inspect queue/last-sync/error status needed for direct cutover support.
  - This may be API response, admin status route, CLI output, or local status file/log export depending repo fit.
  - Ensure status reflects both Windows sender health and Linux ingest health relevant to HOP B.

  **Must NOT do**:
  - Do not build large new dashboard if simple status surface is enough.
  - Do not expose secrets in status output.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: mixed ops/product surface with cross-runtime status needs.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: maybe overkill unless status UI grows; keep minimal.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: F3, F4
  - **Blocked By**: 5, 10, 12

  **References**:
  - `E:\Project\easylink-frontend\app\machine\page.jsx` - current admin machine management surface if reuse is appropriate.
  - `E:\Project\easylink-frontend\lib\hooks\use-machine-sync.js` - current machine-sync status interaction style.
  - Task 5 output - observability/alarms requirements.
  - Task 10 output - retry/error structured data.

  **Acceptance Criteria**:
  - [ ] Operator can see latest send/ack/failure state without reading raw DB tables directly.
  - [ ] Status surface distinguishes backlog, auth failure, transport failure, and success state.
  - [ ] No secrets leak into output.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: Status surface shows healthy last sync state
    Tool: Bash or Playwright
    Preconditions: One successful batch already sent
    Steps:
      1. Open status route/page or run status command
      2. Assert output includes last successful batch_id/time and zero critical backlog
    Expected Result: Healthy sync state visible
    Failure Indicators: Missing success metadata or unreadable output
    Evidence: .sisyphus/evidence/task-13-status-healthy.txt

  Scenario: Status surface shows backlog/error state after failure
    Tool: Bash or Playwright
    Preconditions: One retryable failed batch exists
    Steps:
      1. Open same status surface
      2. Assert output shows queued/retry count and latest error class
    Expected Result: Failure state visible and actionable
    Failure Indicators: Success-only output despite queued failure
    Evidence: .sisyphus/evidence/task-13-status-failed.txt
  ```

  **Evidence to Capture:**
  - [ ] Status outputs/screenshots

  **Commit**: NO

- [x] 14. Add tests-after coverage for sender/ingest/replay

  **What to do**:
  - Add automated tests after implementation for core HOP B behavior: contract validation, sender ack handling, ingest auth, replay safety, canonical write, and cutover behavior.
  - Prefer narrow targeted tests around public interfaces and integration seams.
  - Include at least one failure-path test per core module.

  **Must NOT do**:
  - Do not leave replay safety untested.
  - Do not depend only on happy-path tests.

  **Recommended Agent Profile**:
  - **Category**: `testing`
    - Reason: explicit tests-after task spanning multiple modules.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `tdd`: not selected; this is post-implementation coverage.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: F2, F3
  - **Blocked By**: 1, 6, 7, 8, 9, 10, 12

  **References**:
  - Existing project test setup in `package.json` and current test directories/files - determine native runner and patterns.
  - `E:\Project\easylink-frontend\app\api\scanlog\sync\route.js` tests or adjacent API tests if present - reuse conventions.
  - Outputs from Tasks 1, 7, 8, 9, 10, 12 - define public seams that require test coverage.

  **Acceptance Criteria**:
  - [ ] Automated tests cover success ack, auth rejection, replay no-duplication, transport failure retryability, and canonical write path.
  - [ ] Targeted HOP B test subset passes locally.
  - [ ] Full selected repo verification commands pass.

  **QA Scenarios (MANDATORY)**:

  ```text
  Scenario: HOP B targeted automated tests pass
    Tool: Bash
    Preconditions: HOP B tests added
    Steps:
      1. Run targeted HOP B test command
      2. Assert exit code 0 and all named tests pass
    Expected Result: Targeted HOP B tests green
    Failure Indicators: Failing tests or skipped critical replay/auth tests
    Evidence: .sisyphus/evidence/task-14-targeted-tests.txt

  Scenario: Failure-path automated test proves retry/no-dup behavior
    Tool: Bash
    Preconditions: Replay/auth/retry tests added
    Steps:
      1. Run targeted subset for replay and retry behavior
      2. Assert output includes passing cases for duplicate batch replay and failed-send retry path
    Expected Result: Critical failure-path coverage present and passing
    Failure Indicators: Missing replay/retry tests or failures
    Evidence: .sisyphus/evidence/task-14-failure-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] Test command outputs

  **Commit**: YES
  - Message: `test(fsync): cover hop-b sender and ingest`
  - Files: test files only
  - Pre-commit: `npm test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + lint/build/test commands used by repo. Review all changed files for: broad ignore patterns, empty catches, console noise in prod, commented-out dead code, unused imports, generic placeholder names. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration and edge cases including VM outage and replay. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check direct-cutover compliance and no user-sync creep. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(fsync): define hop-b contract and schemas` - contract/schema files and docs - pre-commit: targeted tests for schema/contract if present
- **2**: `feat(fsync): add windows sender and vm ingest` - sender/endpoint/core ingest files - pre-commit: targeted sender + ingest tests
- **3**: `feat(fsync): cut over scanlog sync to hop-b` - worker wiring, route integration, status surfaces - pre-commit: integration tests + build/typecheck
- **4**: `test(fsync): add replay and failure coverage` - test files only - pre-commit: full targeted test suite

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: success
npm run build       # Expected: success
npm test            # Expected: HOP B related tests pass
curl -X POST http://<vm-host>:3000/api/...   # Expected: durable ack JSON for valid batch
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Windows local DB retains unsent records until Linux durable ack
- [ ] Replay of same batch does not duplicate canonical scanlogs
