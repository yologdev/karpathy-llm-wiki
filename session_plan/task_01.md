Title: Lint page decomposition — extract LintFilterControls and LintIssueCard
Files: src/app/lint/page.tsx, src/components/LintFilterControls.tsx, src/components/LintIssueCard.tsx
Issue: none

The lint page at 492 lines is the largest monolithic page component remaining.
It mixes filter control UI, issue list rendering, and fix orchestration logic.
Extract two focused components:

## LintFilterControls (~100 lines)

Extract from lint/page.tsx lines 303–390 (the filter controls section) into
`src/components/LintFilterControls.tsx`. This component renders:

- Check type toggle buttons (all 7 lint check types) with All/None shortcuts
- Severity filter dropdown
- "Run Lint" button

Props:
```ts
interface LintFilterControlsProps {
  enabledChecks: Set<LintIssue["type"]>;
  onToggleCheck: (type: LintIssue["type"]) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  severityFilter: SeverityFilter;
  onSeverityChange: (filter: SeverityFilter) => void;
  onRunLint: () => void;
  loading: boolean;
}
```

Move the constants that the component needs (`ALL_CHECK_TYPES`, `checkTypeLabels`,
`severityFilterLabels`, `SeverityFilter` type) into the component file since
they're only used there + in the parent page for state management.

## LintIssueCard (~80 lines)

Extract from lint/page.tsx lines 415–485 (the `<li>` block inside the issues map)
into `src/components/LintIssueCard.tsx`. This component renders a single lint
issue with its severity badge, slug link, fix button, and fix message.

Props:
```ts
interface LintIssueCardProps {
  issue: LintIssue;
  isFixing: boolean;
  fixMessage: string | null;
  onFix: (issue: LintIssue, targetSlug?: string) => void;
}
```

Move `severityClasses`, `fixableTypes`, `fixLabel` into this file since they
describe per-issue rendering.

The lint page should shrink to ~280 lines: state management, the `runLint` and
`handleFix` callbacks, and the layout shell that composes the two new components.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

No new tests needed — this is pure extraction with no behavior change. Existing
lint-related code paths are covered by the lint test suite.
