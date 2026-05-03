import { readFile } from "fs/promises";
import { isEnoent } from "./errors";
import { logger } from "./logger";

/**
 * Extract a `## <heading>` section from SCHEMA.md content.
 *
 * Returns the text from the heading up to (but not including) the next
 * `## ` heading. Returns empty string if the heading can't be found.
 */
function extractSection(schema: string, heading: string): string {
  const startIdx = schema.indexOf(heading);
  if (startIdx === -1) return "";
  const afterStart = schema.slice(startIdx);
  const nextHeadingMatch = afterStart.slice(heading.length).match(/\n## /);
  const section = nextHeadingMatch
    ? afterStart.slice(0, heading.length + nextHeadingMatch.index!)
    : afterStart;
  return section.trim();
}

/**
 * Read SCHEMA.md from disk.
 *
 * Returns the full file content, or empty string if SCHEMA.md is missing.
 * Accepts an optional `schemaPath` override for tests; defaults to
 * `<cwd>/SCHEMA.md`.
 */
async function readSchema(schemaPath?: string): Promise<string> {
  try {
    const resolved = schemaPath ?? `${process.cwd()}/SCHEMA.md`;
    return await readFile(resolved, "utf-8");
  } catch (err) {
    if (!isEnoent(err)) {
      logger.warn("schema", "read SCHEMA.md failed:", err);
    }
    return "";
  }
}

/**
 * Load the "Page conventions" section from `SCHEMA.md`.
 *
 * SCHEMA.md is the single source of truth for how wiki pages should be
 * structured. Loading it at runtime means the prompt evolves with the doc —
 * no code change needed to tweak conventions. The schema IS the source of
 * truth — change the doc, change ingest behavior on the next call.
 *
 * Extracts from the `## Page conventions` heading up to (but not including)
 * the next `## ` heading. Returns empty string if SCHEMA.md is missing or
 * the section can't be found, so ingest degrades gracefully rather than
 * crashing on a fresh clone.
 *
 * Accepts an optional `schemaPath` override for tests; defaults to
 * `<cwd>/SCHEMA.md`.
 */
export async function loadPageConventions(
  schemaPath?: string,
): Promise<string> {
  const schema = await readSchema(schemaPath);
  if (!schema) return "";
  return extractSection(schema, "## Page conventions");
}

/**
 * Load the "Page templates" section from `SCHEMA.md`.
 *
 * Returns the full `## Page templates` section including sub-headings
 * (source summary, entity page, concept page, comparison page).
 * This allows ingest and query prompts to load templates at runtime so
 * the LLM can generate pages that follow the documented structure.
 *
 * Returns empty string if SCHEMA.md is missing or the section can't be
 * found, so callers degrade gracefully.
 *
 * Accepts an optional `schemaPath` override for tests; defaults to
 * `<cwd>/SCHEMA.md`.
 */
export async function loadPageTemplates(
  schemaPath?: string,
): Promise<string> {
  const schema = await readSchema(schemaPath);
  if (!schema) return "";
  return extractSection(schema, "## Page templates");
}
