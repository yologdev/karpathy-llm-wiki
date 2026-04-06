import fs from "fs/promises";
import path from "path";
import type { WikiPage, IndexEntry } from "./types";

// ---------------------------------------------------------------------------
// Configurable base directories — override via env vars for testing
// ---------------------------------------------------------------------------

export function getWikiDir(): string {
  return process.env.WIKI_DIR ?? path.join(process.cwd(), "wiki");
}

export function getRawDir(): string {
  return process.env.RAW_DIR ?? path.join(process.cwd(), "raw");
}

// ---------------------------------------------------------------------------
// Slug validation — path traversal protection
// ---------------------------------------------------------------------------

/** Safe slug pattern: lowercase alphanumeric, may contain hyphens, cannot start/end with hyphen. */
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

/**
 * Validate that a slug is safe to use as a filename inside the wiki/raw dirs.
 *
 * Rejects empty strings, path traversal attempts (`..`, `/`, `\`), null bytes,
 * and anything that doesn't match the safe pattern.
 *
 * @throws {Error} with a descriptive message when the slug is invalid.
 */
export function validateSlug(slug: string): void {
  if (typeof slug !== "string" || slug.trim().length === 0) {
    throw new Error("Invalid slug: must be a non-empty string");
  }
  if (slug.includes("\0")) {
    throw new Error("Invalid slug: must not contain null bytes");
  }
  if (slug.includes("/") || slug.includes("\\")) {
    throw new Error("Invalid slug: must not contain path separators");
  }
  if (slug.includes("..")) {
    throw new Error("Invalid slug: must not contain path traversal (..)")
  }
  if (!SAFE_SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid slug: "${slug}" does not match the safe pattern (lowercase alphanumeric and hyphens, cannot start or end with hyphen)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/** Create the `raw/` and `wiki/` directories if they don't already exist. */
export async function ensureDirectories(): Promise<void> {
  await fs.mkdir(getWikiDir(), { recursive: true });
  await fs.mkdir(getRawDir(), { recursive: true });
}

// ---------------------------------------------------------------------------
// Wiki page I/O
// ---------------------------------------------------------------------------

/** Read a wiki page by slug. Returns `null` when the file doesn't exist or the slug is invalid. */
export async function readWikiPage(slug: string): Promise<WikiPage | null> {
  try {
    validateSlug(slug);
  } catch {
    return null;
  }
  const filePath = path.join(getWikiDir(), `${slug}.md`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    // Derive title from the first markdown heading, falling back to the slug.
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;
    return { slug, title, content, path: filePath };
  } catch {
    return null;
  }
}

/** Write (or overwrite) a wiki page. Ensures the wiki directory exists first. Throws on invalid slug. */
export async function writeWikiPage(
  slug: string,
  content: string,
): Promise<void> {
  validateSlug(slug);
  await ensureDirectories();
  const filePath = path.join(getWikiDir(), `${slug}.md`);
  await fs.writeFile(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Index management
// ---------------------------------------------------------------------------

/**
 * Parse `wiki/index.md` and return its entries.
 * Returns an empty array when the file doesn't exist.
 *
 * Expected format per line:
 *   - [Title](slug.md) — summary
 */
export async function listWikiPages(): Promise<IndexEntry[]> {
  const indexPath = path.join(getWikiDir(), "index.md");
  let raw: string;
  try {
    raw = await fs.readFile(indexPath, "utf-8");
  } catch {
    return [];
  }

  const entries: IndexEntry[] = [];
  const lineRe = /^-\s+\[(.+?)]\((.+?)\.md\)\s*—\s*(.+)$/;

  for (const line of raw.split("\n")) {
    const m = line.match(lineRe);
    if (m) {
      entries.push({ title: m[1], slug: m[2], summary: m[3].trim() });
    }
  }
  return entries;
}

/**
 * Write `wiki/index.md` from an array of entries.
 *
 * Format:
 * ```
 * # Wiki Index
 *
 * - [Title](slug.md) — summary
 * ```
 */
export async function updateIndex(entries: IndexEntry[]): Promise<void> {
  await ensureDirectories();
  const lines = entries.map(
    (e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`,
  );
  const content = `# Wiki Index\n\n${lines.join("\n")}\n`;
  const indexPath = path.join(getWikiDir(), "index.md");
  await fs.writeFile(indexPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Raw source storage
// ---------------------------------------------------------------------------

/** Save a raw source document and return its path. Throws on invalid id. */
export async function saveRawSource(
  id: string,
  content: string,
): Promise<string> {
  validateSlug(id);
  await ensureDirectories();
  const filePath = path.join(getRawDir(), `${id}.md`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Append-only log
// ---------------------------------------------------------------------------

/** Append a timestamped line to `wiki/log.md`. */
export async function appendToLog(entry: string): Promise<void> {
  await ensureDirectories();
  const logPath = path.join(getWikiDir(), "log.md");
  const timestamp = new Date().toISOString();
  await fs.appendFile(logPath, `[${timestamp}] ${entry}\n`, "utf-8");
}

/** Read the contents of `wiki/log.md`. Returns `null` if the file doesn't exist. */
export async function readLog(): Promise<string | null> {
  const logPath = path.join(getWikiDir(), "log.md");
  try {
    return await fs.readFile(logPath, "utf-8");
  } catch {
    return null;
  }
}
