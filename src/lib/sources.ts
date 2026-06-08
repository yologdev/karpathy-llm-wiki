// ---------------------------------------------------------------------------
// Structured provenance helpers for the `sources` frontmatter field.
//
// The frontmatter parser intentionally rejects nested YAML objects, so we
// store `sources` as a JSON-encoded string. These helpers serialize and
// parse that string, and build new SourceEntry objects.
// ---------------------------------------------------------------------------

import type { SourceEntry } from "./types";

/** Valid provenance types. */
const VALID_TYPES = new Set<SourceEntry["type"]>(["url", "text", "x-mention", "wiki-ref", "image", "pdf", "youtube"]);

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
 * Collapse duplicate sources for DISPLAY — a real (http/https) source is the
 * same source if it shares a URL, even if a past ingest recorded it under a
 * different type; the first occurrence wins. Sentinel "URLs" (`text-paste`,
 * `upload`) carry no real address, so they're distinguished by their snapshot
 * id (falling back to type) — distinct pastes/uploads stay separate.
 *
 * Display-only: never use this where the full `sources[]` is needed (the ingest
 * merge dedups at write time on its own).
 */
export function dedupeSourcesForDisplay(sources: SourceEntry[]): SourceEntry[] {
  const seen = new Set<string>();
  const out: SourceEntry[] = [];
  for (const s of sources) {
    const isHttp = /^https?:\/\//i.test(s.url);
    const key = isHttp ? s.url : `${s.url}:${s.raw_id ?? s.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Build a fresh {@link SourceEntry} with sensible defaults.
 *
 * @param url        - Source URL or `"text-paste"` for pasted content.
 * @param type       - Provenance type. Defaults to `"url"`.
 * @param triggeredBy - Who triggered the ingest. Defaults to `"system"`.
 */
/**
 * The `type` of the newest source entry (by `fetched` date), or `undefined` for
 * an empty list. Used to tag a freshly-ingested page's trail event with its
 * source chip. `fetched` is `YYYY-MM-DD`, so lexicographic compare is date order.
 */
export function newestSourceType(
  sources: SourceEntry[],
): SourceEntry["type"] | undefined {
  return sources.reduce(
    (newest, s) => (newest && newest.fetched >= s.fetched ? newest : s),
    sources[0] as SourceEntry | undefined,
  )?.type;
}

export function buildSourceEntry(
  url: string,
  type: SourceEntry["type"] = "url",
  triggeredBy = "system",
  rawId?: string,
): SourceEntry {
  return {
    type,
    url,
    fetched: new Date().toISOString().slice(0, 10),
    triggered_by: triggeredBy,
    ...(rawId ? { raw_id: rawId } : {}),
  };
}
