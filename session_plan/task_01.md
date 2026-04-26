Title: Page template selector in new-page form
Files: src/app/wiki/new/page.tsx, src/app/api/wiki/templates/route.ts, src/components/TemplateSelector.tsx
Issue: none

## Description

SCHEMA.md defines 4 page types (source-summary, entity, concept, comparison) with full template structures, and `loadPageTemplates()` in `src/lib/schema.ts` already parses them at runtime. But the "Create new wiki page" form at `/wiki/new` is a blank textarea — templates are invisible to users. This task surfaces those templates.

### What to build

1. **API route: `src/app/api/wiki/templates/route.ts`** — A GET endpoint that calls `loadPageTemplates()` from `src/lib/schema.ts`, parses the returned markdown to extract individual template names and their markdown content blocks, and returns JSON like:
   ```json
   {
     "templates": [
       { "name": "Source summary", "type": "summary", "content": "# <Title>\n\n<One-paragraph...>" },
       { "name": "Entity page", "type": "entity", "content": "..." },
       { "name": "Concept page", "type": "concept", "content": "..." },
       { "name": "Comparison page", "type": "comparison", "content": "..." }
     ]
   }
   ```
   Parse the SCHEMA.md template section by splitting on `### ` headings, then extracting the markdown code block content (the second code fence in each section — the first is YAML frontmatter, the second is the markdown body). Keep parsing simple and resilient — if SCHEMA.md is missing or has no templates, return an empty array.

2. **Component: `src/components/TemplateSelector.tsx`** — A small dropdown/button group that:
   - Fetches templates from `/api/wiki/templates` on mount
   - Shows a "Start from template" dropdown with options: "Blank", "Source summary", "Entity page", "Concept page", "Comparison page"
   - When a template is selected, calls an `onSelect(content: string)` callback with the template markdown
   - If no templates are available (API fails or empty), renders nothing (graceful degradation)
   - Styled consistently with existing form elements (Tailwind, same border/bg/text patterns)

3. **Update: `src/app/wiki/new/page.tsx`** — Add the `TemplateSelector` above the content textarea. When a template is selected:
   - Set the `content` state to the template markdown
   - If the template has a placeholder title like `<Entity Name>`, don't auto-fill the title field — let the user type it
   - If content is already non-empty, show a brief confirm ("Replace current content?") or just replace (simpler — this is the "new" page, not "edit")

### Verification

```sh
pnpm build && pnpm lint && pnpm test
```

The build must pass. No new tests required for this task (it's UI wiring), but the existing tests must remain green.
