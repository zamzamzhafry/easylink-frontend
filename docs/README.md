# Documentation Index

This folder is the handoff context for future contributors and AI agents.

## Start Here

- [`CONTEXT.md`](./CONTEXT.md)
  - Canonical compact context spine for future contributors and AI agents
  - Current source of truth for repo-wide context, active focus, and stale-doc rules

## Core Docs

- [`../.env.example`](../.env.example)
  - Canonical env var template for local build/runtime parity
  - `AUTH_SECRET` and `DB_PASSWORD` must be set for production-like builds
- [`project-context.md`](./project-context.md)
  - High-level architecture
  - How request flow works (UI -> API -> DB/SDK)
  - Auth and authorization model
  - Environment configuration notes
- [`auth-domain-glossary.md`](./auth-domain-glossary.md)
  - Shared terminology for auth identity lanes, canonical roles, capabilities, scope, elevation, and hardening
- [`adr/0001-auth-identity-resolution-and-capability-model.md`](./adr/0001-auth-identity-resolution-and-capability-model.md)
  - Accepted auth architecture direction for identity resolution, capability-driven authorization, and controlled role mutation
- [`auth-hardening-execution-plan.md`](./auth-hardening-execution-plan.md)
  - Staged execution plan for auth hardening after the `HRD01` elevation incident
- [`implementation-guidance-component-auth-service-slicing.md`](./implementation-guidance-component-auth-service-slicing.md)
  - Implementation guidance for frontend slicing, auth scope redesign, backend modularization, and phased service extraction
  - Synthesizes architecture review findings into staged implementation order and migration guidance
- [`role-scope-matrix.md`](./role-scope-matrix.md)
  - Canonical target global roles, group roles, scope catalog, and compatibility mapping
- [`route-ownership-matrix.md`](./route-ownership-matrix.md)
  - Route-to-domain ownership map for modular-monolith refactoring and later service extraction
- [`auth-canonical-schema-ddl.md`](./auth-canonical-schema-ddl.md)
  - Proposed canonical SQL DDL for unified auth identities, roles, scopes, and group bindings
- [`service-extraction-roadmap.md`](./service-extraction-roadmap.md)
  - Phased roadmap for modularization-first service extraction across identity, machine, scanlog, scheduling, workforce, and reporting
- [`hrd01-auth-elevation-hardening-review-2026-05-22.md`](./hrd01-auth-elevation-hardening-review-2026-05-22.md)
  - Incident-driven review of `HRD01` SQL elevation behavior, risks, and hardening recommendations
- [`app-current-state-graph.md`](./app-current-state-graph.md)
  - Mermaid graph map of current UI routes, API topology, auth, data flows, machine/scanlog, ops recovery, and release gates
- [`graphify-app-direction.md`](./graphify-app-direction.md)
  - Graphify-backed reading of the `app/` surface
  - Explains the likely product and architecture direction in plain English
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
- [`research/demo-easylinksdk-schema-research.md`](./research/demo-easylinksdk-schema-research.md)
  - Working research note built from the demo SQL dump and clean structure export
  - Groups tables by domain, maps current app usage, and tracks keep/drop candidates
- [`research/sdk-server-bridge-blueprint.md`](./research/sdk-server-bridge-blueprint.md)
  - Server-machine blueprint for PHP-first SDK pulls, loose internal bridge settings, and Task Scheduler job mapping
  - Includes the exact endpoint family observed in `E:\Project\sdk` and an Express fallback path
- [`agent-context/session-handoff-2026-04-19.md`](./agent-context/session-handoff-2026-04-19.md)
  - Historical April 2026 handoff for schedule/attendance export + quick-summary refactor session
  - Includes verification status and bulk Excel benchmark snapshot
- [`agent-context/session-handoff-2026-04-19-relocate-export-scope.md`](./agent-context/session-handoff-2026-04-19-relocate-export-scope.md)
  - Follow-up handoff for relocating quick-summary export scope controls to export actions area
  - Clarifies API behavior and UX intent
- [`agent-context/session-handoff-2026-04-19-machine-role-elevation.md`](./agent-context/session-handoff-2026-04-19-machine-role-elevation.md)
  - Explains canonical role elevation from legacy auth flags and NIP-based role loading
- [`agent-context/session-handoff-2026-04-19-employee-visibility-matrix.md`](./agent-context/session-handoff-2026-04-19-employee-visibility-matrix.md)
  - Employee-side sidebar and route visibility matrix for attendance/performance flows
- [`agent-context/session-handoff-2026-04-19-machine-connection-checker.md`](./agent-context/session-handoff-2026-04-19-machine-connection-checker.md)
  - Role-aware machine checker behavior, polling cadence, and result rendering rules
- [`agent-context/session-handoff-2026-04-19-attendance-performance-backlog.md`](./agent-context/session-handoff-2026-04-19-attendance-performance-backlog.md)
  - Stale planning backlog retained for history/reference only
- [`agent-context/next-session-master-board.md`](./agent-context/next-session-master-board.md)
  - Stale/superseded April status matrix retained for historical reference only
- [`agent-context/session-handoff-2026-05-12-network-vm-landing.md`](./agent-context/session-handoff-2026-05-12-network-vm-landing.md)
  - Current network-scope, refresh-model, VM deployment, and landing-page direction
- [`release/vm-apache-landing-page.md`](./release/vm-apache-landing-page.md)
  - Apache/PHP landing hub contract for private multi-app hosting

## Release Ops Docs

- [`release/prod-deploy-windows.md`](./release/prod-deploy-windows.md)
  - Windows production deploy, smoke checks, rollback, and UAT-hold defaults
- [`release/prod-deploy-linux.md`](./release/prod-deploy-linux.md)
  - Linux production deploy, service/process commands, smoke checks, rollback
- [`release/env-contract.md`](./release/env-contract.md)
  - Required env variables, security rules, and canonical/fallback key contract
- [`release/uat-hold-policy.md`](./release/uat-hold-policy.md)
  - Allowed/disallowed changes and rollback triggers while UAT is ongoing
- [`release/server-machine-task-scheduler-setup.md`](./release/server-machine-task-scheduler-setup.md)
  - Server-only runbook for creating the fixed recovery task and the recurring SDK pull jobs
  - Aligns the dashboard ops button with Windows Task Scheduler on the production host

Read more:

- Machine auth/elevation: [`session-handoff-2026-04-19-machine-role-elevation.md`](./agent-context/session-handoff-2026-04-19-machine-role-elevation.md)
- Visibility map: [`session-handoff-2026-04-19-employee-visibility-matrix.md`](./agent-context/session-handoff-2026-04-19-employee-visibility-matrix.md)
- Connection checker: [`session-handoff-2026-04-19-machine-connection-checker.md`](./agent-context/session-handoff-2026-04-19-machine-connection-checker.md)

## Existing Migration/Refactor Docs

- [`scanlog-refactor-v1.md`](./scanlog-refactor-v1.md)
- [`scanlog-cutover-runbook.md`](./scanlog-cutover-runbook.md)

## Quick Start for Next AI Agent

1. Read `project-context.md` first.
2. Follow all rules in `agent-restrictions.md`.
3. If touching attendance/scanlog queries, align with `roadmap-n-plus-one-normalization.md` and scanlog docs.
4. Validate with `npm run typecheck` and `npm run build` before finishing.
5. If touching app entry/discovery UX, read `AGENTS.md` and `.codex/skills/ui-ux-pro-max/SKILL.md`.
