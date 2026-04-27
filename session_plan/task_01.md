Title: Dedicated test suite for lint-checks.ts
Files: src/lib/__tests__/lint-checks.test.ts
Issue: none

## Description

`lint-checks.ts` is the second-largest lib module at 535 lines with 15 exported functions, but has no dedicated test file. Existing coverage is indirect via `lint.test.ts` which tests the top-level `lint()` orchestrator. Several pure/unit-testable functions lack focused edge-case coverage:

### Functions to test (with unit test focus)

1. **`getOnDiskSlugs(wikiDir)`** — Test:
   - Returns slugs from `.md` files excluding `index.md` and `log.md`
   - Returns `[]` when directory doesn't exist
   - Ignores non-`.md` files

2. **`checkOrphanPages(diskSlugs, indexSlugs)`** — Test:
   - Returns issues for slugs on disk but not in index
   - Returns `[]` when all slugs are in index
   - Empty inputs

3. **`checkStaleIndex(indexSlugs, diskSlugSet)`** — Test:
   - Returns issues for index slugs with no disk file
   - Returns `[]` when all index slugs exist on disk

4. **`checkEmptyPages(diskSlugs)`** — Test:
   - Detects pages with very little content (just a heading)
   - Passes pages with substantial content
   - Handles missing files gracefully

5. **`checkMissingCrossRefs(diskSlugs)`** — Test:
   - Detects when page A mentions a term that is slug B but doesn't link to B
   - Does NOT flag partial matches inside larger words (the existing "map" inside "bitmap" test covers this at integration level — add unit-level confirmation)
   - Handles pages with no potential cross-refs

6. **`buildSummary(issues)`** — Test:
   - Correct counts by severity and type
   - Returns zero-count summary for empty array
   - Handles mixed severity issues

### Implementation notes

- Create `src/lib/__tests__/lint-checks.test.ts`
- Use temp directories with `fs.mkdtemp` for filesystem tests (same pattern as `lint.test.ts`)
- Import functions directly from `../lint-checks` (not via `../lint`)
- Do NOT mock the LLM — focus only on the non-LLM functions listed above
- Target: ~20-25 test cases
- Verify: `pnpm build && pnpm lint && pnpm test`
