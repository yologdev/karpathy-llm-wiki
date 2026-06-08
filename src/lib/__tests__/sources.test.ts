import { describe, it, expect, vi, afterEach } from "vitest";
import {
  serializeSources,
  parseSources,
  buildSourceEntry,
  newestSourceType,
  dedupeSourcesForDisplay,
} from "../sources";
import type { SourceEntry } from "../types";

describe("dedupeSourcesForDisplay", () => {
  const mk = (
    url: string,
    type: SourceEntry["type"],
    fetched = "2026-01-01",
  ): SourceEntry => ({ type, url, fetched, triggered_by: "system" });

  it("collapses the same URL even when the type differs, keeping the first", () => {
    const out = dedupeSourcesForDisplay([
      mk("https://arxiv.org/pdf/1.pdf", "pdf", "2026-06-07"),
      mk("https://arxiv.org/pdf/1.pdf", "url", "2026-06-08"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ url: "https://arxiv.org/pdf/1.pdf", type: "pdf" });
  });

  it("keeps distinct URLs", () => {
    const out = dedupeSourcesForDisplay([
      mk("https://a.com", "url"),
      mk("https://b.com", "url"),
    ]);
    expect(out.map((s) => s.url)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("keeps text-paste placeholders distinct per type", () => {
    const out = dedupeSourcesForDisplay([
      mk("text-paste", "text"),
      mk("text-paste", "x-mention"),
      mk("text-paste", "text"), // dup of the first → dropped
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.type)).toEqual(["text", "x-mention"]);
  });

  it("keeps distinct uploads separate by snapshot id (same 'upload' sentinel URL)", () => {
    const withRaw = (rawId: string): SourceEntry => ({
      type: "image",
      url: "upload",
      fetched: "2026-01-01",
      triggered_by: "system",
      raw_id: rawId,
    });
    const out = dedupeSourcesForDisplay([
      withRaw("hashA"),
      withRaw("hashB"),
      withRaw("hashA"), // dup → dropped
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.raw_id)).toEqual(["hashA", "hashB"]);
  });
});

describe("newestSourceType", () => {
  const mk = (type: SourceEntry["type"], fetched: string): SourceEntry => ({
    type,
    url: "u",
    fetched,
    triggered_by: "system",
  });

  it("returns undefined for an empty list", () => {
    expect(newestSourceType([])).toBeUndefined();
  });

  it("returns the only entry's type", () => {
    expect(newestSourceType([mk("pdf", "2026-06-01")])).toBe("pdf");
  });

  it("picks the type of the newest entry by fetched date", () => {
    const sources = [
      mk("text", "2026-05-01"),
      mk("pdf", "2026-06-07"),
      mk("url", "2026-05-20"),
    ];
    expect(newestSourceType(sources)).toBe("pdf");
  });
});

// ---------------------------------------------------------------------------
// serializeSources
// ---------------------------------------------------------------------------

describe("serializeSources", () => {
  it("serializes an empty array to '[]'", () => {
    expect(serializeSources([])).toBe("[]");
  });

  it("serializes a single entry", () => {
    const entry: SourceEntry = {
      type: "url",
      url: "https://example.com",
      fetched: "2026-05-01",
      triggered_by: "system",
    };
    const result = serializeSources([entry]);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(entry);
  });

  it("serializes multiple entries", () => {
    const entries: SourceEntry[] = [
      { type: "url", url: "https://a.com", fetched: "2026-01-01", triggered_by: "alice" },
      { type: "text", url: "text-paste", fetched: "2026-02-01", triggered_by: "system" },
      { type: "x-mention", url: "https://x.com/post/123", fetched: "2026-03-01", triggered_by: "@bob" },
    ];
    const result = serializeSources(entries);
    expect(JSON.parse(result)).toEqual(entries);
  });

  it("produces valid JSON that parseSources can read back", () => {
    const entries: SourceEntry[] = [
      { type: "url", url: "https://example.com/path?q=1&r=2", fetched: "2026-05-02", triggered_by: "system" },
    ];
    const serialized = serializeSources(entries);
    const roundTripped = parseSources(serialized);
    expect(roundTripped).toEqual(entries);
  });
});

// ---------------------------------------------------------------------------
// parseSources
// ---------------------------------------------------------------------------

describe("parseSources", () => {
  it("returns [] for undefined", () => {
    expect(parseSources(undefined)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseSources("")).toEqual([]);
  });

  it("returns [] for invalid JSON", () => {
    expect(parseSources("not json")).toEqual([]);
  });

  it("returns [] for JSON that is not an array", () => {
    expect(parseSources('{"type":"url"}')).toEqual([]);
  });

  it("returns [] for JSON array of non-objects", () => {
    expect(parseSources('["a","b"]')).toEqual([]);
  });

  it("parses valid JSON with one entry", () => {
    const entry: SourceEntry = {
      type: "url",
      url: "https://example.com",
      fetched: "2026-05-01",
      triggered_by: "system",
    };
    const result = parseSources(JSON.stringify([entry]));
    expect(result).toEqual([entry]);
  });

  it("filters out malformed entries (missing fields)", () => {
    const json = JSON.stringify([
      { type: "url", url: "https://good.com", fetched: "2026-01-01", triggered_by: "system" },
      { type: "url", url: "https://bad.com" }, // missing fetched + triggered_by
      { type: "url" }, // missing most fields
    ]);
    const result = parseSources(json);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://good.com");
  });

  it("filters out entries with invalid type", () => {
    const json = JSON.stringify([
      { type: "invalid", url: "https://bad.com", fetched: "2026-01-01", triggered_by: "system" },
      { type: "url", url: "https://good.com", fetched: "2026-01-01", triggered_by: "system" },
    ]);
    const result = parseSources(json);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://good.com");
  });

  it("handles string array input (from frontmatter parser splitting on commas)", () => {
    // The frontmatter parser sees `sources: [...]` and splits on commas.
    // parseSources re-joins and parses.
    const entry: SourceEntry = {
      type: "text",
      url: "text-paste",
      fetched: "2026-05-01",
      triggered_by: "system",
    };
    const json = JSON.stringify([entry]);
    // Simulate what the frontmatter inline-array parser does: split on commas
    const asArray = json.split(",");
    const result = parseSources(asArray);
    expect(result).toEqual([entry]);
  });

  it("returns [] for string array that doesn't form valid JSON", () => {
    expect(parseSources(["not", "valid", "json"])).toEqual([]);
  });

  it("accepts all three provenance types", () => {
    const entries: SourceEntry[] = [
      { type: "url", url: "https://a.com", fetched: "2026-01-01", triggered_by: "system" },
      { type: "text", url: "text-paste", fetched: "2026-02-01", triggered_by: "system" },
      { type: "x-mention", url: "https://x.com/post", fetched: "2026-03-01", triggered_by: "@user" },
    ];
    const result = parseSources(JSON.stringify(entries));
    expect(result).toEqual(entries);
  });
});

// ---------------------------------------------------------------------------
// buildSourceEntry
// ---------------------------------------------------------------------------

describe("buildSourceEntry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a url-type entry with defaults", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T10:00:00Z"));

    const entry = buildSourceEntry("https://example.com");
    expect(entry).toEqual({
      type: "url",
      url: "https://example.com",
      fetched: "2026-05-02",
      triggered_by: "system",
    });
    // No raw_id key when none is supplied (legacy-compatible shape).
    expect("raw_id" in entry).toBe(false);
  });

  it("includes raw_id when supplied, and round-trips through serialize/parse", () => {
    const entry = buildSourceEntry("https://example.com", "pdf", "yuanhao", "cafe1234");
    expect(entry.raw_id).toBe("cafe1234");
    const parsed = parseSources(serializeSources([entry]));
    expect(parsed[0].raw_id).toBe("cafe1234");
    expect(parsed[0].type).toBe("pdf");
  });

  it("builds a text-type entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T10:00:00Z"));

    const entry = buildSourceEntry("text-paste", "text");
    expect(entry).toEqual({
      type: "text",
      url: "text-paste",
      fetched: "2026-05-02",
      triggered_by: "system",
    });
  });

  it("builds an x-mention-type entry with custom triggeredBy", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T10:00:00Z"));

    const entry = buildSourceEntry("https://x.com/status/123", "x-mention", "@alice");
    expect(entry).toEqual({
      type: "x-mention",
      url: "https://x.com/status/123",
      fetched: "2026-05-02",
      triggered_by: "@alice",
    });
  });

  it("uses current date for fetched field", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-25T00:00:00Z"));

    const entry = buildSourceEntry("https://example.com");
    expect(entry.fetched).toBe("2025-12-25");
  });
});
