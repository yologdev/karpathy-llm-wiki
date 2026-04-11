Title: Fix SCHEMA.md drift — document contradiction auto-fix
Files: SCHEMA.md
Issue: none

## Description

SCHEMA.md line 138 says "No auto-fix yet" for the `contradiction` lint check. This is stale — `fixContradiction()` was implemented in `src/lib/lint-fix.ts` and shipped in the 12:40 session today. The learnings file explicitly warns about doc-code drift.

## Changes

1. In SCHEMA.md, update the `contradiction` bullet under `## Lint checks` (line ~136-138):
   - Change from: `No auto-fix yet.`
   - Change to: `Auto-fix: call the LLM to rewrite the first page, resolving the conflicting claims while preserving content and structure.`

2. In SCHEMA.md, update the `## Known gaps` section (line ~172-174):
   - Remove the bullet about "Contradiction auto-fix (which would require LLM rewriting) is not yet supported." or update it to reflect reality.
   - Replace with a note that all five lint checks now support auto-fix.

3. While touching SCHEMA.md, scan for any other stale claims. In particular, verify the "Lint auto-fix handles..." bullet in Known gaps matches reality (it should list all five checks now).

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

No code changes — only docs. Build/lint/test should remain green.
