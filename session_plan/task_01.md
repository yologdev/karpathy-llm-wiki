Title: Surface frontmatter metadata on wiki page view
Files: src/app/wiki/[slug]/page.tsx, src/lib/wiki.ts, src/lib/__tests__/wiki.test.ts
Issue: none

## Goal

Make the rich frontmatter metadata (`created`, `updated`, `source_count`, `tags`) that `ingest()` already writes visible to users viewing a wiki page. Right now `MarkdownRenderer` strips the YAML block and nothing surfaces it — the data exists on disk but is invisible to readers. This is gap #1 and #3 from the assessment.

## What exists today

- `src/lib/wiki.ts` exports `readWikiPageWithFrontmatter(slug)` which returns `{ frontmatter: Frontmatter, content: string }`, where `Frontmatter` has `created`, `updated`, `source_count`, `tags`, and an index signature for extra keys. All four fields are optional.
- `parseFrontmatter()` already handles missing YAML blocks gracefully (returns empty frontmatter object).
- `src/app/wiki/[slug]/page.tsx` currently calls `readWikiPage(slug)` (content only) and renders it through `<MarkdownRenderer>`. There is no metadata block.
- `MarkdownRenderer` strips the leading `---...---` YAML block before rendering, so there is no double-render risk.

## What to build

1. **Update `src/app/wiki/[slug]/page.tsx`** to use `readWikiPageWithFrontmatter(slug)` instead of `readWikiPage(slug)`. Render a small metadata block directly under the page title (above the `<MarkdownRenderer>` output). The block should:
   - Show `Updated <date>` if `frontmatter.updated` is present, falling back to `Created <date>` if only `created` is set, otherwise render nothing for dates.
   - Show `· <N> source(s)` if `frontmatter.source_count` is a number ≥ 1 (pluralize appropriately, i.e. "1 source" / "2 sources").
   - Show tag pills if `frontmatter.tags` is a non-empty array. Use small rounded `<span>` pills with Tailwind classes (`inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300`) and a small gap between them.
   - If none of the fields are present (e.g. legacy save-answer pages with no frontmatter), render nothing — do not emit an empty metadata div.
   - Use muted Tailwind classes consistent with the existing page styling (e.g. `text-sm text-gray-500 dark:text-gray-400` for the date/source line).
2. **Keep the metadata block simple and accessible** — no client-side interactivity, no new components yet. This is a server component; the block is a plain `<div>` with `<span>` children. Do not create a new file in `src/components/` — inline the markup in the page.
3. **Format dates as `YYYY-MM-DD`**. If a date string is already in that form (as ingest writes it), pass it through; if it includes a time component, truncate to the first 10 chars. Do not import a date library.
4. **Keep tags non-clickable for now.** We don't have a tag browse page yet — don't link them. Just render the pills.

## Tests

Add tests in `src/lib/__tests__/wiki.test.ts` if there's a gap — but the rendering logic lives in the page component (not directly unit-tested today). The key invariant to protect is that `readWikiPageWithFrontmatter` returns the parsed frontmatter correctly for pages with and without a YAML block. If that coverage already exists, no new tests needed; verify by reading the existing `wiki.test.ts` describe blocks.

**Do not modify `MarkdownRenderer`** — it still strips YAML and renders the content body. The metadata block is strictly additive above it.

**Do not touch the edit flow or PUT route** — that's a separate task.

## Verification

```sh
pnpm build && pnpm lint && pnpm test
```

All 212 existing tests must still pass. Build must stay clean. Manually verify by reading the generated page source (or inspecting the TSX): for a page with full frontmatter the block should render all three elements; for a bare-content page (no YAML) the block should render nothing.
