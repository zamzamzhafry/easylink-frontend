# Session Handoff - 2026-05-29 - HOP B Scanlog Sync Execution

This note captures the exact state for next fresh agent to execute missing HOP B work without repeating research.

## User request to preserve verbatim

- "lets assume HOP B is not persistent or created yet. how to u made and adjust. and then i will update the version of windows and linux simultaneously."
- User later chose: **scanlog only**, **direct cutover**, **tests after**.
- User then asked: **make a handover first for next session fresh agent to do the work**.

## Locked scope and decisions

- Scope is **scanlogs only** for first rollout.
- Rollout mode is **direct cutover**.
- Test strategy is **tests after**.
- Windows must **not** write directly to remote Linux MySQL.
- HOP B transport should be **private HTTP ingest API** from Windows to Linux VM.
- Delivery model should be **at-least-once** with **idempotent replay safety**.
- Windows marks records/batches **sent only after durable Linux commit/ack**.
- Linux VM becomes **canonical writer/source** for app-side attendance reporting.
- User sync is **out of scope** for this execution slice.

## Architecture understanding

Current intended flow:

`Device/FService -> Windows local staging DB -> Linux VM ingest API -> canonical Linux DB/UI`

Interpretation used for planning:

- **HOP A** = device/FService into Windows local DB. Exists already, though not fully healthy operationally.
- **HOP B** = Windows local DB outbound sync into Linux VM app. Missing in repo code.
- **HOP C** = Linux canonical DB powering app/reporting.

## What I verified in repo

### Existing Windows-side files

- `ops/fservice-sync/sync.php`
  - Pulls from FService endpoints.
  - Writes into local MySQL only.
  - No Linux VM push path implemented.

- `ops/fservice-sync/web/index.php`
  - Multi-machine bridge/control panel.
  - Talks to per-machine FService bridge and writes local DB.
  - No Linux VM push path implemented.

- `ops/fservice-sync/run.bat`
  - Starts/coordinates Windows-side FService + PHP tooling.

- `ops/fservice-sync/FULL-SETUP-STEPS.md`
  - Only repo artifact explicitly describing intended HOP B direction.
  - Describes Windows staging DB -> Linux VM ingest API as preferred path.

### Existing Linux/app-side files

- `app/api/scanlog/sync/route.js`
  - Current VM-side pull/ingest flow from SDK/bridge.
  - Useful as reference for normalization/safe-batch semantics.
  - Not the missing HOP B push-ingest path.

- `app/api/machine/sync/route.js`
  - Existing admin-only proxy pattern to PHP bridge.
  - Useful as reference for route structure and JSON response style.

- `lib/easylink-sdk-client.js`
  - Existing SDK bridge integration.
  - Useful only as field semantics/reference; target cutover should reduce dependency on this pull path for scanlogs.

## What is missing

Repo evidence showed these HOP B pieces do **not** exist yet:

- Windows outbox/queue sender for scanlogs from local DB
- Linux private ingest endpoint for Windows-posted scanlog batches
- Auth contract for private ingest
- Durable ingest ledger for replay/idempotency
- Windows durable outbound batch state and retry metadata
- Retry/ack flow across Windows and Linux
- Direct-cutover observability/status surface for HOP B
- Automated tests covering sender/ingest/replay/failure path

## Important operational findings already discovered

These are adjacent issues. Do not confuse them with HOP B itself, but they matter during execution/testing:

1. **Windows local DB schema drift**
   - `tb_device_config` on Windows was missing metadata columns expected by current PHP sync UI, including `last_sync_at`, `last_sync_users`, `last_sync_scanlogs`.
   - This caused DB-sync errors in existing `index.php` flow.

2. **FService bridge instability / non-JSON behavior**
   - Calls like `http://localhost:8090/dev/info` and `http://localhost:8090/scanlog/new` returned `Unspecified error` / non-JSON behavior.
   - This is HOP A/runtime health issue, not proof that HOP B exists.

