# Q4 — HOP B canonical push (Stage B) is never triggered by the UI

**Severity**: 🟡 Sync (data stops at Windows staging)
**Status**: OPEN

---

## The finding

The Windows→VM scanlog sync is two decoupled stages:

**Stage A — device → Windows staging** (what the UI does):
- `components/machine/machine-sync-panel.jsx` "Sync Scanlogs" button → `useMachineSync.syncScanlogs()` → `callSync('sync_scanlogs')` → `POST /api/machine/sync?action=sync_scanlogs`.
- That route forwards to the **PHP bridge** (`EASYLINK_PHP_BRIDGE_URL`, default `localhost:9090`), which pulls device→FService→**local `easylink_bridge` staging DB**.
- This path has **no knowledge of the VM**. It never calls `/api/scanlog/ingest`.

**Stage B — Windows staging → VM canonical** (the actual HOP B push):
- `ops/fservice-sync/hop-b-batch-selector.php` is a **separate CLI worker**. It reads pending batches from `easylink_bridge` and POSTs them to `HOP_B_INGEST_URL` (the VM `/api/scanlog/ingest`) with a bearer token.
- **Nothing in the UI invokes this.** It is meant to run via Windows Task Scheduler or manual CLI.

This confirms hypothesis #1 in `docs/obsidian/hop-b-sync-status.md`: the UI "Sync" reports success because Stage A succeeds locally, but the VM shows **zero ingest rows** because Stage B was never run.

## Challenge against docs

- `CONTEXT.md` Machine/scanlog section + `ops/fservice-sync/FULL-SETUP-STEPS.md` describe the intended two-node design correctly. The docs are **right**; the *wiring* is incomplete. So this is an implementation/ops gap, not a doc contradiction.
- `docs/hop-b-auth-contract.md` defines the Stage B transport (bearer token, env vars) — also correct and built.

## My recommendation

**Decide the trigger model for Stage B, then document it as the operational contract.**

Option A (recommended) — *scheduled worker on Windows*:
- Run `hop-b-batch-selector.php` on a Windows Task Scheduler interval (e.g. every N minutes) independent of the UI.
- Keeps UI sync fast (local), decouples transport, gives retry/backoff via the existing outbox state machine.
- Document the schedule + env in an ops runbook (extend `hop-b-observability-runbook.md`).

Option B — *UI chains Stage B after Stage A*:
- After `sync_scanlogs` succeeds, the UI (or the `/api/machine/sync` route) also kicks the HOP B push.
- More immediate, but couples UI latency to VM availability and duplicates the scheduler's job.

Reasoning: Option A matches the outbox/retry design already built into `hop-b-batch-selector.php` (it has `pending/sending/sent/failed/dead_letter`, exponential backoff constants). The worker is *designed* to run on a timer; the missing piece is operational, not architectural. Option B is only better if operators expect "click sync → VM updated instantly" with no scheduler.

**Verification step regardless of choice**: after wiring, inspect `tb_hop_b_ingest_log` on the VM and `/api/scanlog/hop-b-status` after a sync to confirm rows land.

**Note**: this is ops/wiring, separable from the Q1-Q3 credential thread. Can be decided independently.

---

## Agent-Proposed Assessment (PROPOSED — pending human ratification)

**Status**: PROPOSED. Evidence confirmed by direct code read (2026-06-07).
**Independent** of the Q1-Q3 credential thread.

**Evidence — Stage B has NO automated trigger**:
- `ops/fservice-sync/hop-b-batch-selector.php` is **CLI-only**: `hop_b_main()` (line 1282) reads `$GLOBALS['argv']`, supports `--worker-run` (line 1292) / batch-prepare modes. Invoked only by `php hop-b-batch-selector.php`.
- `ops/fservice-sync/run.bat` starts **only** FService.exe + the PHP control panel web server on `:9090` (lines 47, 61). It does **not** invoke the batch selector. So the operator "Control Panel" launch path never runs Stage B.
- Only other references to `hop_b_run_worker_cycle` / `hop-b-batch-selector.php` are **test files** (`tests/hop-b-worker-cycle-test.php`, `tests/hop-b-batch-selector-test.php`). No cron, no Task Scheduler XML, no `.bat`/`.ps1` wrapper.
- `app/api/machine/sync/route.js` (`sync_scanlogs`) forwards to the PHP bridge for Stage A only — no call toward `/api/scanlog/ingest`.

**Conclusion**: Stage A (UI) and Stage B (CLI) are fully decoupled, and **nothing triggers Stage B**. This is the proven root cause of the "VM shows zero ingest rows" symptom.

**Proposed decision**: **Option A — scheduled worker on Windows.** Run `php hop-b-batch-selector.php --worker-run` on a Windows Task Scheduler interval, independent of the UI.

**Reasoning**:
- The selector already implements an outbox state machine (`pending/sending/sent/failed/dead_letter`) with exponential backoff constants — it is *designed* to run repeatedly on a timer. The missing piece is purely operational.
- Keeps UI sync fast/local; decouples UI latency from VM availability.
- Option B (UI chains Stage B after Stage A) only wins if operators expect "click sync → VM instantly updated"; it duplicates the scheduler's job and couples UI to VM uptime.

**🟡 DEFERRED — light ops judgment**:
> What interval, and who owns the Windows box's Task Scheduler? PROPOSED assumes a periodic worker (e.g. every 2-5 min). Confirm cadence + ownership.

**Verification after wiring** (either option): inspect `tb_hop_b_ingest_log` on the VM and `GET /api/scanlog/hop-b-status` after a sync to confirm rows land.

**Proposed doc action**: Extend `docs/hop-b-observability-runbook.md` with the trigger contract (schedule, env vars `HOP_B_INGEST_URL`/`HOP_B_AUTH_TOKEN`/`HOP_B_DB_*`, the `--worker-run` command). Not written yet.

---

## Human Final Verdict

> Decision (A / B / other):
>
> Reasoning:
>
> Doc action (runbook update / ADR / none):
