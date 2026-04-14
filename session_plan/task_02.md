Title: Bug fixes — fixContradiction LLM guard, settings non-null assertion, lint fix race
Files: src/lib/lint-fix.ts, src/app/settings/page.tsx, src/app/lint/page.tsx, src/lib/__tests__/lint-fix.test.ts
Issue: none

## Problem

Three confirmed bugs from code review:

### Bug 1: `fixContradiction` missing `hasLLMKey()` guard (lint-fix.ts)

`fixContradiction` (line ~227) calls `callLLM()` directly without checking `hasLLMKey()` first. If no LLM provider is configured, it throws an opaque error. Compare to `fixMissingConceptPage` (line ~319) which properly checks `hasLLMKey()` and falls back to generating a static stub page. `fixContradiction` should similarly check and throw a clear `FixValidationError("Cannot fix contradictions without an LLM provider configured")` since contradiction resolution inherently requires LLM reasoning (no meaningful static fallback).

### Bug 2: `data.provider!` non-null assertion (settings/page.tsx)

Line 207: `providerLabel(data.provider!)` uses a non-null assertion. While `data.configured` is checked first, `provider` could theoretically be undefined if the API response shape changes. Use optional chaining with a fallback: `providerLabel(data.provider ?? "anthropic")` or handle the undefined case explicitly.

### Bug 3: Lint fix race condition — shared `fixMessage` state (lint/page.tsx)

`fixMessage` is a single string state shared across all fix operations. When a user clicks "Fix" on multiple issues rapidly, each fix's success/failure message overwrites the previous one. The user can't see which fix succeeded or failed. 

Fix: Change `fixMessage` from a single `string | null` to a `Map<string, string>` keyed by the same `key` used for `fixingSet`. Each fix gets its own message. Display messages per-issue (inline next to each fix button) or as a temporary toast per issue. Keep it simple — show the message next to the issue's fix button, auto-dismiss after a few seconds with `setTimeout`.

## Implementation

### lint-fix.ts
Add `hasLLMKey()` check at the top of `fixContradiction`, before reading pages:
```
if (!hasLLMKey()) {
  throw new FixValidationError("Cannot fix contradictions without an LLM provider configured");
}
```

### settings/page.tsx  
Replace `data.provider!` with `data.provider ?? "anthropic"`.

### lint/page.tsx
- Change `fixMessage` state to `fixMessages: Map<string, string>` 
- In `handleFix`, set the per-key message instead of the global one
- Show each message inline next to its fix button
- Add auto-clear with `setTimeout(() => setFixMessages(prev => { const next = new Map(prev); next.delete(key); return next; }), 5000)`

### lint-fix.test.ts
Add a test case for `fixContradiction` when `hasLLMKey()` returns false — should throw `FixValidationError`.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```
