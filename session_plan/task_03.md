Title: Decompose ingest page into sub-components
Files: src/app/ingest/page.tsx, src/components/IngestSuccess.tsx, src/components/IngestPreview.tsx
Issue: none

## Problem

`src/app/ingest/page.tsx` is 517 lines with three stages (form, preview, success) plus all the handler logic in a single component. The preview and success stages are self-contained render blocks that receive data via local state — they're natural extraction targets.

## Implementation

### Step 1: Extract `IngestSuccess` component

Create `src/components/IngestSuccess.tsx`:
- Props: `slug: string`, `relatedUpdated: string[]`, `onReset: () => void`
- Move the success stage JSX (around lines 224-274) into this component
- It renders the "✓ Ingested as wiki page" card with links and the "Ingest another" button

### Step 2: Extract `IngestPreview` component  

Create `src/components/IngestPreview.tsx`:
- Props: `preview: PreviewData`, `loading: boolean`, `showRawMarkdown: boolean`, `onToggleMarkdown: () => void`, `onApprove: () => void`, `onCancel: () => void`, `error: string | null`
- Move the preview stage JSX (around lines 279-370) into this component
- It renders the page preview with approve/reject buttons and the raw markdown toggle
- Import and use `MarkdownRenderer` from existing component

### Step 3: Update `IngestPage`

- Import the two new components
- Replace the inline stage renders with component calls
- Move the `PreviewData` and `IngestResponse` interfaces to be shared (export from the page or put in a shared types spot — simplest is to define them in the component files that need them)
- The main page keeps: state management, all handlers (`handlePreview`, `handleApprove`, `handleDirectIngest`, `reset`, `cancelPreview`, `switchMode`), and the form stage JSX
- The page should shrink by ~150-200 lines

### Shared types
Move `IngestResponse` and `PreviewData` interfaces to be exported from ingest/page.tsx or define them in a shared location. Simplest: export them from the page file and import in the components, or duplicate the minimal interface each component needs in its own file (less coupling).

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

No unit tests for the ingest page exist, but build verification ensures types are correct and the component tree is valid. Visually, behavior should be identical — same HTML output, same handlers, same state transitions.
