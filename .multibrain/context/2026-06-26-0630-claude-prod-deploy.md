# 2026-06-26 06:30 — @claude — prod deploy to easylink-frontend-prod

## Goal
Merge stabilization to master, deploy prod build to `easylink-frontend-prod` folder, run on :3001.

## Summary
Merged `fix/bug-hunt-and-hardening` → `master` (fb3ccd5), pushed. Prod folder `easylink-frontend-prod` (separate repo, origin=dev repo) reset to origin/master, built, running on :3001 via pm2 `easylink-prod` (id 16, pid 3854921). pm2 saved.

## Changes
- master: merged fix branch (--no-ff). 172/172 tests green on master.
- `/home/user/projects/easylink-frontend-prod/.env`: copied from dev (DB + AUTH_SECRET). NOTE: ALLOW_INSECURE_COOKIES=true carried over — local-VM HTTP only; flip to false + Secure cookies before any real deploy.
- prod `.next`: clean rebuild (rm -rf .next first).

## Files
- master branch (fb3ccd5)
- easylink-frontend-prod/.env (new, gitignored)

## Verification
- Dev :3002 killed (pid 2882510).
- Prod :3001: GET /, /login, /scanlog, /employees, /schedule, /groups, /users, /machine, /analytics, /performance, /attendance — all 200.
- Auth live: POST /api/auth/login {admin001/password} → 200 + admin context; GET /api/auth/me → 200; GET /api/analytics → 200 (DB query works).
- pm2 `easylink-prod` online, 123mb, saved to dump.pm2.

## Root cause of 500s during deploy
pm2 `easylink-prod` proc was first started from DEV repo's ecosystem.config.js (cwd=dev, script=dev's next). `pm2 restart`/`reload`/`startOrReload` reuse the SAVED process def — cwd never changed, so prod's `next start` loaded dev repo's `.next/server/webpack-runtime.js` → `MODULE_NOT_FOUND ./1682.js` (dev BUILD_ID ≠ prod). Fix: `pm2 delete easylink-prod` + `pm2 start ecosystem.config.js` from prod folder → cwd resets to prod, loads prod `.next`.

## Follow-up
- `port-3001-reserver` (id 10) stopped — prod owns :3001. If prod stopped, reserver must restart to hold the port; pm2 won't auto-start it (saved state = stopped).
- Flip ALLOW_INSECURE_COOKIES=false + Secure cookies before public deploy.
- Next prod deploy shortcut: `cd easylink-frontend-prod && git reset --hard origin/master && npm run build && pm2 restart easylink-prod` (cwd now correct, no delete needed).
