# Ops Control Panel + run.bat QoL Plan

**Status:** PLAN ONLY — no code yet.
**Drafted:** 2026-06-17
**Scope:** `ops/fservice-sync/web/index.php` (Windows operator Control Panel, port 9090) + `ops/fservice-sync/run.bat` (boot script).
**Out of scope:** `ops/landing-page/index.php` (Apache VM hub on port 80 — different surface, not this plan).

---

## Why

Operator surface works but is flat and noisy:

- `web/index.php` renders 9 cards in a flat grid with no hierarchy. Danger Zone sits next to Refresh Stats with equal visual weight. No nav. Cards named by capability (Database Sync, Machine Users) not by step in the actual flow.
- Real app flow is **Device → Bridge (Windows staged) → VM Database**. UI doesn't tell that story.
- Machine selector buried in a top strip. Switching machines is the #1 frequent action.
- `run.bat` has off-by-one step labels (7 steps numbered `[0/6]..[6/6]`), no subcommands, hardcoded config values, brittle FService boot (fire-and-forget + sleep), inline JSON noise on bridge probe, no log capture.

---

## A. `web/index.php` — Control Panel redesign

### A.1 Target IA — 3-stage narrative + nav drawer

Reframe as **"what's the machine doing right now?"** not "list of buttons."

```
┌─────────────────────────────────────────────────────────┐
│  EasyLink Operator         [Machine: Fio66... ▾]  ● UP │  ← sticky top bar
├──────┬──────────────────────────────────────────────────┤
│ Nav  │  Stage 1 · DEVICE        Stage 2 · BRIDGE       │
│      │  ┌──────────┐            ┌──────────┐            │
│ ▸ Ops│  │ Users    │ ─────────▶ │ Staged   │            │
│ ▸ Cfg│  │ Scans    │   pull     │ Pending  │            │
│ ▸ Log│  │ FP       │            │          │            │
│ ▸ ⚠  │  └──────────┘            └──────────┘            │
│      │  [Refresh] [Sync Time]    [Pull Users][Pull Scans]│
│      │                                                  │
│      │  Stage 3 · VM DATABASE                           │
│      │  ┌──────────┐                                    │
│      │  │ DB rows  │ ◀───── push                        │
│      │  └──────────┘                                    │
│      │  [Push to VM] [Refresh DB stats]                 │
│      │                                                  │
│      │  Live sync log (last 100, auto-tail) ────────────│
└──────┴──────────────────────────────────────────────────┘
```

### A.2 Navigation menu (4 items, left rail)

1. **Ops** — default. The 3-stage flow. 90% of operator time.
2. **Configuration** — Machine list, add/edit/delete machines, bridge config, test connection. (Was "Machine Config" card.)
3. **Logs** — Sync logs tail, full panel (not collapsible card). Filter by level (info/warn/err), search, tail count selector.
4. **⚠ Danger Zone** — moved out of main flow entirely. Red badge in nav. Separate route. Init device, delete admin, delete all users, delete scanlogs, delete device log. Same typed-confirm gate as today.

### A.3 The 3-stage narrative (Ops tab body)

Three labeled stages, **arrows between them**, so operator sees direction of data:

| Stage | Card title | What it shows | Primary actions |
|---|---|---|---|
| 1 | **Device** (the physical machine) | Users count, FP count, total scans, new scans, device time, last-poll-at | Refresh, Sync Time |
| 2 | **Bridge** (staged on Windows) | Pulled users batch, staged scanlogs pending count, last-pull-at | Pull Users, Pull Scans (new), Pull Scans (all — warning style) |
| 3 | **VM Database** (final destination) | DB user count, DB scanlog count, latest scan timestamp, batches sent/failed | Refresh DB Stats, Push to VM |

Arrows visually connect stages. Use `→` glyph or simple SVG line. Each arrow is a passive label naming the verb: "pull", "push".

### A.4 Health summary in top bar

Compact health pill: `● Bridge UP · Device OK · VM reachable` or `● Bridge DOWN`. Single-glance status. Click → opens diagnostics drawer (bridge ping, device ping, VM handshake).

### A.5 Machine selector promotion

- Dropdown stays in top bar, bigger, with SN + label + status dot inline.
- Switching machine triggers ALL stages to refresh (currently each card must be refreshed individually).
- Remember last-selected machine via `localStorage`.

