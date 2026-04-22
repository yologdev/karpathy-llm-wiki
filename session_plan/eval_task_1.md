Verdict: PASS
Reason: All `process.env` reads in `wiki.ts` and `embeddings.ts` are correctly replaced with config-layer calls; grep confirms zero direct `process.env` access outside `config.ts` and test files; new functions and tests match the task spec exactly.
