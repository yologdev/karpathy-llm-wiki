Title: Extract useStreamingQuery hook from query page
Files: src/hooks/useStreamingQuery.ts, src/app/query/page.tsx, src/components/QueryResultPanel.tsx
Issue: none

## Description

The query page is 508 lines — the largest page component. The streaming query logic (submit, stream reading, fallback to non-streaming, abort handling, error states) is ~130 lines of interleaved state + callbacks that could be a clean custom hook. The result display (rendered answer, sources list, save-to-wiki form, copy button) is another ~120 lines of JSX that could be a component.

### Changes

**1. Create `src/hooks/useStreamingQuery.ts`:**

Extract the following from `query/page.tsx` into a custom hook:

```ts
interface UseStreamingQueryReturn {
  question: string;
  setQuestion: (q: string) => void;
  format: "prose" | "table";
  setFormat: (f: "prose" | "table") => void;
  result: { answer: string; sources: string[] } | null;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  submit: (e: React.FormEvent) => void;
  isProcessing: boolean;
}
```

Move into the hook:
- `useState` for question, format, result, loading, streaming, error
- `useRef` for abortControllerRef
- `handleSubmit` callback (stream endpoint → fallback → error handling → abort support)
- The streaming read loop (TextDecoder, reader.read() while loop)
- Citation extraction via `extractCitedSlugs`

The hook calls a provided `onComplete(question, answer, sources)` callback when a query finishes (for history saving).

**2. Create `src/components/QueryResultPanel.tsx`:**

Extract the result display section from the query page return JSX:
- The rendered markdown answer with streaming cursor
- Sources list with links
- Copy-as-markdown button
- Save-to-wiki form (editing → saving → saved → error states)

Props:
```ts
interface QueryResultPanelProps {
  result: { answer: string; sources: string[] };
  streaming: boolean;
  question: string;
  currentHistoryId: string | null;
  onHistorySaved?: (id: string, slug: string) => void;
}
```

**3. Simplify `src/app/query/page.tsx`:**

After extraction, the page becomes a thin orchestrator:
- Uses `useStreamingQuery` hook for query logic
- Manages history state (fetch on mount, save on complete)
- Renders form, `QueryResultPanel`, and `QueryHistorySidebar`
- Target: ~200 lines (down from 508)

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The query page has no unit tests (it's a client component), so verification is build + lint passing. Manual verification: the query page should work identically — submit, stream, fallback, save, copy, history.
