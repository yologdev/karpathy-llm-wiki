import { describe, it, expect, vi, afterEach } from "vitest";
import {
  serializeSources,
  parseSources,
  buildSourceEntry,
} from "../sources";
import type { SourceEntry } from "../types";

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
