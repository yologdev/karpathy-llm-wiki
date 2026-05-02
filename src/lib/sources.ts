// ---------------------------------------------------------------------------
// Structured provenance helpers for the `sources` frontmatter field.
//
// The frontmatter parser intentionally rejects nested YAML objects, so we
// store `sources` as a JSON-encoded string. These helpers serialize and
// parse that string, and build new SourceEntry objects.
// ---------------------------------------------------------------------------

import type { SourceEntry } from "./types";

/** Valid provenance types. */
const VALID_TYPES = new Set<SourceEntry["type"]>(["url", "text", "x-mention"]);

/**
 * Serialize a `SourceEntry[]` into a JSON string suitable for frontmatter.
 *
 * Returns `"[]"` for an empty array.
 */
export function serializeSources(sources: SourceEntry[]): string {
  return JSON.stringify(sources);
}

/**
 * Type-guard: returns true if `v` is a valid {@link SourceEntry} shape.
 */
function isSourceEntry(v: unknown): v is SourceEntry {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    VALID_TYPES.has(obj.type as SourceEntry["type"]) &&
    typeof obj.url === "string" &&
    typeof obj.fetched === "string" &&
    typeof obj.triggered_by === "string"
  );
}

/**
 * Parse a raw frontmatter value into a `SourceEntry[]`.
 *
 * Accepts:
 *  - A JSON string (produced by {@link serializeSources})
 *  - A string array (e.g. the frontmatter parser split inline `[…]`)
 *
 * Returns `[]` on invalid input rather than throwing — provenance should
 * degrade gracefully, not crash the page.
 */
export function parseSources(raw: string | string[] | undefined): SourceEntry[] {
  if (raw === undefined || raw === "") return [];

  let jsonStr: string;
  if (Array.isArray(raw)) {
    // The frontmatter inline-array parser may have split a JSON string on
    // commas. Re-join so we can parse the original JSON.
    jsonStr = raw.join(",");
  } else {
    jsonStr = raw;
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    // Filter to only valid entries — silently drop malformed ones.
    return parsed.filter(isSourceEntry);
  } catch {
    return [];
  }
}

/**
 * Build a fresh {@link SourceEntry} with sensible defaults.
 *
 * @param url        - Source URL or `"text-paste"` for pasted content.
 * @param type       - Provenance type. Defaults to `"url"`.
 * @param triggeredBy - Who triggered the ingest. Defaults to `"system"`.
 */
export function buildSourceEntry(
  url: string,
  type: SourceEntry["type"] = "url",
  triggeredBy = "system",
): SourceEntry {
  return {
    type,
    url,
    fetched: new Date().toISOString().slice(0, 10),
    triggered_by: triggeredBy,
  };
}
