Title: Obsidian export — download wiki as a zip vault
Files: src/app/api/wiki/export/route.ts, src/app/wiki/page.tsx, src/components/WikiIndexClient.tsx
Issue: none

## Description

Add an Obsidian-compatible export feature so users can download their entire wiki as a zip file and open it as an Obsidian vault. This has been flagged in journal entries since April 6.

### 1. API route: `src/app/api/wiki/export/route.ts`

`GET /api/wiki/export` — returns a zip file containing the wiki as an Obsidian vault.

**Implementation:**
- Use Node.js built-in `zlib` — but zip archives need more than gzip. Use the lightweight approach: build the zip manually OR use the `archiver` npm package. Actually, to avoid new dependencies, use a minimal zip builder with Node's built-in `Buffer` manipulation. **Better approach**: use `JSZip` or just stream raw files. **Simplest**: since we want to avoid dependencies, just use `tar` via child_process... No — let's keep it clean.

**Decision: use the `archiver` package** (well-maintained, 25M weekly downloads, zero-config zip creation). Add it as a dependency: `pnpm add archiver && pnpm add -D @types/archiver`.

```typescript
import archiver from 'archiver';

export async function GET() {
  const wikiDir = getWikiDir();
  const pages = await listWikiPages();
  
  // Create zip archive
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  // Add each wiki page, converting cross-ref links for Obsidian compatibility:
  // [Title](slug.md) → [[slug|Title]] (Obsidian wikilink format)
  for (const entry of pages) {
    const page = await readWikiPage(entry.slug);
    if (!page) continue;
    
    // Convert markdown links to Obsidian wikilinks
    const obsidianContent = convertToObsidianLinks(page.content);
    archive.append(obsidianContent, { name: `${entry.slug}.md` });
  }
  
  // Add index.md as-is (it's the vault's home page)
  const indexContent = await readWikiPage('index');
  if (indexContent) {
    archive.append(convertToObsidianLinks(indexContent.content), { name: 'index.md' });
  }
  
  archive.finalize();
  
  // Stream the archive as a response
  return new Response(archiveToReadableStream(archive), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="llm-wiki-vault.zip"',
    },
  });
}
```

**Link conversion function** `convertToObsidianLinks(content: string): string`:
- Pattern: `[Title](slug.md)` → `[[slug|Title]]`
- Regex: `/\[([^\]]+)\]\(([a-z0-9-]+)\.md\)/g` → `[[$2|$1]]`
- Only converts internal `.md` links, not external URLs
- Strip YAML frontmatter or convert it to Obsidian-compatible Properties format (Obsidian reads YAML frontmatter natively, so actually just leave it as-is!)

### 2. Export button in the wiki index UI

In `src/components/WikiIndexClient.tsx`, add an "Export to Obsidian" button next to the existing search/filter controls. The button:
- Makes a `fetch('/api/wiki/export')` call
- Downloads the resulting zip via `URL.createObjectURL` + a temporary `<a>` element
- Shows a loading state while the zip is being generated
- Disabled when there are no wiki pages

Style it as a secondary action (outline button, not primary), with a download icon or "↓ Export" label.

### 3. Tests

No separate test file needed — the link conversion function should be unit-tested inline or in a small test. Add 3-4 test cases to verify:
- `[Title](slug.md)` → `[[slug|Title]]`
- External links `[Google](https://google.com)` are NOT converted
- Multiple links in one line
- Links with hyphens in slug: `[My Page](my-page.md)` → `[[my-page|My Page]]`

These can go in a new `src/lib/__tests__/export.test.ts` or be added to an existing test file.

## Verification
```sh
pnpm add archiver @types/archiver
pnpm build && pnpm lint && pnpm test
```
