Title: Decompose RevisionHistory into sub-components
Files: src/components/RevisionHistory.tsx, src/components/RevisionItem.tsx
Issue: none

## Description

`RevisionHistory.tsx` is 231 lines — the second remaining monolithic component flagged as tech
debt. Decompose it by extracting the per-revision row into a `RevisionItem` component.

### Extract the following component

**src/components/RevisionItem.tsx** (~80 lines)
Extract the per-revision list item rendering + inline content viewer. Currently this is the
`<li key={rev.timestamp}>` block at lines 178-223 of RevisionHistory.tsx.

Props:
```ts
interface RevisionItemProps {
  revision: Revision;         // { timestamp, date, slug, sizeBytes }
  isViewing: boolean;         // whether this revision's content is shown
  viewContent: string | null; // the content to display (null if not loaded)
  viewLoading: boolean;       // loading state for this specific revision
  reverting: boolean;         // global reverting state
  onView: (timestamp: number) => void;
  onRevert: (timestamp: number) => void;
}
```

Move `formatBytes` helper into this file (it's only used for rendering revision items).

Renders:
- Relative time + size + absolute date
- View/Hide button
- Revert button
- Inline content viewer (pre block when viewContent is shown)

**src/components/RevisionHistory.tsx** — Update to import and use `RevisionItem`.
After extraction, RevisionHistory should handle: open/close toggle, fetching revision list,
fetching individual revision content, revert logic, and composing the list with `RevisionItem`.
Should drop to ~150 lines.

### Key rules
- Do NOT change any behavior or visual output. Pure refactor.
- The `Revision` interface should be defined in `RevisionItem.tsx` and imported by
  `RevisionHistory.tsx`.
- All fetch/mutation state stays in `RevisionHistory` — `RevisionItem` is presentational +
  callbacks.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 1168+ tests must still pass.