### A.6 What moves where

| Today | Tomorrow |
|---|---|
| Card: Device Info | Stage 1 (Ops tab) |
| Card: Database Sync | Split: stats → Stage 3; "Sync Users/Scanlogs" buttons → Stage 2 (rename: Pull from Device) |
| Card: Push to VM | Stage 3 action |
| Card: Machine Users `[Get All Users]` | Merged into Stage 2 |
| Card: Scan Logs `[Get New/All]` | Merged into Stage 2 |
| Card: Machine Config | **Configuration tab** |
| Card: Sync Logs | **Logs tab** (now full-page, always-on tail) |
| Card: Danger Zone | **Danger Zone tab** (nav has red badge) |

### A.7 Other QoL wins

- **Auto-refresh toggle** per stage (off by default, 10s tick when on).
- **Last-action timestamp** under each button: "Last pushed 2m ago · 47 rows".
- **Confirm-on-destructive** stays. Reuse existing typed-confirm modal.
- **Sticky job indicator** during long-running jobs (`sync_scanlogs`, `hop_b_push`). Thin progress strip at top: `Pushing batch 3/5 · 1,200 rows · 4s elapsed`.
- **Empty-state copy** when machine not selected: "Pick a machine above to begin" — not blank cards.
- **Use CSS vars (`:root` tokens)** instead of raw hex. Matches app-side discipline.
- **No purple**, semantic colors only.

### A.8 Out of scope

- Backend PHP actions (`dev_info`, `sync_users`, etc.) stay as-is. Presentation refactor only.
- Toast system, job poller, confirm modal — keep, re-skin only.
- Inline-everything single-file architecture — keep (no build step, easy ops deploy).

---

## B. `run.bat` — cleanup plan

### B.1 Pain inventory

- Off-by-one labels: 7 steps numbered `[0/6]..[6/6]`.
- No flags: `--help`, `--status`, `--dry-run`, `--no-browser`, `--stop`, `--restart`, `--tail`.
- Hardcoded `FSERVICE_SN`, `VM_HOST`, `PHP_EXE`, `VM_PORT` — operator edits `.bat` directly.
- No external config (`.env` / `run.config.bat`).
- Bridge test echoes raw JSON inline (visual noise).
- Handshake warning fires unconditionally (text dumps even when token IS set; logic order bug).
- No errorlevel gating after FService start (assumes `start` worked).
- No retry on transient failures (FService cold start can take 3-8s).
- Trailing `pause` blocks shutdown — operator must keep window open.
- Cleanup gap: trailer kills PHP window only; FService.exe stays running.
- No timestamps in console output.
- No log capture (stdout vanishes when window closes).

### B.2 Target shape — subcommands

```
run.bat              → boot everything (cleaner output)
run.bat status       → ports, processes, last handshake, no side effects
run.bat stop         → kill FService + PHP cleanly
run.bat restart      → stop + boot
run.bat tail         → tail today's run log
run.bat help         → list commands + show effective config
```

### B.3 Config externalization

- `run.config.bat` (gitignored, sample committed as `run.config.bat.sample`) holds `FSERVICE_SN`, `VM_HOST`, `VM_PORT`, `PHP_EXE`, `HOP_B_AUTH_TOKEN`.
- `run.bat` does `if exist run.config.bat call run.config.bat` at top, applies defaults for anything unset.
- `--help` prints the effective resolved config so operator can verify.

### B.4 Phase fixes

| Phase | Today | Tomorrow |
|---|---|---|
| `[0]` find PHP | 3 fallback paths, no error context | Same fallbacks + print which one matched: `PHP found: C:\laragon\...` |
| `[1]` kill stale | Best-effort taskkill | Same + summary: `Killed: FService (pid 1234), PHP (pid 5678), none on :9090` |
| `[2]` start FService | Fire-and-forget + `timeout /t 3` | Start + poll `localhost:8090/dev/info` every 500ms up to 8s; bail with clear msg if not responding |
| `[3]` bridge test | Inline `php -r` dumps raw JSON | Wrap in helper: `php tools\bridge-probe.php` that prints `OK · 247 users · device time 2026-06-17 14:32` or `FAIL · code=NetworkError` |
| `[4]` handshake | Warning prints before token check | Reorder: check token first, skip handshake with clear "skipped: no token" if missing; only warn when actually missing |
| `[5]` start PHP | Window title only | Same + capture pid + write to `.run.pids` so `stop` subcommand can kill cleanly |
| `[6]` open browser | Unconditional | Honor `--no-browser` flag; print URL regardless |
| `[end]` | `pause` blocks | Default: don't pause, print "Press Ctrl+C in this window to keep monitoring, or close it (services keep running)". Add `--keep-open` to restore old behavior |

