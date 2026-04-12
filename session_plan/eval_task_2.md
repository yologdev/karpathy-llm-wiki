Verdict: PASS
Reason: `lint()` correctly wrapped in `withPageCache()`, import added, and new test verifies cache is active during lint (disk reads < uncached count) and cleaned up afterward. No bugs; all existing tests pass.
