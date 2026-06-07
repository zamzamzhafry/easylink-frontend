# Problems

- 2026-03-30: Full EN/ID runtime verification on authenticated primary routes (`/attendance`, `/machine`, `/report`) remains blocked in this environment because auth endpoints return `500`, forcing QA evidence to rely on login-route runtime checks and dictionary-level coverage assertions.

- 2026-03-30: Protected-route browser verification still depends on healthy auth and database backend; without resolving 500 auth endpoints, full EN and ID runtime validation across attendance, report, and machine remains environment-blocked.
- 2026-03-30: Authenticated-route QA evidence for Task 18 remains pending by design in this pass (orchestrator requested code-only retry); a follow-up execution step is still required to regenerate `/attendance`, `/machine`, `/report` evidence artifacts.
- 2026-03-30: In the dedicated evidence refresh on port 3060, all required seeded credentials still failed (`/api/auth/login` 401), so sidebar and machine EN/ID label-switch runtime assertions remain unresolved until authentication succeeds.
- 2026-03-30: Auth blocker is resolved for the latest pass when using seeded `password`; remaining unresolved item is separate runtime instability on `/attendance/review` for leader browser-flow (removeChild null).
- 2026-03-30: No auth blockage for stress probes; remaining risk is payload volume on bounded report/scanlog queries that can still affect perceived responsiveness at higher limits.
- 2026-03-30: Current unresolved perf gate for Task 18 is report-page interactive latency under reload/filter actions (p95 above 100ms target in authenticated sampling).
- 2026-03-30: Dev-runtime stress timings can include warmup overhead (notably auth/me), so repeated baseline sampling may be needed before final gate interpretation.
- 2026-03-30: Machine scoped perf now passes p95 target, but control discoverability variance in runtime UI text suggests automation selectors should be stabilized for reproducible perf scripts.
