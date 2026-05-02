Title: Contributor profiles data layer
Files: src/lib/contributors.ts, src/lib/__tests__/contributors.test.ts, src/lib/types.ts
Issue: none

## What

Build the contributor profiles module — the next Phase 2 roadmap item: "Contributor profiles (JSON): trust score, edit count, revert rate."

A contributor profile aggregates stats about a single author from two data sources:
1. **Revision history** — how many edits, across how many pages
2. **Talk page activity** — how many comments, how many threads created

## Data model

Add to `src/lib/types.ts`:

```ts
export interface ContributorProfile {
  /** Author handle (matches revision `author` and talk comment `author`) */
  handle: string;
  /** Total number of revisions authored */
  editCount: number;
  /** Number of distinct wiki pages edited */
  pagesEdited: number;
  /** Number of talk page comments authored */
  commentCount: number;
  /** Number of talk threads created */
  threadsCreated: number;
  /** ISO date of the author's first known activity */
  firstSeen: string;
  /** ISO date of the author's most recent activity */
  lastSeen: string;
  /** Trust score 0–1. For now: a simple heuristic based on activity volume.
   *  Formula: min(1, (editCount + commentCount) / 50)
   *  This is a placeholder — the roadmap says trust should eventually
   *  incorporate revert rate, contradiction rates, and external citation. */
  trustScore: number;
}
```

## Implementation — `src/lib/contributors.ts`

Two core functions:

### `buildContributorProfile(handle: string): Promise<ContributorProfile>`
- List all wiki pages via `listWikiPages()`
- For each page, call `listRevisions(slug)` and filter for revisions where `author === handle`
- Count total edits, distinct pages
- List all discuss JSON files, parse them, count comments and threads by this author
- Compute `firstSeen`, `lastSeen`, `trustScore`

### `listContributors(): Promise<ContributorProfile[]>`
- Scan all revisions and discuss files to discover all unique author handles
- Build a profile for each
- Return sorted by `editCount` descending

Performance note: This is an O(pages × revisions) scan. That's fine for now — wikis will be small. Caching can come later.

## Tests — `src/lib/__tests__/contributors.test.ts`

Use tmp directories (like the existing `talk.test.ts` and `revisions.test.ts` patterns).

Test cases:
1. `listContributors()` returns empty array when no revisions exist
2. `buildContributorProfile()` counts edits correctly across multiple pages
3. `buildContributorProfile()` counts talk comments and threads
4. Trust score caps at 1.0 for prolific contributors
5. `firstSeen` and `lastSeen` reflect actual date range
6. Unknown handle returns a zeroed-out profile (not an error)
7. `listContributors()` aggregates multiple authors correctly

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```
