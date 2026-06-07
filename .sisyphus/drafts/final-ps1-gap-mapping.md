# Draft: final.ps1 Feature Gap Mapping

## Requirements (confirmed)
- "map the final.ps1 i already updated it, using librarian etc. and compare what feature are still missing and needed"
- Provide ready-to-use settings for OpenCode JSON, MCP config, and LSP/lint QoL additions (e.g., Tailwind LSP).
- Provide clean global `oh-my-opencode.json` recommendation with Tailwind LSP and Gemini model routing for design categories.

## Technical Decisions
- Compare against authoritative source `docs/learning/final.ps1` menu + endpoint map.
- Use current runtime-facing implementation surfaces as evidence: `app/machine/page.jsx`, `app/api/machine/route.js`, `app/api/scanlog/*`, and related machine libs.
- Classify parity with three statuses: Implemented, Partial, Missing.
- Include role/access implications for destructive actions (admin-gated + explicit confirmations), using external best-practice guidance.
- Confirmed scope choice: include destructive parity actions now (menu 10-14), not placeholder-only deferral.
- Confirmed parity behavior for users paging: one-click full auto-loop mode (final.ps1-style) is target.
- Confirmed `Scanlog GPS` is included in the same parity scope (not deferred).

## Research Findings
- `docs/learning/final.ps1` defines menu operations 1,2,3,4,5,6,8,9,10,11,12,13,14,15 with endpoint mapping.
- `app/api/machine/route.js` currently supports: `info`, `time`, `sync_time`, `pull_users`, `users_partial`, `scanlog_new`, `devinfo`, `set_user`, `initialize_machine`.
- No machine dispatcher handlers exist yet for `scanlog_gps` or destructive delete actions except `initialize_machine`.
- Machine UI already includes queue + actions for info/time/sync/pull-users/add-user/devinfo/scanlog new/task12 flows; destructive suite is not present as full parity controls.
- External guidance supports grouping by operation domain and strict RBAC/guardrails for destructive commands.
- `app/machine/page.jsx` is currently section/card-based (not a true tab architecture), while schedule already uses explicit `TABS` in `app/schedule/page.jsx`.
- `components/right-ops-sidebar.jsx` already provides admin-only queue/JSON panels and can remain a supporting ops surface alongside machine tabs.
- Local OpenCode plugin registry supports both `google/antigravity-gemini-3.1-pro` and `google/gemini-3.1-pro-preview`; shipped profiles map visual-engineering/artistry to `google/antigravity-gemini-3.1-pro`.
- Tailwind LSP entry is schema-compatible in `oh-my-opencode.json` using `tailwindcss-language-server --stdio` and web-related extensions.

## Open Questions
- Which editor profile should be treated as primary for LSP QoL settings (VS Code / Cursor / Neovim / Zed)?

## Scope Boundaries
- INCLUDE: parity matrix, missing-feature analysis, prioritized recommendation list.
- EXCLUDE: direct code implementation and endpoint mutations.

## Notes
- Global `oh-my-opencode.json` direct mutation is deferred (user opted to skip because setup is bundled via multi-auth/plugin-managed configuration path).
