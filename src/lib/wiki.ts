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

/** Read a wiki page by slug. Returns `null` when the file doesn't exist. */
export async function readWikiPage(slug: string): Promise<WikiPage | null> {
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

/** Write (or overwrite) a wiki page. Ensures the wiki directory exists first. */
export async function writeWikiPage(
  slug: string,
  content: string,
): Promise<void> {
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

/** Save a raw source document and return its path. */
export async function saveRawSource(
  id: string,
  content: string,
): Promise<string> {
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
