Title: Add Marp slide preview rendering to query results
Files: src/components/SlidePreview.tsx, src/components/QueryResultPanel.tsx, src/app/query/page.tsx
Issue: none

## Description

The query page supports a "slides" format that instructs the LLM to generate Marp slide deck output (`marp: true` frontmatter + `---` separators). But the QueryResultPanel renders the result as regular markdown — users see the raw `---` separators and `marp: true` header as plain text. This gap was identified in the assessment: "query can generate Marp-format output, but there's no slide preview/rendering in the UI."

### What to build

**`src/components/SlidePreview.tsx`** — A pure client component that:

1. Strips the `marp: true` frontmatter block from the content
2. Splits on `\n---\n` to get individual slides
3. Renders each slide as a card/panel with a slide number indicator
4. Each slide's content is rendered through `MarkdownRenderer`
5. Includes prev/next navigation buttons and a slide counter (e.g., "Slide 2 of 7")
6. Optional "show all" toggle that renders all slides stacked vertically

Props:
```typescript
interface SlidePreviewProps {
  content: string;  // raw Marp markdown from LLM
}
```

**`src/components/QueryResultPanel.tsx`** — Detect when the result content starts with Marp frontmatter (`marp: true`) and render `<SlidePreview>` instead of `<MarkdownRenderer>`:

```typescript
const isMarp = result.answer.trimStart().startsWith("---\nmarp: true");

// In JSX:
{isMarp ? (
  <SlidePreview content={result.answer} />
) : (
  <MarkdownRenderer content={result.answer} />
)}
```

**`src/app/query/page.tsx`** — No changes needed. The format selector already has `"slides"` as an option.

### Design

- Each slide card: rounded border, subtle background, generous padding
- Slide number badge in the top-right corner
- Navigation: left/right arrow buttons below the slide, disabled at bounds
- "Show all slides" button to toggle stacked view
- Dark mode compatible via existing Tailwind foreground/background classes
- Accessible: aria-labels on nav buttons, aria-live for slide counter

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

This is a visual component with no API changes, so build + lint is the primary verification. The component is self-contained (~80-100 lines).
