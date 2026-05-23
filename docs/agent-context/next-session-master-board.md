# Next Session Master Board

**Status**: Stale/Superseded  
**Canonical replacement**: `docs/CONTEXT.md`  
**Reason**: This board reflects April 2026 planning/status truth and is no longer canonical for current auth-hardening and repo-wide context.

Last updated: 2026-04-19

## Canonical Sources

Use these as source of truth:

1. `.sisyphus/plans/easylink-architecture-clean-slate.md`
2. `docs/agent-context/session-handoff-2026-04-19.md`
3. `docs/agent-context/session-handoff-2026-04-19-attendance-performance-backlog.md`
4. `.sisyphus/evidence/*`

## Stale or Secondary References

Do not use these as primary status truth:

1. `.sisyphus/plans/handsoff.md`
2. `.sisyphus/plans/session-handoff-finalps1-and-remaining-todos.md`
3. `.sisyphus/notepads/easylink-architecture-clean-slate/todolist-agents.md`
4. `.sisyphus/evidence/F1-plan-compliance-audit.md` (historical snapshot)

## Normalized Evidence Mapping

Task 17 evidence labels are normalized to existing artifacts:

| Task | Scenario Label | Canonical Evidence |
|---|---|---|
| 17 | Drilldown interaction | `.sisyphus/evidence/task-17-report-ui.json` |
| 17 | Role payload scope | `.sisyphus/evidence/task-17-api-contract.json` |

Final-wave evidence file naming is locked to:

| Wave | Canonical Evidence |
|---|---|
| F1 | `.sisyphus/evidence/F1-plan-compliance-audit.md` |
| F2 | `.sisyphus/evidence/F2-code-quality-review.md` |
| F3 | `.sisyphus/evidence/F3-real-manual-qa.md` |
| F4 | `.sisyphus/evidence/F4-scope-fidelity-check.md` |

## Strict Status Matrix

Status fields:

- `impl_state`: `done`, `partial`, `not_started`
- `evidence_state`: `present`, `partial`, `missing`
- `gate_state`: `pass`, `blocked`, `pending`

| task_id | impl_state | evidence_state | gate_state | blocker |
|---|---|---|---|---|
| TASK-16 | done | present | pass | — |
| TASK-17 | done | present | pass | — |
| TASK-18 | done | present | pass | — |
| F1 | done | present | pass | Audit complete 2026-04-25 |
| F2 | done | present | pass | Review complete 2026-04-25 |
| F3 | not_started | missing | blocked | No current evidence artifact |
| F4 | not_started | missing | blocked | No current evidence artifact |

## Execution Order and Gates

### Phase 0: Normalize Status Truth

- Refresh status matrix from `.sisyphus/evidence`.
- Keep task checkboxes aligned with acceptance evidence.

Gate `G0`:

- No contradictory task/evidence state remains.

### Phase 1: Release Docs and UAT Hold

- Maintain and validate `docs/release/*`.
- Keep compatibility defaults during UAT.

Gate `G1`:

- Windows and Linux runbooks share same smoke/rollback structure.

### Phase 2: PDF/Print Holiday Compaction

- Remove holiday name text from print/PDF dense cells and headers.
- Keep compact date labels and holiday color markers.

Gate `G2`:

- Print output shows no holiday name text in compact table headers/cells.

### Phase 3: Evidence Refresh

- Regenerate artifacts for status matrix consistency, release readiness, and print/PDF behavior.

Gate `G3`:

- Every referenced evidence path exists and matches matrix rows.
