import fs from "fs/promises";
import { getWikiDir, listWikiPages, readWikiPage } from "./wiki";
import type { LintIssue, LintResult } from "./types";

// Files that are part of the wiki infrastructure, not content pages.
const INFRASTRUCTURE_FILES = new Set(["index.md", "log.md"]);

/**
 * Get all content page slugs that exist on disk (excluding infrastructure files).
 */
async function getOnDiskSlugs(wikiDir: string): Promise<string[]> {
  let files: string[];
  try {
    files = await fs.readdir(wikiDir);
  } catch {
    return [];
  }

  return files
    .filter((f) => f.endsWith(".md") && !INFRASTRUCTURE_FILES.has(f))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Check for orphan pages — pages on disk that aren't listed in index.md.
 */
async function checkOrphanPages(
  diskSlugs: string[],
  indexSlugs: Set<string>,
): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  for (const slug of diskSlugs) {
    if (!indexSlugs.has(slug)) {
      issues.push({
        type: "orphan-page",
        slug,
        message: `Page "${slug}.md" exists on disk but is not listed in index.md`,
        severity: "warning",
      });
    }
  }
  return issues;
}

/**
 * Check for stale index entries — entries in index.md whose .md file doesn't exist.
 */
async function checkStaleIndex(
  indexSlugs: Set<string>,
  diskSlugs: Set<string>,
): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  for (const slug of indexSlugs) {
    if (!diskSlugs.has(slug)) {
      issues.push({
        type: "stale-index",
        slug,
        message: `Index references "${slug}.md" but the file does not exist`,
        severity: "error",
      });
    }
  }
  return issues;
}

/**
 * Check for empty pages — pages with less than 50 chars of content after
 * stripping the first heading line.
 */
async function checkEmptyPages(diskSlugs: string[]): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  for (const slug of diskSlugs) {
    const page = await readWikiPage(slug);
    if (!page) continue;

    // Strip the first heading line and measure remaining content
    const stripped = page.content.replace(/^#\s+.+$/m, "").trim();
    if (stripped.length < 50) {
      issues.push({
        type: "empty-page",
        slug,
        message: `Page "${slug}.md" has little or no content (${stripped.length} chars after heading)`,
        severity: "warning",
      });
    }
  }
  return issues;
}

/**
 * Check for missing cross-references — pages that mention another page's title
 * or slug in their body but don't link to it.
 */
async function checkMissingCrossRefs(
  diskSlugs: string[],
): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];

  // Build a map of slug → title for all pages
  const pageInfo: { slug: string; title: string; content: string }[] = [];
  for (const slug of diskSlugs) {
    const page = await readWikiPage(slug);
    if (page) {
      pageInfo.push({ slug: page.slug, title: page.title, content: page.content });
    }
  }

  for (const current of pageInfo) {
    // Find all existing markdown links in this page (targets as slugs)
    const linkRe = /\[([^\]]*)\]\(([^)]+)\.md\)/g;
    const linkedSlugs = new Set<string>();
    let match;
    while ((match = linkRe.exec(current.content)) !== null) {
      linkedSlugs.add(match[2]);
    }

    // Check if this page mentions other pages without linking to them
    for (const other of pageInfo) {
      if (other.slug === current.slug) continue;
      if (linkedSlugs.has(other.slug)) continue;

      // Check if the page content mentions the other page's title or slug
      // Use word-boundary matching to avoid false positives on short words
      const titleLower = other.title.toLowerCase();
      const contentLower = current.content.toLowerCase();

      // Only check titles with 3+ characters to avoid false positives
      // Use word-boundary regex to prevent matching inside other words
      const escaped = titleLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`);
      if (titleLower.length >= 3 && re.test(contentLower)) {
        issues.push({
          type: "missing-crossref",
          slug: current.slug,
          message: `Page "${current.slug}.md" mentions "${other.title}" but doesn't link to ${other.slug}.md`,
          severity: "info",
        });
      }
    }
  }

  return issues;
}

/**
 * Build a human-readable summary of the lint results.
 */
function buildSummary(issues: LintIssue[]): string {
  if (issues.length === 0) {
    return "Wiki is clean — no issues found.";
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? "s" : ""}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings !== 1 ? "s" : ""}`);
  if (infos > 0) parts.push(`${infos} info${infos !== 1 ? "s" : ""}`);

  return `Found ${issues.length} issue${issues.length !== 1 ? "s" : ""}: ${parts.join(", ")}.`;
}

/**
 * Run all lint checks against the wiki and return the results.
 */
export async function lint(): Promise<LintResult> {
  const wikiDir = getWikiDir();

  // Gather data
  const diskSlugs = await getOnDiskSlugs(wikiDir);
  const indexEntries = await listWikiPages();
  const indexSlugs = new Set(indexEntries.map((e) => e.slug));
  const diskSlugSet = new Set(diskSlugs);

  // Run all checks
  const [orphans, stale, empty, crossRefs] = await Promise.all([
    checkOrphanPages(diskSlugs, indexSlugs),
    checkStaleIndex(indexSlugs, diskSlugSet),
    checkEmptyPages(diskSlugs),
    checkMissingCrossRefs(diskSlugs),
  ]);

  const issues = [...orphans, ...stale, ...empty, ...crossRefs];

  return {
    issues,
    summary: buildSummary(issues),
    checkedAt: new Date().toISOString(),
  };
}
