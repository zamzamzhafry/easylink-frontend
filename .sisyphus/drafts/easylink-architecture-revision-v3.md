# Draft: EasyLink Architecture Revision v3

## Requirements (confirmed)

- Continue executing remaining plan tasks.
- Add Chrome DevTools MCP setup as the first execution step.
- MCP configuration location chosen: repository root `.mcp.json`.
- Enforce combined verification toolchain for project testing:
  - Chrome DevTools MCP
  - Next DevTools MCP
  - Playwright
- If MCP/browser tooling is blocked, report blocker immediately for user intervention/workaround.
- Context management preference: keep working context around ~80% utilization during execution.

## Technical Decisions

- Introduce Task 0 in plan as a preflight setup task before Task 1.
- Use root project MCP config with the exact `chrome-devtools-mcp` command args provided by user.
- Use dual MCP setup (`chrome-devtools` + `next-devtools`) and bind browser QA flows to combined MCP + Playwright checks.

## Research Findings

- No existing MCP configuration file found in repository for browser/testing MCP integration.
- `chrome-devtools-mcp` CLI is invokable in this environment.
- `next-devtools-mcp` CLI is invokable in this environment.

## Open Questions

- None currently blocking.

## Scope Boundaries

- INCLUDE: plan revision and execution ordering update.
- EXCLUDE: immediate implementation (handled by execution agent after `/start-work`).
