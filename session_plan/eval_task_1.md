Verdict: PASS
Reason: Pure move refactor correctly extracts all 7 check functions, helpers, and constants into `lint-checks.ts` while `lint.ts` retains only the orchestrator and re-exports all previously-public symbols so existing importers (tests, API routes) continue to work unchanged. Build and all tests pass.
