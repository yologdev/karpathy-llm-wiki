#!/usr/bin/env node
/**
 * CLI entry point for yopedia.
 *
 * Usage:
 *   pnpm cli ingest <url>         Ingest a URL into the wiki
 *   pnpm cli ingest --text        Ingest text from stdin
 *   pnpm cli query <question>     Query the wiki
 *   pnpm cli search <query>       Search wiki pages by content
 *   pnpm cli read <slug>          Read a wiki page by slug
 *   pnpm cli create <slug>        Create a new wiki page (body from stdin)
 *   pnpm cli update <slug>        Update an existing wiki page (body from stdin)
 *   pnpm cli lint                 Run wiki lint checks
 *   pnpm cli lint --fix           Run lint and auto-fix issues
 *   pnpm cli list                 List all wiki pages
 *   pnpm cli list --raw           List raw sources
 *   pnpm cli delete <slug>        Delete a wiki page and clean up side effects
 *   pnpm cli status               Show wiki health summary
 *   pnpm cli help                 Show this help
 */

// ---------------------------------------------------------------------------
// Argument parsing (exported for testing)
// ---------------------------------------------------------------------------

export type ParsedCommand =
  | { command: "ingest-url"; url: string }
  | { command: "ingest-text" }
  | { command: "reingest"; slug: string }
  | { command: "query"; question: string }
  | { command: "search"; query: string; fuzzy: boolean; scope?: string; limit: number }
  | { command: "read"; slug: string }
  | { command: "create"; slug: string; title: string; tags?: string[] }
  | { command: "update"; slug: string; title?: string; tags?: string[] }
  | { command: "lint"; fix: boolean }
  | { command: "list"; raw: boolean }
  | { command: "delete"; slug: string }
  | { command: "status" }
  | { command: "help" }
  | { command: "error"; message: string };

export function parseArgs(argv: string[]): ParsedCommand {
  const [sub, ...rest] = argv;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { command: "help" };
  }

  switch (sub) {
    case "ingest": {
      if (rest.includes("--text")) {
        return { command: "ingest-text" };
      }
      const url = rest.find((a) => !a.startsWith("-"));
      if (!url) {
        return { command: "error", message: "Usage: pnpm cli ingest <url>  or  pnpm cli ingest --text" };
      }
      return { command: "ingest-url", url };
    }
    case "reingest": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        return { command: "error", message: "Usage: pnpm cli reingest <slug>" };
      }
      return { command: "reingest", slug };
    }
    case "query": {
      const question = rest.filter((a) => !a.startsWith("-")).join(" ");
      if (!question) {
        return { command: "error", message: "Usage: pnpm cli query <question>" };
      }
      return { command: "query", question };
    }
    case "search": {
      const fuzzy = rest.includes("--fuzzy");
      const scopeIdx = rest.indexOf("--scope");
      const scope = scopeIdx !== -1 ? rest[scopeIdx + 1] : undefined;
      const limitIdx = rest.indexOf("--limit");
      const limitRaw = limitIdx !== -1 ? rest[limitIdx + 1] : undefined;
      const limit = limitRaw ? parseInt(limitRaw, 10) : 10;
      // Collect non-flag tokens as the query, skipping values of --scope and --limit
      const skipIndices = new Set<number>();
      if (scopeIdx !== -1) { skipIndices.add(scopeIdx); skipIndices.add(scopeIdx + 1); }
      if (limitIdx !== -1) { skipIndices.add(limitIdx); skipIndices.add(limitIdx + 1); }
      const queryWords = rest.filter((a, i) => !a.startsWith("-") && !skipIndices.has(i));
      const searchQuery = queryWords.join(" ");
      if (!searchQuery) {
        return { command: "error", message: "Usage: pnpm cli search <query> [--fuzzy] [--scope agent:<id>] [--limit N]" };
      }
      return { command: "search", query: searchQuery, fuzzy, scope, limit: isNaN(limit) ? 10 : limit };
    }
    case "read": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        return { command: "error", message: "Usage: pnpm cli read <slug>" };
      }
      return { command: "read", slug };
    }
    case "create": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        return { command: "error", message: 'Usage: pnpm cli create <slug> --title "Page Title"' };
      }
      const titleIdx = rest.indexOf("--title");
      if (titleIdx === -1 || !rest[titleIdx + 1]) {
        return { command: "error", message: 'Usage: pnpm cli create <slug> --title "Page Title"' };
      }
      const title = rest[titleIdx + 1];
      const tagsIdx = rest.indexOf("--tags");
      const tags = tagsIdx !== -1 && rest[tagsIdx + 1]
        ? rest[tagsIdx + 1].split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;
      return { command: "create", slug, title, tags };
    }
    case "update": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        return { command: "error", message: "Usage: pnpm cli update <slug> [--title \"New Title\"] [--tags tag1,tag2]" };
      }
      const titleIdx = rest.indexOf("--title");
      const title = titleIdx !== -1 && rest[titleIdx + 1] ? rest[titleIdx + 1] : undefined;
      const tagsIdx = rest.indexOf("--tags");
      const tags = tagsIdx !== -1 && rest[tagsIdx + 1]
        ? rest[tagsIdx + 1].split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;
      return { command: "update", slug, title, tags };
    }
    case "delete": {
      const slug = rest.find((a) => !a.startsWith("-"));
      if (!slug) {
        return { command: "error", message: "Usage: pnpm cli delete <slug>" };
      }
      return { command: "delete", slug };
    }
    case "lint": {
      const fix = rest.includes("--fix");
      return { command: "lint", fix };
    }
    case "list": {
      const raw = rest.includes("--raw");
      return { command: "list", raw };
    }
    case "status":
      return { command: "status" };
    default:
      return { command: "error", message: `Unknown command: ${sub}\nRun "pnpm cli help" for usage.` };
  }
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
yopedia CLI

