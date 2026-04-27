Title: Display lint suggestions in UI + status report refresh
Files: src/components/LintIssueCard.tsx, .yoyo/status.md
Issue: none

## Description

Two small items bundled:

### Part A: Show lint suggestions in LintIssueCard

Task 02 adds a `suggestion` field to `LintIssue`. This task surfaces it in the UI.

In `src/components/LintIssueCard.tsx`, add a section below the existing issue details that renders `issue.suggestion` when present. Style it as a helpful hint — use a light blue/teal info style (like a tip callout), distinct from the warning/error styling of the issue itself. Something like:

```
💡 Suggestion: Search for "transformer architecture" to find sources you could ingest.
```

- Only render the suggestion block when `issue.suggestion` is defined and non-empty
- Use Tailwind classes consistent with the existing card styling
- Add `aria-label="Suggestion"` for accessibility
- Light/dark mode compatible (check existing `dark:` classes in the component)

### Part B: Refresh status report

Update `.yoyo/status.md` to reflect current metrics:
- Test count: 1163 → updated count after tasks 01-02 (run `pnpm test` and count)
- Test files: 34
- Sessions: ~52
- Date: 2026-04-27
- Line counts: update from actual `wc -l` output
- Components: 30 (up from 26)
- Hooks: 4 (up from 3)
- Recent sessions: update table with sessions ~50-52
- Tech debt: update known items
- Future plan: remove completed items, add new priorities

### Verification
```
pnpm build && pnpm lint && pnpm test
```
