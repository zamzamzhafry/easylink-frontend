
## 2026-05-29 Task 6: Verification/Tooling Issue
- `lsp_diagnostics` for PHP could not run cleanly because workspace PHP LSP missing: `intelephense` not installed. Runtime verification used `php ops/fservice-sync/tests/hop-b-batch-selector-test.php` instead and passed after fixing test fixture statement reuse.
- 2026-05-29 Task 10: PHP LSP still unavailable for changed files (`Command not found: intelephense`); verification stayed runtime-first with selector test script.

## 2026-05-29 Task 8: Verification/Tooling Issue
- `node --test tests/hop-b-ingest-route.test.js` emits existing `[MODULE_TYPELESS_PACKAGE_JSON]` warning because repo has no `"type": "module"`; tests still pass and no package change made because scope forbids unrelated config churn.

## 2026-05-29 Task 7: Verification/Tooling Issue
- pcntl_fork() unavailable in local PHP build on Windows path, so sender integration tests switched to background proc_open() helper server (ops/fservice-sync/tests/hop-b-test-server.php).
- lsp_diagnostics still blocked by missing PHP LSP (intelephense not installed); targeted runtime tests passed and serve as verification evidence for this task.


## 2026-05-29 22:10:37 Task 11 verification issue
- PHP LSP still unavailable (intelephense missing). Runtime-first verification used php ops/fservice-sync/tests/hop-b-worker-cycle-test.php.
## 2026-05-29 Task 9: Verification Note
- `node --test tests/hop-b-ingest-route.test.js` still emits existing `[MODULE_TYPELESS_PACKAGE_JSON]` warning because repo stays without `"type": "module"`; tests pass and config unchanged per scope guard.

## 2026-05-29 Task 12 verification note
- Existing Node warning [MODULE_TYPELESS_PACKAGE_JSON] still expected when running 
ode --test tests/hop-b-ingest-route.test.js; no package config churn made because unrelated to scanlog cutover scope.



## 2026-05-30 F2: Code Quality Review
- Build Error: Cannot find module '.next\server\next-font-manifest.json' — pre-existing, NOT caused by HOP B changes. Verified via git stash + build + stash pop.
- MODULE_TYPELESS_PACKAGE_JSON warning in tests: pre-existing, repo lacks 'type: module'. HOP B tests all pass.