Usage: pnpm cli <command> [args]

Commands:
  ingest <url>         Ingest a URL into the wiki
  ingest --text        Ingest text from stdin (pipe or type, then Ctrl-D)
  reingest <slug>      Re-fetch and update a page from its original source URL
  query <question>     Query the wiki
  search <query>       Search wiki pages by content
  read <slug>          Read a wiki page by slug
  create <slug>        Create a new wiki page (reads body from stdin)
  update <slug>        Update an existing wiki page (reads body from stdin)
  delete <slug>        Delete a wiki page and clean up side effects
  lint                 Run wiki lint checks
  lint --fix           Run lint and auto-fix issues
  list                 List all wiki pages (slug + title)
  list --raw           List raw sources instead of wiki pages
  status               Show wiki health summary
  help                 Show this help

Search flags:
  --fuzzy              Enable typo-tolerant fuzzy matching
  --scope agent:<id>   Restrict results to an agent's pages
  --limit N            Max results (default: 10)

Create flags:
  --title <title>      Page title (required)
  --tags tag1,tag2     Comma-separated tags (optional)

Update flags:
  --title <title>      New page title (optional — preserves existing if omitted)
  --tags tag1,tag2     Comma-separated tags (optional — preserves existing if omitted)

Examples:
  pnpm cli ingest https://example.com/article
  echo "Some text" | pnpm cli ingest --text
  pnpm cli reingest attention-mechanisms
  pnpm cli query "What is attention in transformers?"
  pnpm cli search "attention mechanism"
  pnpm cli search "atention" --fuzzy
  pnpm cli search "identity" --scope agent:yoyo --limit 5
  pnpm cli read attention-mechanisms
  pnpm cli delete attention-mechanisms
  echo "Page body content" | pnpm cli create my-page --title "My Page"
  echo "Tagged page" | pnpm cli create my-page --title "My Page" --tags ai,ml
  echo "new content" | pnpm cli update my-page
  echo "new content" | pnpm cli update my-page --title "New Title"
  echo "new content" | pnpm cli update my-page --title "New Title" --tags ai,ml
  pnpm cli lint
  pnpm cli lint --fix
  pnpm cli list
  pnpm cli list --raw
  pnpm cli status
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Command runners
// ---------------------------------------------------------------------------

