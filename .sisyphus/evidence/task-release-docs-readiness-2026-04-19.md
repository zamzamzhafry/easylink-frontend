# Release Docs Readiness Evidence (2026-04-19)

Created documents:

1. `docs/release/prod-deploy-windows.md`
2. `docs/release/prod-deploy-linux.md`
3. `docs/release/env-contract.md`
4. `docs/release/uat-hold-policy.md`
5. `docs/agent-context/next-session-master-board.md`

Validation summary:

1. Docs include compatibility-first rollout defaults (`legacy`, `legacy_only`, `off`, `legacy`).
2. Docs include explicit hardening checklist (no default secret, no insecure TLS bypass, backup verification).
3. Docs include pre-deploy SQL drift checks for role/access compatibility (`tb_user_group_access.is_leader`).
4. Docs include smoke and rollback sequences for both Windows and Linux, with rollback command aligned to orchestrator CLI (`npm run migration:v3 -- --mode rollback --execute`).
5. Docs enforce DB target alignment guidance for runtime vs script operations (`DB_NAME` and `EASYLINK_DB_NAME`).
6. Env contract includes canonical SDK endpoint keys and deprecated alias notes.
7. UAT docs include single-instance operational guard while queue workers remain in-process.
8. `docs/README.md` updated to index new release and board docs.
