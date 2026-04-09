Verdict: PASS
Reason: All task requirements implemented correctly — `loadPageConventions` is imported from `ingest.ts` into both `lint.ts` and `query.ts`, conventions are appended to system prompts when present, lint loads once outside the cluster loop (efficient), and 4 new tests cover the cross-module import and prompt integration for both query and lint. Build and all 247 tests pass.
