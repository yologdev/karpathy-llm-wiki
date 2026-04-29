Title: Extract useLint hook from lint page
Files: src/hooks/useLint.ts, src/app/lint/page.tsx
Issue: none

## Description

The lint page (`src/app/lint/page.tsx`, 320 lines) manages 8 state variables, filter controls, a lint runner, and a complex fix handler with timeout tracking. Extract the state management into a `useLint` hook at `src/hooks/useLint.ts`.

### What to extract

The hook should own:
- All state: `result`, `loading`, `error`, `fixingSet`, `fixMessages`, `enabledChecks`, `severityFilter`
- The `timeoutsRef` and `scheduleTimeout` helper
- The cleanup effect (clearing timeouts on unmount)
- All handlers: `toggleCheck`, `selectAllChecks`, `clearAllChecks`, `runLint`, `handleFix`
- The `fixKey` helper function (can be exported separately for testing)

### Hook return interface

```typescript
export interface UseLintReturn {
  // State
  result: LintResponse | null;
  loading: boolean;
  error: string | null;
  fixingSet: Set<string>;
  fixMessages: Map<string, string>;
  enabledChecks: Set<LintIssue["type"]>;
  severityFilter: SeverityFilter;
  // Actions
  toggleCheck: (type: LintIssue["type"]) => void;
  selectAllChecks: () => void;
  clearAllChecks: () => void;
  runLint: () => void;
  handleFix: (issue: LintIssue, targetSlug?: string) => void;
  setSeverityFilter: (f: SeverityFilter) => void;
  // Helpers
  fixKey: (issue: LintIssue) => string;
}
```

### How the page changes

After extraction, `lint/page.tsx` should:
- Import and call `useLint()`
- Destructure the return value
- Be purely rendering logic — no `useState`, no `useCallback`, no `useRef`, no `useEffect`, no `fetch`
- Drop from ~320 lines to ~120-140 lines (just JSX + the hook call)

### Key detail: fixKey export

Export `fixKey` as a named export from the hook file so it can be unit-tested independently. It contains issue-type-specific logic for computing fix tracking keys.

### Verification

```bash
pnpm build && pnpm lint && pnpm test
```

The page must render identically — this is a pure refactor, no behavior change.
