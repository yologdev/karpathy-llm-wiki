Title: Lint source suggestions — recommend search queries for data gaps
Files: src/lib/lint-checks.ts, src/lib/types.ts, src/lib/lint-fix.ts, src/lib/__tests__/lint-checks.test.ts
Issue: none

## Description

The founding vision (llm-wiki.md) says lint should detect "data gaps that could be filled with a web search" and "suggest new questions to investigate and new sources to look for." Currently, lint detects missing concept pages and contradictions but doesn't suggest *where* to find information to fix them.

Add a `suggestion` field to `LintIssue` that provides actionable recommendations — search queries a user could paste into a search engine, or topic hints they could ingest. This turns lint from a problem-reporter into a growth advisor.

### Implementation

1. **Extend `LintIssue` in `src/lib/types.ts`:**
   Add an optional `suggestion?: string` field to the `LintIssue` interface. This field provides an actionable hint about how to resolve the issue (e.g., "Try searching for: 'transformer architecture attention mechanism'" or "Consider ingesting a source about X").

2. **Add suggestions to lint checks in `src/lib/lint-checks.ts`:**
   - `checkMissingConceptPages`: For each missing concept, add a `suggestion` like `Search for: "${concept}" overview` or `Consider ingesting a Wikipedia or textbook source about "${concept}"`.
   - `checkContradictions`: For each contradiction, suggest `Search for: "${topic}" latest research` to find authoritative sources that resolve the conflict.
   - `checkOrphanPages`: Suggest linking the page from related topics (already partially done via fix, but the hint should be human-readable).
   - `checkEmptyPages`: Suggest `Try ingesting a source about "${title}" to populate this page`.
   - `checkBrokenLinks`: Suggest creating the target page or removing the dead link.

3. **Update `LintIssueCard` display (NOT in scope — just the data layer):**
   The UI component `LintIssueCard.tsx` should NOT be modified in this task. The suggestion will be displayed in a follow-up.

4. **Update tests in `src/lib/__tests__/lint-checks.test.ts`:**
   Add assertions that the `suggestion` field is populated on relevant issue types.

### Verification
```
pnpm build && pnpm lint && pnpm test
```

### Constraints
- Do NOT add actual web search functionality (that's a future task)
- Suggestions are static strings derived from the issue context — no LLM calls to generate them
- Keep suggestions concise (1-2 sentences)
