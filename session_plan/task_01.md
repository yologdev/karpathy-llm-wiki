Title: Build DiscussionPanel client component
Files: src/components/DiscussionPanel.tsx (create)
Issue: none

Build a `DiscussionPanel` React client component that provides the full talk page
UI for a wiki page. This is the main Phase 2 deliverable — connecting the existing
data layer + API routes to a user-facing interface.

## What it does

The component receives a `slug` prop and manages all discussion state internally
(like `RevisionHistory` does for revisions — fetch on demand, client-side state).

### Features to implement:

1. **Thread list** — Fetch threads from `GET /api/wiki/[slug]/discuss` on mount
   or when the panel opens. Display each thread's title, status badge
   (open/resolved/wontfix), comment count, and last-updated date.

2. **Create new thread** — A form at the top with title, author, and body fields.
   POSTs to `POST /api/wiki/[slug]/discuss`. On success, refresh the thread list.

3. **Expand thread** — Clicking a thread title fetches its detail from
   `GET /api/wiki/[slug]/discuss/[threadIndex]` and shows all comments. Each
   comment displays author, date, and markdown body (plain text is fine for now —
   no need to render markdown).

4. **Add comment** — Inside an expanded thread, a form with author + body fields.
   POSTs to `POST /api/wiki/[slug]/discuss/[threadIndex]/comments`. On success,
   refresh the thread.

5. **Resolve/wontfix thread** — For open threads, show "Resolve" and "Won't Fix"
   buttons. PATCHes to `PATCH /api/wiki/[slug]/discuss/[threadIndex]` with
   `{ status: "resolved" | "wontfix" }`. On success, refresh.

### Design guidelines:

- Use the same Tailwind patterns as RevisionHistory and other existing components
  (foreground/10 borders, text-sm sizing, dark mode support).
- Collapsible by default — show a "Discussion (N)" header that expands on click.
- Status badges: "open" = blue, "resolved" = green, "wontfix" = gray.
- Keep it under ~250 lines. If it grows too large, that's a signal to split.
- Mark it as `"use client"` since it manages state and makes fetch calls.

### API routes (already exist):

- `GET /api/wiki/[slug]/discuss` → `{ threads: TalkThread[] }`
- `POST /api/wiki/[slug]/discuss` → `{ thread: TalkThread }` (201)
- `GET /api/wiki/[slug]/discuss/[threadIndex]` → `{ thread: TalkThread }`
- `PATCH /api/wiki/[slug]/discuss/[threadIndex]` → `{ thread: TalkThread }`
- `POST /api/wiki/[slug]/discuss/[threadIndex]/comments` → `{ comment: TalkComment }`

### Types (from src/lib/types.ts):

```ts
interface TalkComment {
  id: string;
  author: string;
  created: string;
  body: string;
  parentId: string | null;
}

interface TalkThread {
  pageSlug: string;
  title: string;
  status: "open" | "resolved" | "wontfix";
  created: string;
  updated: string;
  comments: TalkComment[];
}
```

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The component should compile and be importable even before it's wired into a page.
