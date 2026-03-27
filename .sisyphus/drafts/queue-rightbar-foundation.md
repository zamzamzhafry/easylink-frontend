# Draft: Queue Rightbar Foundation

## Requirements (confirmed)

- queue foundation on right sidebar panel shared across pages
- avoid double pull request to machines while processing is still active (single in-flight behavior)
- scanlog all paging can take long; keep/open session/connection handling for waiting machine responses
- provide abort/cancel control during active request processing
- all button interactions must show warning popup confirmation before proceeding
- provide curl for pull new scanlog so user can test from external terminal
- restructure markdown docs for APIs/features with lower-usage agents
- provide curl examples for additional features (including users feature) in markdown docs
- user will provide external terminal response results in markdown files
- split concerns: backend handles machine pulling/queuing, frontend consumes queue/result APIs
- QoL pass for schedule + attendance pages with less text, clearer icon hierarchy, and stronger contrast
- move Postman collection assets into `docs/` for centralized reference
- merge SQL structure migrations into one deployable SQL file (engine-safe)

## Technical Decisions

- planning mode only; no direct implementation in this session

## Research Findings

- previous handoff draft confirms runtime behavior for `/dev/info`, `/scanlog/new`, `/scanlog/all/paging`

## Open Questions

- none blocking for planning; unresolved choices will use explicit defaults in the execution plan

## Scope Boundaries

- INCLUDE: queue UI foundation, in-flight lock, session handling approach, abort interaction, confirmation UX, docs restructuring tasks, curl documentation workflow
- EXCLUDE: direct source-code implementation in this planning step
