Title: Phase 2 foundation — talk page data layer

Files: src/lib/talk.ts, src/lib/types.ts, src/lib/__tests__/talk.test.ts

Issue: none

## Context

YOYO.md Phase 2 says:
- Create `discuss/<slug>.md` directory for talk pages
- Talk page schema: linked to parent page, threaded, resolution status
- Attribution on revisions — who changed what and why

This task builds the data layer only — no API routes, no UI. The talk page system stores
threaded discussion about wiki pages, where humans and agents can raise questions, flag
contradictions, and resolve disputes.

## What to build

### 1. Talk page types in `src/lib/types.ts`

```typescript
/** A single comment in a talk page thread. */
export interface TalkComment {
  /** Unique ID (timestamp-based, e.g. "1714600000000") */
  id: string;
  /** Who wrote this comment (user handle or agent ID) */
  author: string;
  /** ISO date string */
  created: string;
  /** Markdown content */
  body: string;
  /** ID of parent comment for threading, or null for top-level */
  parentId: string | null;
}

/** A talk page thread linked to a wiki page. */
export interface TalkThread {
  /** Slug of the wiki page this discussion is about */
  pageSlug: string;
  /** Thread title / topic */
  title: string;
  /** "open" | "resolved" | "wontfix" */
  status: "open" | "resolved" | "wontfix";
  /** ISO date of creation */
  created: string;
  /** ISO date of last activity */
  updated: string;
  /** Ordered list of comments */
  comments: TalkComment[];
}
```

### 2. Talk page module: `src/lib/talk.ts`

Storage: each wiki page's discussions live in `discuss/<slug>.json` — a JSON file containing
an array of `TalkThread` objects. JSON rather than markdown because talk pages are structured
data (threading, status, IDs) that would be painful to round-trip through frontmatter.

Functions to implement:

- `getDiscussDir(): string` — returns the discuss directory path (using `getDataDir()` pattern)
- `ensureDiscussDir(): Promise<void>` — creates `discuss/` if it doesn't exist
- `listThreads(pageSlug: string): Promise<TalkThread[]>` — reads all threads for a page
- `getThread(pageSlug: string, threadIndex: number): Promise<TalkThread | null>` — get one thread
- `createThread(pageSlug: string, title: string, author: string, body: string): Promise<TalkThread>` — creates a new thread with the first comment
- `addComment(pageSlug: string, threadIndex: number, author: string, body: string, parentId?: string): Promise<TalkComment>` — adds a comment to a thread
- `resolveThread(pageSlug: string, threadIndex: number, status: "resolved" | "wontfix"): Promise<TalkThread>` — changes thread status
- `deleteDiscussions(pageSlug: string): Promise<void>` — removes all discussions for a page (called when a wiki page is deleted)

Internal helpers:
- `readDiscussFile(pageSlug: string): Promise<TalkThread[]>` — reads + parses the JSON
- `writeDiscussFile(pageSlug: string, threads: TalkThread[]): Promise<void>` — serializes + writes

Use `withFileLock` from `lock.ts` for concurrent access safety (same pattern as wiki writes).

### 3. Tests: `src/lib/__tests__/talk.test.ts`

- Create a thread → verify it has one comment, status "open", correct pageSlug
- Add a comment → verify thread has 2 comments, updated timestamp changes
- Add a threaded reply (with parentId) → verify parentId is set correctly
- Resolve a thread → verify status changes to "resolved"
- List threads for a page with no discussions → returns empty array
- List threads for a page with multiple threads → returns all
- Delete discussions → file is removed
- Concurrent writes don't corrupt data (use withFileLock)

Use tmp directories for all tests (same pattern as wiki.test.ts, revisions.test.ts).

### 4. Wire deletion into lifecycle

In `src/lib/lifecycle.ts`, when `deleteWikiPage()` is called, also call
`deleteDiscussions(slug)` so talk pages don't become orphans. Add the import but
keep it lightweight — just the one function call.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All existing tests must continue to pass. New talk.test.ts must pass.
