Title: Decompose DataviewPanel into sub-components
Files: src/components/DataviewFilterRow.tsx, src/components/DataviewResultsTable.tsx, src/components/DataviewPanel.tsx
Issue: none

## Description

`DataviewPanel.tsx` is 330 lines containing three distinct sections:

1. **Type definitions & constants** (lines 1-58) — `DataviewOp`, `FilterRow`, `DataviewResultRow`, `OP_LABELS`, `ALL_OPS`, `makeFilter()`
2. **Query builder UI** (lines ~150-260) — filter rows with field/op/value inputs, sort controls, limit input, run button
3. **Results table** (lines ~260-330) — dynamic columns from frontmatter keys, linked slug cells, array formatting

This task extracts the filter row and results table into dedicated sub-components.

### What to build

1. **`src/components/DataviewFilterRow.tsx`** (~60-70 lines) — A single filter row component:
   - Props: `{ filter: FilterRow, onUpdate: (id, patch) => void, onRemove: (id) => void }`
   - Renders: field input, operator `<select>`, value input (hidden for "exists" op), remove button
   - Exports the shared types and constants that both components need: `DataviewOp`, `FilterRow`, `OP_LABELS`, `ALL_OPS`, `makeFilter()`
   - This file becomes the single source for these types (DataviewPanel and DataviewResultsTable both import from here)

2. **`src/components/DataviewResultsTable.tsx`** (~70-80 lines) — The results display:
   - Props: `{ results: DataviewResultRow[], total: number }`
   - Computes `fmKeys` from the results (the dynamic column headers)
   - Renders the total count, "no results" message, or the full `<table>` with dynamic frontmatter columns
   - Each slug cell renders a `<Link>` to `/wiki/{slug}`
   - Array values are joined with `, `

3. **Update `src/components/DataviewPanel.tsx`** — Reduce to ~150-170 lines:
   - Import `DataviewFilterRow` and types from `DataviewFilterRow.tsx`
   - Import `DataviewResultsTable`
   - Keep state management (`filters`, `sortField`, `sortOrder`, `limit`, `loading`, `error`, `results`, `total`)
   - Keep `addFilter`, `removeFilter`, `updateFilter`, `runQuery` callbacks
   - Keep sort controls, limit input, run button, and error display inline (these are small)
   - Delegate filter rows to `<DataviewFilterRow>` and results to `<DataviewResultsTable>`
   - Remove the `fmKeys` computation (now in DataviewResultsTable)

### Key constraints

- **Types shared across files** — `DataviewOp`, `FilterRow`, `DataviewResultRow`, `OP_LABELS`, `ALL_OPS`, `makeFilter()` are exported from `DataviewFilterRow.tsx` (or a shared types file, but co-locating with the filter row is simpler since it's the primary consumer)
- **No behavior changes** — identical query building, execution, and display
- **Styling preserved exactly** — same Tailwind classes

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Build must pass. All existing tests green. DataviewPanel.tsx should drop from 330 → ~150-170 lines.
