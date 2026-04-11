Title: Add "What links here" backlinks to wiki page view
Files: src/lib/wiki.ts, src/app/wiki/[slug]/page.tsx, src/lib/__tests__/wiki.test.ts
Issue: none

## Description

Individual wiki pages show outgoing cross-references (embedded in the markdown) but have no way to see *incoming* links. "What links here" is a core wiki affordance (Wikipedia, Obsidian, etc.) that helps users discover related content and navigate the knowledge graph. The graph API already computes edges; this task adds a lightweight server-side function and renders backlinks on each page.

## Changes

### 1. Add `findBacklinks()` to `src/lib/wiki.ts`

Add a new exported async function:

```typescript
/**
 * Find all wiki pages that link to the given slug.
 * Returns an array of { slug, title } for pages containing a markdown link
 * to `targetSlug.md`.
 */
export async function findBacklinks(targetSlug: string): Promise<Array<{ slug: string; title: string }>> {
  const pages = await listWikiPages();
  const backlinks: Array<{ slug: string; title: string }> = [];
  const linkPattern = new RegExp(`\\]\\(${targetSlug}\\.md\\)`);

  for (const page of pages) {
    if (page.slug === targetSlug || page.slug === "index" || page.slug === "log") continue;
    const content = await readWikiPage(page.slug);
    if (content && linkPattern.test(content)) {
      backlinks.push({ slug: page.slug, title: page.title });
    }
  }

  return backlinks;
}
```

### 2. Render backlinks on `src/app/wiki/[slug]/page.tsx`

After the article content and before the edit/delete toolbar, add a "What links here" section:

- Call `findBacklinks(slug)` in the server component
- If backlinks.length > 0, render a section with heading "What links here" and a list of links
- Style it as a subtle secondary section (muted text, small heading) so it doesn't compete with the page content
- Each backlink is a `<Link>` to `/wiki/{slug}`

### 3. Add tests in `src/lib/__tests__/wiki.test.ts`

Add a `describe("findBacklinks")` block with tests:
- Returns pages that link to the target slug
- Excludes the target page itself
- Excludes index.md and log.md
- Returns empty array when no pages link to target
- Handles the case where target slug appears in text but not as a markdown link (should not match)

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

Ensure the new tests pass and the build succeeds with the updated page component.