Also: renumber labels to `[1/7]..[7/7]` or drop counts entirely and use named phases (`[boot]`, `[bridge]`, `[handshake]`, `[serve]`).

### B.5 Logging

- Tee all output to `ops\fservice-sync\logs\run-YYYYMMDD-HHMMSS.log`.
- Each line prefixed with `[HH:MM:SS]`.
- `run.bat tail` opens latest log in tail loop (PowerShell `Get-Content -Wait`).

### B.6 `status` subcommand output (target)

```
EasyLink fservice-sync status
─────────────────────────────
FService.exe       : RUNNING (pid 1234)
PHP :9090 server   : RUNNING (pid 5678)
Bridge :8090       : OK (247 users, device time synced)
VM handshake       : OK (last: 2m ago)
VM target          : 192.168.1.129:3000
Active machine SN  : Fio66208021230737
Last log file      : logs\run-20260617-1432.log (320 lines)
```

### B.7 Out of scope

- Replacing `.bat` with PowerShell — keep batch (matches ops convention, `handshake-test.ps1` already does the PS work).
- Service-ifying FService/PHP via NSSM — separate decision, see `docs/release/server-machine-task-scheduler-setup.md`.
- Touching `handshake-test.ps1` internals.

---

## C. Sequencing (if/when implementing)

Each step shippable on its own:

1. **B.1 quick wins** (15-30 min): fix label off-by-one, reorder handshake token check, add `--help`. Pure text changes, zero risk.
2. **A.2 nav skeleton** (1-2h): add left rail + 4 tabs, move existing cards into Ops tab unchanged. Pure layout.
3. **A.3 stage relabel** (1h): rename cards into Stage 1/2/3, add arrows. Visual only.
4. **A.6 split + move** (2-3h): redistribute buttons across stages, move danger to its own tab, move config/logs to their own tabs.
5. **B.2 config externalization + subcommands** (2-3h): `.config.bat.sample`, `stop`/`status`/`tail` subcommands.
6. **A.4 health pill + A.5 machine-switch refresh** (1-2h): cross-stage state.
7. **A.7 polish** (sticky job strip, last-action timestamps, auto-refresh toggle).

Steps 1-4 give 80% of perceived QoL improvement.

---

## D. Open questions

1. Operator headcount: 1 person at one site, or multi-site rollout? (Affects whether `.config.bat.sample` discipline matters or if hardcoded is fine.)
2. Single-machine deployments only, or do operators switch between 2+ machines in a session? (Justifies machine-switch refresh effort.)
3. Is the "open browser at end" wanted always, or annoying on restart? (Default `--no-browser` or default-on?)
4. Confirm: skin/structure only? Backend PHP actions untouched? (Stated as scope; restating for explicit sign-off when implementation starts.)

---

## E. Files touched (when implementation begins)

**New:**
- `ops/fservice-sync/run.config.bat.sample`
- `ops/fservice-sync/tools/bridge-probe.php` (replaces inline `php -r` bridge test)
- `ops/fservice-sync/logs/.gitkeep` (log dir)

**Edited:**
- `ops/fservice-sync/web/index.php` (single-file refactor; if too large, may split into `web/partials/*.php` later — TBD when implementing)
- `ops/fservice-sync/run.bat` (subcommand dispatcher at top, existing logic becomes default branch)
- `.gitignore` (add `ops/fservice-sync/run.config.bat`, `ops/fservice-sync/logs/*.log`, `ops/fservice-sync/.run.pids`)

**Untouched:**
- `ops/fservice-sync/handshake-test.ps1`
- `ops/fservice-sync/worker.php`, `sync.php`, `hop-b-batch-selector.php`, `lib-log.php`
- Backend PHP action handlers in `web/index.php` (lines 1-463)
- All migrations
- `ops/landing-page/*` (different surface)
