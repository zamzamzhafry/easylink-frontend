# Session Handoff — Ops Control Panel + run.bat QoL Mapping

**Date:** 2026-06-17
**Surface:** Windows side, `ops/fservice-sync/`
**Status:** **PLAN ONLY** — no code written this session. User asked for QoL/usability mapping, no implementation.

---

## What this session produced

A QoL/usability plan for two Windows-side operator surfaces:

1. **`ops/fservice-sync/web/index.php`** (Control Panel, port 9090, 1026 lines)
2. **`ops/fservice-sync/run.bat`** (boot script, 159 lines)

Full plan: **[`.omo/plans/ops-control-panel-qol.md`](../../.omo/plans/ops-control-panel-qol.md)**

The plan covers:
- 3-stage IA redesign for `index.php` (Device → Bridge → VM Database) with left-rail nav and Danger Zone moved to its own tab
- `run.bat` subcommand model (`status` / `stop` / `restart` / `tail` / `help`), config externalization, log capture, FService-boot liveness polling

---

## What user explicitly asked for

- "Index more straightforward + has a navigation menu"
- "Hide danger area actions into a separate nav menu"
- Reflect actual app flow: **device info → fetching machine → sync to app VM database**
- Clean `run.bat` (find references / approach, but **DO NOT code**)
- User confirmed: "kept as plan first" + "both" (park as both plan file and handoff doc)

---

## Two `index.php` files in the repo — disambiguation

| Path | Port | Surface | In scope of this plan? |
|---|---|---|---|
| `ops/landing-page/index.php` | 80 (Apache on VM) | Multi-app catalog page (renders `apps.json`) | **No** — different surface |
| `ops/fservice-sync/web/index.php` | 9090 (PHP built-in on Windows) | Operator Control Panel for FService bridge + Hop B push | **Yes** — this is the target |

User's "index.php" = the Windows Control Panel one. The Linux Apache landing page is not in this plan.

---

## Key source files (already read this session)

- `ops/fservice-sync/web/index.php` — full read. Backend PHP actions lines 1-463, HTML/CSS/JS lines 469-1026.
- `ops/fservice-sync/run.bat` — full read.
- `docs/CONTEXT.md`, `docs/agent-context/current-project-context.md`, `docs/agent-context/session-handoff-2026-06-01-auth-model-and-login-fix.md` — context spine + auth handoff.
- `docs/release/vm-apache-landing-page.md` — confirmed Apache landing is a separate surface.

Not yet read (only needed if implementation starts):
- `ops/fservice-sync/handshake-test.ps1`
- `ops/fservice-sync/FULL-SETUP-STEPS.md`
- `ops/fservice-sync/worker.php`, `sync.php`, `hop-b-batch-selector.php`, `lib-log.php`
- `docs/release/server-machine-task-scheduler-setup.md`, `prod-deploy-windows.md`

---

## Boulder / session state (recovered earlier this session)

- `.omo/boulder.json` → status `completed`, active_plan `auth-nip-reanchor-migration` (DONE)
- One harmless ghost `final-wave:f1` oracle task in boulder showing `running` for an interrupted session — not blocking, can be ignored
- Git working tree clean, latest commit `4c6fee1 fix(scanlog): bridge HOP B canonical to legacy tb_scanlog`
- Older pending todo from session `ses_136f7cbbbffeqGxKr5u3CjTPoN`: `lib/hop-b-ingest-writer.js:43 — change trailing NULL to ? and bind ingestLogId as 12th param`. **User said Hop B works fine, so this todo is likely already resolved or stale.** Verify before acting.

---

## Open plans not yet moved to `completed/` (audit candidates)

Per earlier mapping; still listed in `.omo/plans/`:
- `auth-fix.md`
- `implement-auth-scope-service-slicing.md`
- `fix-code-review-findings.md`
- `hop-b-sync-plan.md`
- `ui-hardening-phases-1-4.md`
- `machine-connect-tabs-auth-overlay-layout.md`
- `machine-connect-tabs-performance.md`
- `queue-rightbar-foundation-plan.md`
- `schedule-revision-ticketing-implementation-plan.md`
- `demo-easylink-post-uat-safe-cleanup.md`
- `easylink-architecture-clean-slate.md`
- `session-handoff-finalps1-and-remaining-todos.md`
- `handsoff.md`
- + new: `ops-control-panel-qol.md` (this plan)

Not audited yet whether each is live vs stale. Separate task if user wants.

---

## Repo-specific rules to honor when this plan is implemented

From `AGENTS.md` + CONTEXT.md:

- Network scope: LAN + approved VPN only. Operator Control Panel is on operator workstation, no public exposure.
- Use semantic theme tokens (CSS vars) — no raw hex, no purple.
- Run `npm run typecheck` + `npm run build` before wrapping (Next.js app side; not applicable to PHP/bat changes but applicable if any TypeScript moves).
- No `as any`, no `@ts-ignore`.
- Don't auto-commit. Wait for explicit go.
- If touching `ops/landing-page/`, source of truth lives there (not relevant to this plan; flagged for safety).
- Local skill `UI UX PRO MAX` at `.codex/skills/ui-ux-pro-max/SKILL.md` — load it if implementing visual work.

---

## Recommended next-session entry points

Pick one based on what user wants next:

1. **Implement plan step 1** (B.1 quick wins, 15-30 min) — `run.bat` label fix, handshake reorder, `--help`. Zero risk, immediate operator win.
2. **Implement plan step 2** (A.2 nav skeleton, 1-2h) — left rail + 4 tabs, cards stay put. Pure layout.
3. **Audit stale plans** — go through the open-plans list above, move done ones to `.omo/plans/completed/`.
4. **Answer the 4 open questions** in plan section D, then implement steps 1-4 in order (the "80% wins" path).

---

## Files this session created

- `.omo/plans/ops-control-panel-qol.md` (the plan)
- `docs/agent-context/session-handoff-2026-06-17-ops-control-panel-qol.md` (this doc)