Fresh agent should treat both as known execution risks when building QA path, but should not derail into broad HOP A rewrite unless required for HOP B handoff safety.

## Oracle guidance already obtained

Oracle recommendation was:

- safest HOP B = Windows staging DB as source for outbound sync
- Linux VM exposes private HTTP ingest API
- Linux app owns canonical writes
- no direct Windows -> remote MySQL writes
- use envelope fields such as `device_sn`, `sent_at`, `batch_id`, `schema_version`, `records[]`
- use Linux durable ingest ledger
- dedupe by device/event identity or deterministic natural key fallback
- use at-least-once delivery and idempotent replay
- prefer token/HMAC + LAN/VPN boundary for security

## Metis review outcomes already folded into plan

I already used Metis to challenge missing assumptions. These defaults were locked into the plan:

- Sent-state updates only after durable Linux ack.
- During outage, Windows keeps buffering locally and retries with backoff.
- Operators need visible alarms/status for backlog/auth failure/transport failure.
- Scope creep must be blocked: no user sync, no machine-sync redesign, no unnecessary HOP A rewrite.

## Validated execution plan

Canonical execution plan already created and validated:

- `.sisyphus/plans/hop-b-sync-plan.md`

This plan was reviewed by Momus and received verdict:

- **OKAY**

Momus note:

- execution-time test commands may need adjustment because repo may not have plain `npm test` as native current command
- this was **not** considered a blocker

## What the plan contains

The plan already includes:

- Wave-based task decomposition
- Dependency order
- Acceptance criteria per task
- QA scenarios per task
- Evidence file paths under `.sisyphus/evidence/`
- Final 4-review verification wave

Critical path in plan:

`Task 1 -> Task 4 -> Task 8 -> Task 12 -> F1-F4`

High-level task groups:

1. Define batch contract, Windows outbox schema, Linux ingest ledger, auth/config, observability
2. Build Windows selector/sender and Linux ingest/canonical-write core
3. Wire worker path, cut app path over, add status surface, add tests-after coverage
4. Run final verification wave

## Repo constraints to preserve

From repo guidance/context already used:

- Read `docs/README.md`, `docs/agent-restrictions.md`, `docs/agent-context/current-project-context.md`, `docs/CONTEXT.md` first in fresh session.
- EasyLink is private-network app.
- Do not skip auth checks.
- Do not hardcode env-sensitive endpoints or secrets.
- If code changes are made, run verification expected by repo guidance such as `npm run typecheck` and `npm run build` where applicable.
- Keep docs updated if auth/schema/SDK flow changes materially.

## Git/worktree state warning

Repo is **not clean**.

At handoff time, `git diff --stat HEAD~10..HEAD` and `git status` showed many modified files unrelated to HOP B, including large `.graphify/*` changes and many app/API files. Fresh agent must avoid contaminating HOP B work with unrelated diffs.

Implication:

- stage surgically
- inspect diffs carefully
- do not assume current dirty tree belongs to this task

## Recommended next-session procedure

1. Read:
   - `docs/CONTEXT.md`
   - `docs/agent-restrictions.md`
   - `docs/agent-context/current-project-context.md`
   - `.sisyphus/plans/hop-b-sync-plan.md`

2. Treat plan as source of truth. Do **not** re-open architecture debate unless hard blocker found.

3. Start execution from earliest wave in plan.

4. Keep HOP B scope narrow:
   - scanlogs only
   - direct cutover
   - tests after

5. If operational testing hits Windows schema drift or FService non-JSON issue, fix only minimum needed for HOP B testability, not broad refactor.

6. Before finalizing implementation, verify:
   - Linux ingest is durable and idempotent
   - Windows sender does not mark sent before ack
   - app reporting uses canonical Linux-side data for scoped scanlog path
   - tests/evidence match plan

## If fresh agent needs one-sentence objective

Implement missing HOP B so Windows local DB can push **scanlog-only** batches to Linux VM over private authenticated HTTP, with durable idempotent ingest and **direct cutover** to Linux canonical reporting.
