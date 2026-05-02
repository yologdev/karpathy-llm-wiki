Title: Nested thread UI in DiscussionPanel — reply button + indented rendering
Files: src/components/DiscussionPanel.tsx, src/lib/__tests__/talk.test.ts
Issue: none

## Why

The `TalkComment` data model has `parentId` for nesting and the `addComment` API accepts a `parentId` parameter, but the `DiscussionPanel` renders all comments flat. There's no "reply to this comment" button and no visual nesting. This is the #2 gap in the Phase 2 close-out list.

## What to do

1. **`src/components/DiscussionPanel.tsx`** — Refactor the comment rendering section (inside the expanded thread view) to support nesting:

   a. **Tree builder**: Add a helper function `buildCommentTree(comments: TalkComment[])` that takes flat comments and returns a tree structure. Group comments by parentId. Top-level comments have `parentId === null`. Each node has `comment` and `children[]`.

   b. **Recursive renderer**: Add a `CommentNode` component that renders a single comment with:
      - Left border indent (e.g., `ml-4 pl-3 border-l-2 border-foreground/10` for nested, `ml-0` for top-level)
      - A "Reply" button on each comment
      - Max nesting depth of 3 levels visually (deeper replies flatten to depth-3 indent)

   c. **Reply form**: When "Reply" is clicked, show an inline reply form (author + body fields) that submits to the existing `POST /api/wiki/{slug}/discuss/{threadIndex}/comments` endpoint with `parentId` set to the comment's ID.

   d. **Existing comment form**: Keep the existing top-level comment form at the bottom of the thread, but clarify it as "Add a comment" (top-level).

2. **`src/lib/__tests__/talk.test.ts`** — Add a test for `addComment` with `parentId`:
   - Create a thread, add a reply with parentId pointing to the first comment's ID
   - Verify the comment is stored with the correct parentId

## Visual structure

```
Thread: "Accuracy of claim X"  [open]
├── alice: I think this claim is wrong...        [Reply]
│   └── bob: Actually the source says...         [Reply]
│       └── alice: Good point, updating.         [Reply]
├── charlie: Related issue with section 2...     [Reply]
[Add a comment]  [author] [body] [Submit]
```

## Verify

```sh
pnpm build && pnpm lint && pnpm test
```
