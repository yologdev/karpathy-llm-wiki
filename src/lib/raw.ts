import fs from "fs/promises";
import path from "path";
import { getRawDir, validateSlug, ensureDirectories } from "./wiki";

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
// Raw source browsing (read-only)
// ---------------------------------------------------------------------------

/**
 * A lightweight descriptor for a file sitting in `raw/`. `slug` is the
 * filename with the final extension stripped, matching the identity that
 * {@link saveRawSource} uses when it writes a file.
 */
export interface RawSource {
  /** Filename without the final extension. Usable as a URL path segment. */
  slug: string;
  /** Original filename including extension, e.g. `llm-wiki-pattern.md`. */
  filename: string;
  /** Size in bytes. */
  size: number;
  /** Last-modified time as an ISO 8601 string. */
  modified: string;
}

/** A raw source plus its full content. Returned by {@link readRawSource}. */
export interface RawSourceWithContent extends RawSource {
  content: string;
}

/**
 * Strip the final extension from a filename. Leading dots (dotfiles) are
 * preserved verbatim — we never treat `.hidden` as having an extension of
 * `hidden`. Returns the input unchanged when there is no extension.
 */
function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  // Guard against dotfiles (`.env`) and extension-less names (`README`).
  if (lastDot <= 0) return filename;
  return filename.slice(0, lastDot);
}

/**
 * List every file currently sitting in `raw/`, newest first.
 *
 * - Non-recursive: `raw/` is flat by convention.
 * - Skips dotfiles and subdirectories.
 * - Returns `[]` (rather than throwing) when `raw/` does not yet exist,
 *   so a fresh checkout with no ingested sources renders cleanly.
 */
export async function listRawSources(): Promise<RawSource[]> {
  const rawDir = getRawDir();
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(rawDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const sources: RawSource[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".")) continue;

    const filePath = path.join(rawDir, entry.name);
    const stat = await fs.stat(filePath);
    sources.push({
      slug: stripExtension(entry.name),
      filename: entry.name,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  }

  // Newest first — most-recently-ingested at the top of the browser.
  sources.sort((a, b) => (a.modified < b.modified ? 1 : -1));
  return sources;
}

/**
 * Read a single raw source by slug (the filename without its final
 * extension). Returns the file's content along with the same metadata
 * {@link listRawSources} produces.
 *
 * Safety model: we do NOT build a path from the slug directly. Instead we
 * list `raw/`, match the slug against the stripped-extension form of each
 * real entry, and only then `readFile` the matched entry. A path-traversal
 * slug like `../../etc/passwd` can never match a file inside `raw/`, so it
 * falls through to the "not found" throw. The `validateSlug` guard provides
 * a second layer of defence before we ever touch the filesystem.
 *
 * @throws {Error} when the slug is invalid or no matching file exists.
 */
export async function readRawSource(
  slug: string,
): Promise<RawSourceWithContent> {
  validateSlug(slug);

  const sources = await listRawSources();
  const match = sources.find((s) => s.slug === slug);
  if (!match) {
    throw new Error(`raw source not found: ${slug}`);
  }

  const filePath = path.join(getRawDir(), match.filename);
  const content = await fs.readFile(filePath, "utf-8");

  return { ...match, content };
}