export async function runIngestUrl(url: string): Promise<void> {
  const { ingestUrl } = await import("./lib/ingest");
  const result = await ingestUrl(url);
  console.log(result.primarySlug);
  if (result.relatedUpdated.length > 0) {
    for (const slug of result.relatedUpdated) {
      console.log(slug);
    }
  }
}

export async function runIngestText(): Promise<void> {
  const text = await readStdin();
  if (!text.trim()) {
    console.error("Error: no text received on stdin");
    process.exit(1);
  }
  // Use the first line (up to 80 chars) as a title, or "Untitled"
  const firstLine = text.split("\n")[0]?.trim().slice(0, 80) || "Untitled";
  const title = firstLine.replace(/^#+\s*/, ""); // strip leading markdown heading
  const { ingest } = await import("./lib/ingest");
  const result = await ingest(title, text);
  console.log(result.primarySlug);
  if (result.relatedUpdated.length > 0) {
    for (const slug of result.relatedUpdated) {
      console.log(slug);
    }
  }
}

export async function runReingest(slug: string): Promise<void> {
  const { reingest } = await import("./lib/ingest");
  const { readWikiPageWithFrontmatter } = await import("./lib/wiki");

  const result = await reingest(slug);

  // Read the updated page to get current title and expiry
  const page = await readWikiPageWithFrontmatter(result.primarySlug);
  const title = page?.title ?? result.primarySlug;
  const expiry = page?.frontmatter.expiry;
  const sourceUrl = result.sourceUrl ?? "(unknown)";

  console.log(`Reingest complete: ${title}`);
  console.log(`  Source: ${sourceUrl}`);
  if (expiry) {
    console.log(`  Expiry: ${expiry}`);
  }
}

export async function runQuery(question: string): Promise<void> {
  const { query } = await import("./lib/query");
  const result = await query(question);
  // Answer to stdout (pipeable)
  console.log(result.answer);
  // Sources to stderr (informational)
  if (result.sources.length > 0) {
    console.error(`\nCited pages: ${result.sources.join(", ")}`);
  }
}

export async function runSearch(
  searchQuery: string,
  fuzzy: boolean,
  limit: number,
  scopeParam?: string,
): Promise<void> {
  const { searchWikiContent, fuzzySearchWikiContent, resolveScope } = await import("./lib/search");
  const scope = scopeParam ? await resolveScope(scopeParam) : undefined;
  const results = fuzzy
    ? await fuzzySearchWikiContent(searchQuery, limit, scope ?? undefined)
    : await searchWikiContent(searchQuery, limit, scope ?? undefined);

  if (results.length === 0) {
    console.error("No results found.");
    return;
  }

  for (const r of results) {
    const snippet = r.snippet.replace(/\t/g, " ");
    console.log(`${r.slug}\t${r.score}\t${snippet}`);
  }
}

export async function runRead(slug: string): Promise<void> {
  const { readWikiPageWithFrontmatter } = await import("./lib/wiki");
  const page = await readWikiPageWithFrontmatter(slug);
  if (!page) {
    console.error(`Error: page "${slug}" not found.\nRun "pnpm cli list" to see available pages.`);
    process.exit(1);
    return; // unreachable but satisfies linting
  }

  // Print metadata header
  const fm = page.frontmatter;
  const lines: string[] = [];
  lines.push(`Title:      ${page.title}`);
  lines.push(`Slug:       ${page.slug}`);
  if (typeof fm.confidence === "number") {
    lines.push(`Confidence: ${fm.confidence}`);
  }
  if (typeof fm.expiry === "string" && fm.expiry.length > 0) {
    lines.push(`Expiry:     ${fm.expiry}`);
  }
  if (Array.isArray(fm.tags) && fm.tags.length > 0) {
    lines.push(`Tags:       ${fm.tags.join(", ")}`);
  }
  if (Array.isArray(fm.authors) && fm.authors.length > 0) {
    lines.push(`Authors:    ${fm.authors.join(", ")}`);
  }
  console.log(lines.join("\n"));
  console.log("---");
  console.log(page.body.trim());
}

export async function runCreate(slug: string, title: string, tags?: string[]): Promise<void> {
  const { validateSlug, readWikiPage } = await import("./lib/wiki");
  const { writeWikiPageWithSideEffects } = await import("./lib/lifecycle");
  const { serializeFrontmatter } = await import("./lib/frontmatter");
  const { extractSummary } = await import("./lib/ingest");

  // Validate slug format
  validateSlug(slug);

  // Check for existing page
  const existing = await readWikiPage(slug);
  if (existing) {
    console.error(`Error: page "${slug}" already exists.`);
    process.exit(1);
    return; // unreachable but satisfies linting
  }

  // Read body from stdin
  const body = await readStdin();
  if (!body.trim()) {
    console.error("Error: no content received on stdin");
    process.exit(1);
    return; // unreachable but satisfies linting
  }

  const today = new Date().toISOString().slice(0, 10);
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 90);
  const expiryDate = expiry.toISOString().slice(0, 10);

  const frontmatter = {
    title,
    created: today,
    updated: today,
    confidence: 0.5,
    expiry: expiryDate,
    authors: ["cli"],
    valid_from: today,
    disputed: false,
    contributors: [],
    aliases: [],
    tags: tags ?? [],
  };

  const fullContent = serializeFrontmatter(frontmatter, body.trim());
  const summary = extractSummary(body.trim());

  const result = await writeWikiPageWithSideEffects({
    slug,
    title,
    content: fullContent,
    summary,
    logOp: "ingest",
    crossRefSource: body.trim(),
  });

  console.log(`Created: ${result.slug}`);
  console.log(`  Title: ${title}`);
  if (result.updatedSlugs.length > 0) {
    console.log(`  Cross-referenced: ${result.updatedSlugs.join(", ")}`);
  }
}

