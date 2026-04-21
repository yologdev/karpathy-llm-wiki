Title: Contextual error messages in error boundaries
Files: src/components/ErrorBoundary.tsx, src/lib/error-hints.ts, src/lib/__tests__/error-hints.test.ts
Issue: none

## Problem

All error boundaries use a generic `PageError` component that shows the raw `error.message`. When an LLM call fails due to a missing API key, the user sees something like "anthropic API key is required" — but no guidance on how to fix it. When a rate limit hits, they see "429 Too Many Requests" with no suggestion to wait. The error message is shown but not interpreted.

## What to build

### src/lib/error-hints.ts (new file)

A pure function `getErrorHint(message: string): ErrorHint | null` that pattern-matches common error messages and returns actionable guidance:

```typescript
interface ErrorHint {
  category: "auth" | "rate-limit" | "network" | "config" | "filesystem";
  suggestion: string;  // Human-readable suggestion
  action?: {
    label: string;     // Button label
    href: string;      // Where to go
  };
}
```

Pattern matching (all case-insensitive on `error.message`):

| Pattern | Category | Suggestion | Action |
|---------|----------|------------|--------|
| "api key" / "apikey" / "unauthorized" / "authentication" / "401" | auth | "Check your API key in Settings or .env.local" | Go to Settings → /settings |
| "429" / "rate limit" / "too many requests" / "quota" | rate-limit | "You've hit the provider's rate limit. Wait a moment and try again." | (none) |
| "econnrefused" / "enotfound" / "fetch failed" / "network" / "timeout" / "econnreset" | network | "Could not reach the LLM provider. Check your internet connection." | (none) |
| "ollama" + ("econnrefused" / "fetch failed") | network | "Could not connect to Ollama. Make sure `ollama serve` is running." | (none) |
| "no provider configured" / "provider is required" | config | "No LLM provider configured. Set up your provider in Settings." | Go to Settings → /settings |
| "enoent" / "no such file" / "permission denied" / "eacces" | filesystem | "A file operation failed. Check that the wiki/ directory exists and is writable." | (none) |

If no pattern matches, return `null` (the error boundary falls back to showing just the raw message).

### src/components/ErrorBoundary.tsx (modify)

Import `getErrorHint` and enhance the `PageError` component:

1. Call `getErrorHint(error.message)` 
2. If a hint is returned, render it below the raw error message:
   - A colored hint box (yellow/amber background) with the suggestion text
   - If `action` is present, render a link/button to the action href
3. If no hint, show only the raw error message (current behavior)

The hint should be visually distinct from the raw error — the raw message is a red box, the hint should be an amber/yellow "tip" box below it.

### src/lib/__tests__/error-hints.test.ts (new file)

Test the `getErrorHint` function:
- "Invalid API key" → auth category with Settings link
- "401 Unauthorized" → auth category
- "429 Too Many Requests" → rate-limit category
- "Rate limit exceeded" → rate-limit category
- "fetch failed" → network category
- "ECONNREFUSED" → network category
- "Ollama fetch failed" → network with Ollama-specific message
- "No provider configured" → config category with Settings link
- "ENOENT: no such file" → filesystem category
- "Some random error" → null (no hint)
- Case insensitivity: "API KEY INVALID" → auth category

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```

## Constraints

- `getErrorHint` is a pure function — no side effects, no imports beyond types
- Pattern matching must be case-insensitive
- The Ollama-specific hint must take priority over the generic network hint (check Ollama patterns first)
- Do not modify any error.tsx files — they already pass through to PageError
- Max 3 files touched
