Title: Test suites for links.ts and citations.ts
Files: src/lib/__tests__/links.test.ts, src/lib/__tests__/citations.test.ts
Issue: none

Add dedicated test suites for the two smallest untested pure-logic modules:

## links.ts (44 lines) — src/lib/__tests__/links.test.ts

Test all three exported functions:

1. **escapeRegex(s)**
   - Escapes all special regex chars: `.*+?^${}()|[]\`
   - Passes through plain strings unchanged
   - Handles empty string

2. **extractWikiLinks(content)**
   - Extracts `[text](slug.md)` links from markdown content
   - Returns array of `{ text, targetSlug }`
   - Handles multiple links in same content
   - Handles links with hyphens, underscores in slug
   - Returns empty array when no links
   - Does NOT match non-.md links (e.g. `[text](https://example.com)`)
   - Does NOT match bare text without link syntax

3. **hasLinkTo(content, targetSlug)**
   - Returns true when content contains `](slug.md)`
   - Returns false when slug appears in prose but not as a link
   - Returns false when content is empty
   - Handles slugs with special regex characters (tests escapeRegex integration)

## citations.ts (22 lines) — src/lib/__tests__/citations.test.ts

Test `extractCitedSlugs(answer, availableSlugs)`:

1. Extracts slugs from `](slug.md)` patterns in answer text
2. Only returns slugs that exist in the availableSlugs array
3. Deduplicates (same slug cited multiple times → appears once)
4. Returns empty array when no citations found
5. Returns empty array when availableSlugs is empty
6. Handles slugs with hyphens and underscores
7. Does not match partial slug matches (e.g. `foo` should not match `foobar`)

Verify: `pnpm build && pnpm lint && pnpm test`