export async function runUpdate(slug: string, title?: string, tags?: string[]): Promise<void> {
  const { validateSlug, readWikiPageWithFrontmatter } = await import("./lib/wiki");
  const { writeWikiPageWithSideEffects } = await import("./lib/lifecycle");
  const { serializeFrontmatter } = await import("./lib/frontmatter");
  const { extractSummary } = await import("./lib/ingest");

  // Validate slug format
  validateSlug(slug);

  // Check that the page exists
  const existing = await readWikiPageWithFrontmatter(slug);
  if (!existing) {
    console.error(`Error: page "${slug}" not found.\nRun "pnpm cli list" to see available pages.`);
    process.exit(1);
    return; // unreachable but satisfies linting
  }

  // Read new body from stdin
  const body = await readStdin();
  if (!body.trim()) {
    console.error("Error: no content received on stdin");
    process.exit(1);
    return; // unreachable but satisfies linting
  }

  // Merge metadata: use provided values or fall back to existing
  const fm = existing.frontmatter;
  const effectiveTitle = title ?? existing.title;
  const today = new Date().toISOString().slice(0, 10);

  const updatedFrontmatter = {
    ...fm,
    title: effectiveTitle,
    updated: today,
    tags: tags ?? (Array.isArray(fm.tags) ? fm.tags : []),
  };

  const fullContent = serializeFrontmatter(updatedFrontmatter, body.trim());
  const summary = extractSummary(body.trim());

  const result = await writeWikiPageWithSideEffects({
    slug,
    title: effectiveTitle,
    content: fullContent,
    summary,
    logOp: "edit",
    crossRefSource: body.trim(),
  });

  console.log(`Updated: ${result.slug}`);
  console.log(`  Title: ${effectiveTitle}`);
  if (result.updatedSlugs.length > 0) {
    console.log(`  Cross-referenced: ${result.updatedSlugs.join(", ")}`);
  }
}

export async function runDelete(slug: string): Promise<void> {
  const { deleteWikiPage } = await import("./lib/lifecycle");

  const result = await deleteWikiPage(slug);

  console.log(`Deleted: ${result.slug}`);
  if (result.removedFromIndex) {
    console.log("  Removed from index");
  }
  if (result.strippedBacklinksFrom.length > 0) {
    console.log(`  Stripped backlinks from: ${result.strippedBacklinksFrom.join(", ")}`);
  }
}

