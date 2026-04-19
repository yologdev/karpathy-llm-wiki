Title: Test suites for wiki-log.ts, lock.ts, and providers.ts
Files: src/lib/__tests__/wiki-log.test.ts, src/lib/__tests__/lock.test.ts, src/lib/__tests__/providers.test.ts
Issue: none

Complete the test coverage story by writing dedicated test suites for the 3
remaining testable production modules (277 lines total). These are the last
modules without dedicated tests; `constants.ts` (83 lines) and `types.ts`
(85 lines) are pure static values/interfaces and don't need runtime tests.

## wiki-log.test.ts (~30 tests)

Module: `src/lib/wiki-log.ts` (87 lines) — `appendToLog()` and `readLog()`.

Test categories:
- **appendToLog happy path:** writes a log entry with correct date format `## [YYYY-MM-DD] operation | title`
- **appendToLog with details:** includes details body below heading
- **appendToLog validation:** rejects invalid operation strings, empty titles, non-string titles
- **appendToLog concurrency:** calling appendToLog multiple times concurrently (it uses withFileLock) — all entries should appear
- **readLog happy path:** reads back what was written
- **readLog missing file:** returns `null` when log.md doesn't exist
- **readLog error handling:** returns `null` on permission errors (mock fs.readFile to throw non-ENOENT)

Mock approach: Use a real temp directory (similar to lifecycle.test.ts pattern) — set WIKI_DIR env var to a temp dir, write/read actual files. Mock `withFileLock` only for concurrency tests if needed.

## lock.test.ts (~15 tests)

Module: `src/lib/lock.ts` (61 lines) — `withFileLock()` and `_resetLocks()`.

Test categories:
- **Basic execution:** fn runs and returns its value
- **Serialization:** two calls with same key run sequentially (use timing or side effects to prove ordering)
- **Different keys don't block:** two calls with different keys can run concurrently
- **Error propagation:** if fn throws, withFileLock re-throws
- **Error doesn't block next:** after fn throws, the next call for that key still runs
- **_resetLocks:** clears the lock map so a fresh start is possible

## providers.test.ts (~10 tests)

Module: `src/lib/providers.ts` (46 lines) — `PROVIDER_INFO`, `VALID_PROVIDERS`, `DEFAULT_MODELS`, `providerLabel()`.

Test categories:
- **PROVIDER_INFO:** has entries for anthropic, openai, google, ollama
- **VALID_PROVIDERS:** is a Set containing exactly those 4 values
- **DEFAULT_MODELS:** has a default model for each provider
- **providerLabel:** returns human label for known providers, raw string for unknown

## Verification

```sh
pnpm test -- --reporter=verbose src/lib/__tests__/wiki-log.test.ts src/lib/__tests__/lock.test.ts src/lib/__tests__/providers.test.ts
pnpm build && pnpm lint && pnpm test
```
