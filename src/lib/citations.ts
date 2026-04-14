/**
 * Extract wiki slugs cited in markdown text via `](slug.md)` link patterns.
 * Pure string logic — safe for both client and server.
 */
export function extractCitedSlugs(
  answer: string,
  availableSlugs: string[],
): string[] {
  const slugSet = new Set(availableSlugs);
  const pattern = /\]\(([^)]+?)\.md\)/g;
  const cited = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(answer)) !== null) {
    const slug = match[1];
    if (slugSet.has(slug)) {
      cited.add(slug);
    }
  }

  return Array.from(cited);
}
