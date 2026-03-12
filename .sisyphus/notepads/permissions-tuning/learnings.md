## Learnings
- Fixed duplicated auth and query blocks in /api/attendance/route.js and /api/attendance/raw/route.js which were causing build/runtime issues. Ensure only one auth gate per handler is preserved.
