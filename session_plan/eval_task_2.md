Verdict: PASS
Reason: URL-fetching functions correctly extracted into `fetch.ts` (403 lines) with no wiki/LLM dependencies, `ingest.ts` reduced to 461 lines with no readability/linkedom imports, and all moved symbols are re-exported from `ingest.ts` preserving backward compatibility. Build and tests pass.
