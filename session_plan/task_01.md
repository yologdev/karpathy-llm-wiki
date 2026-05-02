Title: Decompose DiscussionPanel into focused sub-components
Files: src/components/DiscussionPanel.tsx, src/components/ThreadView.tsx, src/components/CommentNode.tsx, src/components/ThreadForm.tsx
Issue: none

## Context

DiscussionPanel.tsx is 524 lines — the largest React component in the project,
and the newest (built in the last 3 sessions). It handles four distinct concerns
in one file:

1. **Thread list** — fetching, rendering, expanding/collapsing threads
2. **Comment tree** — recursive CommentNode rendering with depth-limited indentation
3. **Thread creation form** — new thread title + body + author
4. **Comment/reply forms** — adding top-level comments and nested replies

The project already has a decomposition pattern: BatchIngestForm was split into
BatchItemRow + BatchProgressBar, RevisionHistory was split into RevisionItem.
Apply the same pattern here.

## What to extract

### 1. `src/components/CommentNode.tsx` (already defined inline — just extract)
- Move the `CommentNode` function component (lines 74–141) and its interface
  `CommentNodeProps` (lines 63–72) to their own file
- Move `CommentTreeNode` interface (lines 29–32) and `buildCommentTree` helper
  (lines 35–55) into this file too (they're only used by the comment rendering)
- Move `MAX_VISUAL_DEPTH` constant
- Export `CommentNode`, `buildCommentTree`, and `CommentTreeNode`

### 2. `src/components/ThreadForm.tsx`
- Extract the "New thread" form (the form that creates threads, roughly lines 
  350–400 area of DiscussionPanel)
- Props: `{ onSubmit: (title: string, author: string, body: string) => Promise<void>; creating: boolean; inputClasses: string }`
- This is the self-contained form with title, author, body fields and submit button

### 3. `src/components/ThreadView.tsx`
- Extract the expanded thread view — the section that shows when a thread is
  clicked: thread header, comment tree, resolve/won't-fix buttons, add-comment form
- Props receive the thread data, event handlers for resolve/comment/reply
- This is the biggest extraction and should reduce DiscussionPanel to orchestration

### 4. Keep `DiscussionPanel.tsx` as the orchestrator
- State management (threads, loading, expanded thread, etc.)
- API calls (fetch threads, create thread, add comment, resolve)
- Renders the thread list, delegates to ThreadView for expanded thread, ThreadForm for new thread

### 5. Move `StatusBadge` inline helper (lines 17–23) — keep in DiscussionPanel since it's tiny

## Verification

- `pnpm build && pnpm lint && pnpm test` must pass
- The DiscussionPanel should drop from ~524 lines to ~250–300 lines
- No behavioral changes — this is a pure refactor
- Verify the wiki page view still renders discussions correctly by checking the
  import chain: `wiki/[slug]/page.tsx` → `DiscussionPanel` → sub-components
