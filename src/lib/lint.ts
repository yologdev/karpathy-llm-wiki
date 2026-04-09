import fs from "fs/promises";
import { appendToLog, getWikiDir, listWikiPages, readWikiPage } from "./wiki";
import { hasLLMKey, callLLM } from "./llm";
import { loadPageConventions } from "./ingest";
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
 * Extract cross-reference links from a page's content.
 * Returns the set of slugs that this page links to.
 */
function extractCrossRefSlugs(content: string): Set<string> {
  const linkRe = /\[([^\]]*)\]\(([^)]+)\.md\)/g;
  const slugs = new Set<string>();
  let match;
  while ((match = linkRe.exec(content)) !== null) {
    slugs.add(match[2]);
  }
  return slugs;
}

/**
 * Build clusters of related pages based on cross-references.
 * Each cluster contains up to `maxClusterSize` pages that link to each other.
 */
function buildClusters(
  pages: { slug: string; content: string }[],
  maxClusterSize: number = 5,
): string[][] {
  // Build adjacency: for each page, which pages does it link to?
  const links = new Map<string, Set<string>>();
  const slugSet = new Set(pages.map((p) => p.slug));

  for (const page of pages) {
    const refs = extractCrossRefSlugs(page.content);
    // Only keep refs that point to pages that actually exist
    const validRefs = new Set<string>();
    for (const ref of refs) {
      if (slugSet.has(ref) && ref !== page.slug) {
        validRefs.add(ref);
      }
    }
    links.set(page.slug, validRefs);
  }

  // Build clusters using connected components via cross-references
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const page of pages) {
    if (visited.has(page.slug)) continue;

    const refs = links.get(page.slug) ?? new Set<string>();
    if (refs.size === 0) continue; // Skip isolated pages

    // BFS to find connected component, capped at maxClusterSize
    const cluster: string[] = [page.slug];
    visited.add(page.slug);
    const queue = [...refs];

    while (queue.length > 0 && cluster.length < maxClusterSize) {
      const next = queue.shift()!;
      if (visited.has(next)) continue;
      visited.add(next);
      cluster.push(next);

      const nextRefs = links.get(next) ?? new Set<string>();
      for (const ref of nextRefs) {
        if (!visited.has(ref)) {
          queue.push(ref);
        }
      }
    }

    if (cluster.length >= 2) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

const CONTRADICTION_SYSTEM_PROMPT = `You are a wiki consistency checker. Given the following wiki pages, identify any contradictions, conflicting claims, or cases where one page's information supersedes or conflicts with another's.

For each contradiction found, respond with a JSON array of objects:
[{"pages": ["slug-a", "slug-b"], "description": "Page A says X while Page B says Y"}]

If no contradictions are found, respond with an empty array: []

Respond ONLY with the JSON array — no additional text, no markdown code fences.`;

/**
 * Parse the LLM response for contradiction detection.
 * Returns structured contradiction data or an empty array on malformed responses.
 */
function parseContradictionResponse(
  response: string,
): { pages: string[]; description: string }[] {
  try {
    // Strip optional markdown code fences
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    const results: { pages: string[]; description: string }[] = [];
    for (const item of parsed) {
      if (
        item &&
        Array.isArray(item.pages) &&
        item.pages.length >= 2 &&
        typeof item.description === "string" &&
        item.description.length > 0
      ) {
        results.push({
          pages: item.pages.map(String),
          description: item.description,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Check for contradictions between related wiki pages using the LLM.
 * If no LLM key is configured, returns an info-level message and skips.
 */
async function checkContradictions(
  diskSlugs: string[],
): Promise<LintIssue[]> {
  if (!hasLLMKey()) {
    return [
      {
        type: "contradiction",
        slug: "",
        message:
          "Contradiction detection skipped — no LLM API key configured",
        severity: "info",
      },
    ];
  }

  // Read all page contents
  const pages: { slug: string; content: string }[] = [];
  for (const slug of diskSlugs) {
    const page = await readWikiPage(slug);
    if (page) {
      pages.push({ slug: page.slug, content: page.content });
    }
  }

  // Build clusters of related pages
  const clusters = buildClusters(pages);
  if (clusters.length === 0) {
    return [];
  }

  // For each cluster, call the LLM
  const issues: LintIssue[] = [];
  const pageMap = new Map(pages.map((p) => [p.slug, p.content]));

  // Load SCHEMA.md conventions once for all cluster checks so the
  // contradiction detector is aware of the wiki's structural rules.
  const conventions = await loadPageConventions();
  let systemPrompt = CONTRADICTION_SYSTEM_PROMPT;
  if (conventions) {
    systemPrompt += `\n\nThe wiki follows these conventions (from SCHEMA.md):\n\n${conventions}`;
  }

  for (const cluster of clusters) {
    // Build the user message with all pages in this cluster
    const pagesText = cluster
      .map((slug) => {
        const content = pageMap.get(slug) ?? "";
        return `--- Page: ${slug} ---\n${content}`;
      })
      .join("\n\n");

    try {
      const response = await callLLM(systemPrompt, pagesText);
      const contradictions = parseContradictionResponse(response);

      for (const c of contradictions) {
        const affectedSlug = c.pages[0] ?? cluster[0];
        issues.push({
          type: "contradiction",
          slug: affectedSlug,
          message: `Contradiction between ${c.pages.join(", ")}: ${c.description}`,
          severity: "warning",
        });
      }
    } catch {
      // LLM call failed — don't crash the lint, just skip this cluster
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

export { extractCrossRefSlugs, buildClusters, parseContradictionResponse, checkContradictions };

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

  // Run all checks (structural checks in parallel, then contradiction check)
  const [orphans, stale, empty, crossRefs] = await Promise.all([
    checkOrphanPages(diskSlugs, indexSlugs),
    checkStaleIndex(indexSlugs, diskSlugSet),
    checkEmptyPages(diskSlugs),
    checkMissingCrossRefs(diskSlugs),
  ]);

  // Contradiction detection requires LLM calls, run after structural checks
  const contradictions = await checkContradictions(diskSlugs);

  const issues = [...orphans, ...stale, ...empty, ...crossRefs, ...contradictions];

  // Append a log entry so lint passes are visible in the wiki timeline.
  // The title is a stable string ("wiki lint pass") so log readers can group
  // lint rows; the details line carries a one-shot summary of issue counts.
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;
  const logSummary =
    `${issues.length} issue(s): ` +
    `${errorCount} error · ${warningCount} warning · ${infoCount} info`;
  await appendToLog("lint", "wiki lint pass", logSummary);

  return {
    issues,
    summary: buildSummary(issues),
    checkedAt: new Date().toISOString(),
  };
}
