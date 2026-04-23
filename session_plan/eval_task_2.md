Verdict: PASS
Reason: `loadPageConventions` correctly extracted to `schema.ts` with proper imports, `[schema]` warn tag, and backward-compat re-export from `ingest.ts`. All three consumers (`ingest.ts`, `query.ts`, `lint-checks.ts`) updated to import from the canonical location. Build and tests pass.
