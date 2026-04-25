Title: Accessibility sweep — aria-labels on interactive elements
Files: src/components/RevisionHistory.tsx, src/components/LintFilterControls.tsx, src/components/DeletePageButton.tsx, src/components/ReingestButton.tsx, src/components/IngestPreview.tsx
Issue: none

Prior sessions added ARIA landmarks and skip-nav, but interactive buttons in several components still lack `aria-label` attributes. Screen readers announce these as bare "button" elements with no indication of their purpose.

**Components to fix (all buttons that lack aria-label or have non-descriptive text content):**

### `RevisionHistory.tsx` (3 buttons)
- Toggle button (line ~132): add `aria-label="Toggle revision history"` (or `aria-expanded` + `aria-controls`)
- View button (line ~188): add `aria-label={`View revision from ${formatted date}`}`
- Revert button (line ~200): add `aria-label={`Restore revision from ${formatted date}`}`

### `LintFilterControls.tsx` (4 buttons)
- Select all button (line ~63): add `aria-label="Select all lint checks"`
- Clear all button (line ~69): add `aria-label="Clear all lint checks"`
- Individual check toggle buttons (line ~81): add `aria-label={`Toggle ${type} check`}` and `aria-pressed={enabled}`
- Run lint button (line ~121): already has text content "Run Lint" — verify it's sufficient

### `DeletePageButton.tsx` (1 button)
- Delete button (line ~42): add `aria-label="Delete this wiki page"`

### `ReingestButton.tsx` (1 button)
- Reingest button (line ~40): add `aria-label="Re-ingest source content"`

### `IngestPreview.tsx` (5 buttons)
- Cancel button (line ~39): add `aria-label="Cancel ingest"`
- Preview/Raw toggle buttons (lines ~64, ~75): add `aria-pressed` state for toggle indication
- Approve button (line ~107): add `aria-label="Approve and ingest"`
- Cancel button (line ~114): add `aria-label="Cancel ingest"` (second cancel)

**Rules:**
- Buttons with visible text that fully describes the action don't need aria-label (text IS the label)
- Buttons with only icons or ambiguous text ("×", "↺") need aria-label
- Toggle buttons should use `aria-pressed` where applicable
- Dynamic labels should include context (e.g., the revision timestamp, the page title)

**Verification:** `pnpm build && pnpm lint && pnpm test`