export async function runLint(fix: boolean): Promise<void> {
  const { lint } = await import("./lib/lint");
  const result = await lint();

  if (result.issues.length === 0) {
    console.log("No issues found.");
    return;
  }

  // Print issues
  for (const issue of result.issues) {
    const severity = issue.severity.toUpperCase().padEnd(7);
    console.log(`[${severity}] ${issue.type}: ${issue.message} (${issue.slug})`);
  }
  console.log(`\n${result.summary}`);

  // Auto-fix if requested
  if (fix) {
    const { fixLintIssue } = await import("./lib/lint-fix");
    console.log("\nAttempting auto-fix...\n");
    let fixed = 0;
    let failed = 0;
    for (const issue of result.issues) {
      try {
        const fixResult = await fixLintIssue(
          issue.type,
          issue.slug,
          issue.target,
          issue.message,
        );
        console.log(`  ✓ Fixed ${issue.type} on ${issue.slug}: ${fixResult.message}`);
        fixed++;
      } catch {
        console.error(`  ✗ Could not fix ${issue.type} on ${issue.slug}`);
        failed++;
      }
    }
    console.log(`\nFixed: ${fixed}, Failed: ${failed}`);
    if (failed > 0) {
      process.exit(1);
    }
  } else {
    // No --fix: exit 1 if any issues were found (standard lint convention)
    process.exit(1);
  }
}

export async function runList(raw: boolean): Promise<void> {
  if (raw) {
    const { listRawSources } = await import("./lib/raw");
    const sources = await listRawSources();
    const sorted = sources.sort((a, b) => a.slug.localeCompare(b.slug));
    for (const s of sorted) {
      console.log(`${s.slug}\t${s.filename}`);
    }
  } else {
    const { listWikiPages } = await import("./lib/wiki");
    const pages = await listWikiPages();
    const sorted = pages.sort((a, b) => a.title.localeCompare(b.title));
    for (const p of sorted) {
      console.log(`${p.slug}\t${p.title}`);
    }
  }
}

export async function runStatus(): Promise<void> {
  const { listWikiPages } = await import("./lib/wiki");
  const { listRawSources } = await import("./lib/raw");
  const { getEffectiveSettings } = await import("./lib/config");

  const pages = await listWikiPages();
  const sources = await listRawSources();
  const settings = getEffectiveSettings();

  console.log(`Wiki pages:\t${pages.length}`);
  console.log(`Raw sources:\t${sources.length}`);
  console.log(`LLM provider:\t${settings.provider ?? "not configured"}`);
  console.log(`Embeddings:\t${settings.embeddingSupport ? "available" : "not available"}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // argv[0] = node/tsx, argv[1] = script path, argv[2+] = user args
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  switch (parsed.command) {
    case "help":
      console.log(HELP);
      return;
    case "error":
      console.error(parsed.message);
      process.exit(1);
      break; // unreachable but satisfies linting
    case "ingest-url":
      await runIngestUrl(parsed.url);
      return;
    case "ingest-text":
      await runIngestText();
      return;
    case "reingest":
      await runReingest(parsed.slug);
      return;
    case "query":
      await runQuery(parsed.question);
      return;
    case "search":
      await runSearch(parsed.query, parsed.fuzzy, parsed.limit, parsed.scope);
      return;
    case "read":
      await runRead(parsed.slug);
      return;
    case "create":
      await runCreate(parsed.slug, parsed.title, parsed.tags);
      return;
    case "update":
      await runUpdate(parsed.slug, parsed.title, parsed.tags);
      return;
    case "delete":
      await runDelete(parsed.slug);
      return;
    case "lint":
      await runLint(parsed.fix);
      return;
    case "list":
      await runList(parsed.raw);
      return;
    case "status":
      await runStatus();
      return;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);

  // Friendly message for missing API key
  if (message.toLowerCase().includes("api key") || message.toLowerCase().includes("api_key")) {
    console.error(
      `Error: No LLM API key configured.\n\n` +
      `Set one of these environment variables:\n` +
      `  ANTHROPIC_API_KEY=sk-...\n` +
      `  OPENAI_API_KEY=sk-...\n` +
      `  GOOGLE_GENERATIVE_AI_API_KEY=...\n\n` +
      `Or configure a provider in the Settings UI (http://localhost:3000/settings).`,
    );
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
});

