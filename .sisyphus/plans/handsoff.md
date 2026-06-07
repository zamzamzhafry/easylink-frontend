# HANDOFF CONTEXT

## USER REQUESTS (AS-IS)

- Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
- i need to safely stop after the current task is done and restart the machine and terminal ui. how to :

1. safely end this session without interrupting too much works.
2. re attach this session and /start-work again
3. with updating todo list how much is plan task left

- with no more interruption
- do all of the task until finish uninterupted and then do check everything and mock test if its actually working or need fixing.
- if blocked, document the blocker and move to the next task
- if can avoid to re adding too much tailwind on pages side, but add to global.css and define as a class so its good for reusability.
- i could handle the migration when the last UAT happens. with the grouping member, leader etc. as long you documented everything
- use both chrome dev tool, playwright and next devtools mcp in combine for testing and rechecking for anything in this project. if something got blocked. inform me i will doing intervene and work around
  GOAL

---

Finish the remaining unchecked plan tasks with real runtime evidence and then complete the final verification wave (F1-F4).
WORK COMPLETED

---

- I advanced and verified major implementation work across Tasks 11-15 and substantial parts of 16-18, including repeated typecheck/build passes.
- I completed Task 13 runtime unblock and evidence flow: admin tagging UI evidence now passes and non-admin mutation still returns 403.
- I fully closed Task 14 implementation and evidence:
  - .sisyphus/evidence/task-14-fold-persist.json shows persistence true
  - .sisyphus/evidence/task-14-network.har includes expanded vs collapsed endpoint counts
  - .sisyphus/evidence/task-14-theme-fallback.json shows stable toggles/no loop
  - I also added structured theme fallback event instrumentation in components/app-shell.jsx.
- I aligned plan checkboxes with evidence reality (re-opened tasks when audit/evidence showed gaps, then re-checked Task 14 after evidence was complete).
- I prepared and updated todo tracking to focus on remaining unfinished work.
  CURRENT STATE

---

- Plan unchecked items are now exactly 7:
  - 16, 17, 18, F1, F2, F3, F4
- Build status: npm run typecheck and npm run build are currently passing.
- Active blocker right now is Task 16 runtime UI evidence:
  - Playwright evidence file shows missing panel labels for leader (pass: false)
  - API/auth checks for leader are valid (/api/auth/me confirms leader capabilities)
  - Raw HTML includes “Checking session” and does not include client-rendered panel labels (hydration-dependent)
- Current todo state:
  - in_progress: Finish Task 16 leader and employee runtime verification evidence
  - pending: Complete Task 17 runtime UI verification and role-scope evidence
  - pending: Complete Task 18 performance/localization/readability evidence verification
  - pending: Run final verification wave F1-F4 and resolve findings
- Git working tree is very large and dirty (many modified + untracked files in app/, lib/, docs/, .sisyphus/, scripts/). This is expected for this long-running effort and should be handled carefully.
  PENDING TASKS

---

- Task 16:
  - Re-run leader Playwright check until reliable hydrated state is captured
  - Generate/confirm employee evidence file similarly
  - Confirm acceptance condition: summary + monthly prediction visible, review controls absent for non-admin
- Task 17:
  - Runtime UI evidence still needs closure despite implementation and API verification progress
  - Confirm role-scope behavior in UI and capture final evidence file(s)
- Task 18:
  - Evidence closure still needed for perf/localization/readability hardening even though code migrations are largely in place
- Final wave:
  - F1 plan compliance audit (re-run with latest evidence)
  - F2 code quality review
  - F3 real manual QA
  - F4 scope fidelity check
- Blockers/issues encountered:
  - Intermittent Playwright/dev-server runtime issues caused false negatives/timeouts earlier
  - Task 16 is currently the active gating issue
    KEY FILES

---

- .sisyphus/plans/easylink-architecture-clean-slate.md - Source of truth for remaining unchecked tasks
- .sisyphus/evidence/task-14-fold-persist.json - Task 14 fold persistence verification result
- .sisyphus/evidence/task-14-network.har - Task 14 expanded vs collapsed endpoint request evidence
- .sisyphus/evidence/task-14-theme-fallback.json - Task 14 theme toggle stability evidence
- .sisyphus/evidence/task-13-admin-tagging.json - Task 13 admin tagging success evidence
- .sisyphus/evidence/task-16-leader.json - Current failing leader scope runtime evidence
- app/attendance/page.jsx - Task 16 scope UI (summary/prediction panel + review button visibility behavior)
- app/attendance/review/page.jsx - Task 13 tagging/review UI gating logic
- components/app-shell.jsx - Route guards, right-sidebar persistence, theme fallback one-shot instrumentation
- components/right-ops-sidebar.jsx - Fold behavior and collapsed polling suppression logic
  IMPORTANT DECISIONS

---

- I treated checkbox state as non-authoritative unless backed by runtime evidence (from earlier F1 findings).
- I prioritized compatibility-first and additive changes, especially around auth/session/migration-related behavior.
- I moved repeated style clusters toward global semantic classes in globals.css per user preference, then migrated key pages incrementally.
- I kept non-admin enforcement server-side as the hard gate and treated UI gating as usability/visibility layer.
- I left unresolved tasks unchecked when evidence was incomplete, rather than forcing completion.
  EXPLICIT CONSTRAINTS

---

- with no more interruption
- do all of the task until finish uninterupted and then do check everything and mock test if its actually working or need fixing.
- if blocked, document the blocker and move to the next task
- if can avoid to re adding too much tailwind on pages side, but add to global.css and define as a class so its good for reusability.
- i could handle the migration when the last UAT happens. with the grouping member, leader etc. as long you documented everything
- use both chrome dev tool, playwright and next devtools mcp in combine for testing and rechecking for anything in this project. if something got blocked. inform me i will doing intervene and work around
  CONTEXT FOR CONTINUATION

---

- Start from Task 16 (first unchecked task) and close leader/employee runtime evidence first.
- For Task 16 QA, do not rely on raw HTML grep; wait for hydration and verify rendered text on /attendance.
- Keep using evidence-first gating before changing plan checkboxes.
- After Task 16 closure, proceed sequentially: Task 17 evidence closure, Task 18 evidence closure, then F1-F4.
- Be careful with the large dirty worktree; avoid broad unrelated edits while finishing remaining gates.
- If Playwright or runtime instability happens again, document blocker precisely in evidence and continue next independent task per user instruction.

---

TO CONTINUE IN A NEW SESSION:

1. Press 'n' in OpenCode TUI to open a new session, or run 'opencode' in a new terminal
2. Paste the HANDOFF CONTEXT above as your first message
3. Add your request: "Continue from the handoff context above. Your next task"
