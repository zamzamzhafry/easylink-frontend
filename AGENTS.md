# EasyLink Agent Guide

Read these first:

1. `docs/README.md`
2. `docs/agent-restrictions.md`
3. `docs/agent-context/current-project-context.md`
4. `docs/agent-context/session-handoff-2026-05-12-network-vm-landing.md`

## Local Skill

- `UI UX PRO MAX`
  - Path: `.codex/skills/ui-ux-pro-max/SKILL.md`
  - Use for landing pages, dashboards, empty states, skeleton/loading patterns, error treatment, and app-directory style navigation surfaces.

## Repo-Specific Defaults

- Network scope for deployed app surfaces is private-only: LAN plus approved VPN ranges.
- Prefer event-driven refresh and manual refresh fallback over interval polling.
- Do not treat transient API failure as auth expiry; redirect to login only on confirmed auth failure.
- Expensive page reads should not fan out blindly on every mount; prefer composed reads, cache, and invalidation.
- If touching server landing page assets, keep repo source of truth in `ops/landing-page/`.
