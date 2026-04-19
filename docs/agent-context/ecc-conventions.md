# ECC Conventions for This Repo

Installed skill: `C:\Users\TECH NEWB\.codex\skills\everything-claude-code\SKILL.md`

Use this skill when making changes that should follow the Everything Claude Code conventions:

- Prefer conventional commits (`feat`, `fix`, `docs`, `test`, etc.).
- Keep file names camelCase where this repo already uses that style.
- Follow existing module patterns instead of inventing new ones.
- Keep tests aligned with the repo's current `*.test.js` patterns.
- Update docs when a change affects behavior, workflows, or conventions.

How to apply it here:

1. Read this file before editing repo-wide conventions or workflow docs.
2. Use the skill for commit message style, repo organization, and cross-harness context updates.
3. For code changes, pair ECC conventions with the repo guardrails in `docs/agent-restrictions.md`.
4. Verify with `npm run typecheck` and `npm run build` before finishing.
