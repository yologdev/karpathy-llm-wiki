/**
 * Obsidian export utilities.
 *
 * Converts internal markdown links to Obsidian wikilink format and provides
 * helpers for building an Obsidian-compatible vault zip.
 */

// ---------------------------------------------------------------------------
// Link conversion
// ---------------------------------------------------------------------------

/**
 * Convert internal markdown links (`[Title](slug.md)`) to Obsidian wikilinks
 * (`[[slug|Title]]`).
 *
 * Only converts links that look like internal wiki references — i.e. the href
 * is a bare slug (lowercase alphanumeric + hyphens) followed by `.md`. External
 * URLs (containing `://` or starting with `http`) are left untouched.
 */
export function convertToObsidianLinks(content: string): string {
  // Match [Title](slug.md) where slug is lowercase alphanumeric with hyphens.
  // Negative lookbehind for `!` so we don't convert image embeds like ![alt](img.md).
  return content.replace(
    /(?<!!)\[([^\]]+)\]\(([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])\.md\)/g,
    (_match, title: string, slug: string) => `[[${slug}|${title}]]`,
  );
}

/**
 * Rewrite a page's image references to vault-relative asset paths so images
 * resolve in the exported vault. Stored sources are either `assets/<slug>/…`
 * (already vault-relative) or `raw/assets/<slug>/…`; the latter is normalized to
 * the former — where the export places the file. Absolute/`/api/assets` URLs are
 * left untouched.
 */
export function normalizeVaultAssetPaths(content: string): string {
  return content.replace(/\]\(raw\/assets\//g, "](assets/");
}
