import { readFile } from "fs/promises";
import path from "path";
import { isEnoent } from "./errors";

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
  try {
    const resolved = schemaPath ?? path.join(process.cwd(), "SCHEMA.md");
    const schema = await readFile(resolved, "utf-8");
    const startIdx = schema.indexOf("## Page conventions");
    if (startIdx === -1) return "";
    const afterStart = schema.slice(startIdx);
    // Find the next top-level section heading after the Page conventions one
    const nextHeadingMatch = afterStart
      .slice("## Page conventions".length)
      .match(/\n## /);
    const section = nextHeadingMatch
      ? afterStart.slice(
          0,
          "## Page conventions".length + nextHeadingMatch.index!,
        )
      : afterStart;
    return section.trim();
  } catch (err) {
    if (!isEnoent(err)) {
      console.warn("[schema] load page conventions failed:", err);
    }
    return "";
  }
}
