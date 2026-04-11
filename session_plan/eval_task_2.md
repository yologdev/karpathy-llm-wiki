Verdict: PASS
Reason: All 9 constants correctly centralized into constants.ts with JSDoc comments, all 4 consumer modules updated to import from the new location, duplicated MAX_URLS/MAX_BATCH_SIZE consolidated into MAX_BATCH_URLS, and MAX_LLM_INPUT_CHARS re-exported from ingest.ts for backward compatibility. Build and tests pass.
