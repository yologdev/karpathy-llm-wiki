Title: Guided onboarding wizard for empty wikis
Files: src/components/OnboardingWizard.tsx, src/app/page.tsx
Issue: none

When a user first launches the app (wiki is empty, no pages), the home page
should show a guided step-by-step onboarding experience instead of just a
static "Getting Started" callout. This dramatically improves first impressions
and helps users understand the ingest→browse→query→lint workflow.

## Design

Replace the existing empty-state `<div>` in `src/app/page.tsx` (the
"Getting Started" box that currently shows when `pageCount === 0`) with an
`<OnboardingWizard />` component that shows a multi-step visual guide.

### OnboardingWizard component

Create `src/components/OnboardingWizard.tsx` — a client component that shows
a 3-step visual checklist:

**Step 1: Configure your LLM**
- Check: call `GET /api/status` to see if an LLM provider is configured
- If not configured: show a prominent "Configure LLM →" link to `/settings`
- If configured: show a green checkmark with the provider name
- This step is required before the others make sense

**Step 2: Ingest your first source**
- Check: `pageCount > 0` (passed as prop from server component)
- If no pages: show "Ingest a source →" link to `/ingest` with a brief
  explanation ("Paste a URL or text — the LLM will create a wiki page")
- If pages exist: green checkmark

**Step 3: Ask your first question**
- Show "Ask a question →" link to `/query`
- Brief explanation: "Query your wiki and get cited answers"
- This step is always available but highlighted after step 2 completes

### Visual design

- Vertical step list with step numbers (1, 2, 3)
- Each step has: number circle, title, description, action link/button
- Completed steps show a green checkmark replacing the number
- Active (next uncompleted) step is visually highlighted
- Use existing Tailwind classes and `dark:` variants for consistency
- The wizard should look like a clean checklist, not a modal or overlay

### Integration in page.tsx

In `src/app/page.tsx`, replace the current empty-state block:
```tsx
{pageCount === 0 ? (
  <OnboardingWizard pageCount={pageCount} />
) : (
  <p className="...">Your wiki has <Link ...>{pageCount} pages</Link></p>
)}
```

The OnboardingWizard receives `pageCount` as a prop (from the server component)
and fetches LLM status client-side via `/api/status`.

### Keep the feature cards

The existing 4 feature cards (Ingest, Browse, Query, Lint) at the bottom of
the page should remain — they're useful even during onboarding.

## Constraints

- Touch only 2 files: new `OnboardingWizard.tsx` and modified `page.tsx`
- No new dependencies
- Must work without JS (graceful degradation — the server-rendered page.tsx
  still shows the pageCount check)
- Must look good in both light and dark mode

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```
