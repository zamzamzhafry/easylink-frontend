# Documentation Index

This folder is the handoff context for future contributors and AI agents.

## Core Docs

- [`project-context.md`](./project-context.md)
  - High-level architecture
  - How request flow works (UI -> API -> DB/SDK)
  - Auth and authorization model
  - Environment configuration notes
- [`agent-restrictions.md`](./agent-restrictions.md)
  - Working rules and safety constraints for future agents
  - Code quality and migration guardrails
- [`roadmap-n-plus-one-normalization.md`](./roadmap-n-plus-one-normalization.md)
  - Roadmap to reduce N+1 query patterns and normalize schema in later versions
- [`machine-sdk-routing-and-debug.md`](./machine-sdk-routing-and-debug.md)
  - Windows SDK routing fallback and non-hardcoded endpoint mapping
  - Curl/PowerShell verification commands for environments where agent cannot reach LAN target directly
  - Known symptom fixes (`Command not found`, `Device time: [object Object]`)
- [`scanlog-sdk-curl-postman-reference.md`](./scanlog-sdk-curl-postman-reference.md)
  - Exa + grep exploration summary for EasyLink SDK JS references
  - Raw curl commands for user/scanlog endpoints with date-range and paging
  - Postman collection + backend queue request patterns for SDK-first ingestion
- [`response_testing.md`](./response_testing.md)
  - Operational response log for SDK -> backend curl verification
  - Append real terminal outputs from machine + app API tests
- [`postman/easylink-machine-sdk.collection.json`](./postman/easylink-machine-sdk.collection.json)
  - Importable Postman collection for SDK and backend sync route checks
- [`api/machine-sdk-env-cleanup.md`](./api/machine-sdk-env-cleanup.md)
  - SDK-first env map (active vs legacy-looking vars)
  - Safe cleanup notes before removing direct-device fallback vars

## Existing Migration/Refactor Docs

- [`scanlog-refactor-v1.md`](./scanlog-refactor-v1.md)
- [`scanlog-cutover-runbook.md`](./scanlog-cutover-runbook.md)

## Quick Start for Next AI Agent

1. Read `project-context.md` first.
2. Follow all rules in `agent-restrictions.md`.
3. If touching attendance/scanlog queries, align with `roadmap-n-plus-one-normalization.md` and scanlog docs.
4. Validate with `npm run typecheck` and `npm run build` before finishing.
