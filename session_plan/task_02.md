Title: Decompose BatchIngestForm into sub-components
Files: src/components/BatchIngestForm.tsx, src/components/BatchItemRow.tsx, src/components/BatchProgressBar.tsx
Issue: none

## Description

`BatchIngestForm.tsx` is 317 lines — the largest remaining monolithic component. Decompose it
into focused sub-components following the same pattern used for WikiIndexClient (→ WikiIndexToolbar
+ WikiPageCard) and DataviewPanel (→ DataviewFilterRow + DataviewResultsTable).

### Extract the following components

**src/components/BatchItemRow.tsx** (~50 lines)
Extract the per-URL list item rendering. Currently lines 263-293 of BatchIngestForm.tsx.

Props:
```ts
interface BatchItemRowProps {
  item: BatchItem;  // { url, status, slug?, error? }
}
```

Renders: status icon + URL + success link / error message. Move the `statusIcon` helper
function into this file since it's only used for rendering items.

Export the `BatchItem` interface from this file so both components can share it.

**src/components/BatchProgressBar.tsx** (~40 lines)
Extract the progress summary + progress bar. Currently lines 239-259.

Props:
```ts
interface BatchProgressBarProps {
  total: number;
  completed: number;   // successCount + errorCount
  successCount: number;
  running: boolean;
}
```

Renders: the text summary ("Processing... X of Y complete" / "X of Y URLs ingested") +
the visual progress bar div.

**src/components/BatchIngestForm.tsx** — Update to import and use the extracted components.
After extraction, BatchIngestForm should drop to ~200 lines: just the form state management,
URL parsing/validation, streaming fetch logic, and layout composition.

### Key rules
- Do NOT change any behavior or visual output. Pure refactor.
- The `BatchItem` type/interface should be defined in `BatchItemRow.tsx` and imported by
  `BatchIngestForm.tsx`.
- Keep all state management in `BatchIngestForm` — the new components are pure presentational.

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 1168+ tests must still pass. Manual visual inspection not needed (pure refactor,
no behavior change).
