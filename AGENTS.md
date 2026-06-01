# EasyLink Agent Guide

Read these first:

1. `docs/README.md`
2. `docs/agent-restrictions.md`
3. `docs/agent-context/current-project-context.md`
4. `docs/agent-context/session-handoff-2026-05-12-network-vm-landing.md`
5. `docs/agent-context/session-handoff-2026-06-01-auth-model-and-login-fix.md`

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


## Multi Brain (MANDATORY)

This project uses `.multibrain/` for shared agent memory across sessions.

**Before starting work:**
1. Read `.multibrain/session.md` — master index, scan for relevant buckets
2. Read `.multibrain/indexes/<bucket>.md` for your task area
3. If an entry has `->` pointer, read that context file for full details

**After completing work:**
1. Add one-line entry to relevant `.multibrain/indexes/<bucket>.md` (newest first)
2. For complex tasks, create `.multibrain/context/YYYY-MM-DD-HHMM-agent-topic.md` with: Goal, Summary, Changes, Files, Verification, Follow-up
3. Update `.multibrain/session.md` if new bucket created

**Format for index entries:**
```
- `YYYY-MM-DD HH:MM` — @agent-name — One sentence summary -> .multibrain/context/filename.md
```

**Rules:**
- Facts over stream-of-consciousness
- Relative repo paths only
- Soft cap 25 entries per bucket — summarize old entries when exceeded
- Prefer compression over deletion

