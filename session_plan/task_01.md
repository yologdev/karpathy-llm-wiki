Title: Extract useIngest hook from ingest page
Files: src/hooks/useIngest.ts, src/app/ingest/page.tsx
Issue: none

## Description

The ingest page (`src/app/ingest/page.tsx`, 363 lines) manages 9 `useState` calls, 3 modes × 3 stages, and 5 handler functions — a complex state machine that mixes business logic with rendering. Extract the state management into a `useIngest` hook at `src/hooks/useIngest.ts`.

### What to extract

The hook should own:
- All state: `mode`, `stage`, `title`, `content`, `url`, `loading`, `error`, `result`, `preview`, `showRawMarkdown`
- Types: `Mode`, `Stage`, `IngestResponse`
- All handlers: `switchMode`, `handlePreview`, `handleApprove`, `handleDirectIngest`, `reset`, `cancelPreview`
- Toggle: `toggleRawMarkdown` (wraps the `setShowRawMarkdown(v => !v)`)

### Hook return interface

```typescript
export interface UseIngestReturn {
  // State
  mode: Mode;
  stage: Stage;
  title: string;
  content: string;
  url: string;
  loading: boolean;
  error: string | null;
  result: IngestResponse | null;
  preview: PreviewData | null;
  showRawMarkdown: boolean;
  // Actions
  switchMode: (m: Mode) => void;
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setUrl: (v: string) => void;
  handlePreview: (e: React.FormEvent) => void;
  handleApprove: () => void;
  handleDirectIngest: (e: React.FormEvent) => void;
  reset: () => void;
  cancelPreview: () => void;
  toggleRawMarkdown: () => void;
}
```

### How the page changes

After extraction, `ingest/page.tsx` should:
- Import and call `useIngest()`
- Destructure the return value
- Be purely rendering logic — no `useState`, no `fetch`, no async handlers
- Drop from ~363 lines to ~180-200 lines (just JSX + the hook call)

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

The page must render identically — this is a pure refactor, no behavior change.
