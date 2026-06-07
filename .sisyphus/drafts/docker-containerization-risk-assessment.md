# Draft: Docker Containerization Risk Assessment

## Requirements (confirmed)
- easier deploy app by containerizing into Docker
- assess risk before implementation
- gather external references via Exa web browsing

## Technical Decisions
- classify as Architecture intent due deployment/runtime/security impact
- use phased risk assessment: repo-grounded findings + official docs references + architecture review
- recommend containerization plan only after go/no-go criteria and rollout gates are defined
- runtime target selected: VM + Docker Compose (phase-1)
- release strategy selected: Canary rollout
- scale strategy selected: single replica first (avoid in-memory queue split risk)

## Research Findings
- `package.json`: Next.js 14.2.3 app with `build`/`start` scripts and npm lockfile
- `next.config.js`: no explicit standalone output configured yet
- env/config heavy runtime (`process.env` usage across DB/auth/EasyLink paths)
- no Dockerfile/Compose/CI workflow currently present in repo
- official references gathered from Next.js self-hosting/deploy docs and Docker build best-practice docs
- stateful coupling confirmed: MySQL dependency (`lib/db.js`), in-process machine queues (`app/api/machine/route.js`, `app/api/scanlog/sync/route.js`), filesystem writes for holiday data (`lib/id-holidays-fallback.js`)
- external network/device coupling confirmed: EasyLink/WSDK + `fingerspot-easylink-ts` integration (`lib/easylink-sdk-client.js`)
- architecture review (oracle): top risks are device-network reachability, env/secret misconfiguration, and migration orchestration/rollback safety
- reference URLs captured:
  - https://nextjs.org/docs/app/guides/self-hosting
  - https://nextjs.org/docs/app/getting-started/deploying
  - https://docs.docker.com/build/building/multi-stage/
  - https://docs.docker.com/build/building/best-practices/
  - https://github.com/vercel/next.js/tree/canary/examples/with-docker

## Open Questions
- expected SLA/SLO for machine/device operations during migration
- production secret source: `.env` on host vs secret manager injection

## Scope Boundaries
- INCLUDE: risk matrix, mitigation strategy, rollout gates, references
- EXCLUDE: writing Dockerfile/Compose/code changes in this step
