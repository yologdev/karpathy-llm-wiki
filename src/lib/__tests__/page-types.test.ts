import { describe, it, expect } from "vitest";
import {
  isAgentScopedType,
  isArtifactType,
  selectFeaturedArtifacts,
} from "../page-types";
import type { IndexEntry } from "../types";

describe("isArtifactType", () => {
  it("is true only for html/slides", () => {
    expect(isArtifactType("html")).toBe(true);
    expect(isArtifactType("slides")).toBe(true);
    expect(isArtifactType("agent-knowledge")).toBe(false);
    expect(isArtifactType(undefined)).toBe(false);
  });
});

describe("isAgentScopedType", () => {
  it("is true for any agent-* type", () => {
    expect(isAgentScopedType("agent-identity")).toBe(true);
    expect(isAgentScopedType("html")).toBe(false);
    expect(isAgentScopedType(undefined)).toBe(false);
  });
});

function entry(over: Partial<IndexEntry>): IndexEntry {
  return {
    slug: over.slug ?? "s",
    title: over.title ?? "T",
    summary: over.summary ?? "",
    owner: "alice", // a human owner by default; override to test the filter
    ...over,
  };
}

describe("selectFeaturedArtifacts", () => {
  it("keeps only html/slides artifacts, dropping non-artifacts", () => {
    const out = selectFeaturedArtifacts([
      entry({ slug: "a", type: "html" }),
      entry({ slug: "b", type: "slides" }),
      entry({ slug: "c", type: undefined }), // a synthesized commons page
      entry({ slug: "d", type: "agent-knowledge" }),
    ]);
    expect(out.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("NEVER surfaces a private artifact (the homepage is public + cached)", () => {
    const out = selectFeaturedArtifacts([
      entry({ slug: "pub", type: "html", visibility: "public" }),
      entry({ slug: "secret", type: "html", visibility: "private" }),
      entry({ slug: "default", type: "slides" }), // no visibility → public
    ]);
    expect(out.map((p) => p.slug)).toEqual(["pub", "default"]);
    expect(out.some((p) => p.slug === "secret")).toBe(false);
  });

  it("never leaks a private artifact even when it's newest and over the limit", () => {
    // The private artifacts are the NEWEST and the list overflows `limit`. A
    // filter-AFTER-slice refactor would take them into the cut, then drop them —
    // leaving the gallery short or empty. The filter must precede the slice, so
    // the result is exactly the public set, no private leak.
    const pages = [
      ...Array.from({ length: 6 }, (_, i) =>
        entry({
          slug: `priv${i}`,
          type: "html",
          visibility: "private",
          updated: `2026-09-1${i}`,
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        entry({ slug: `pub${i}`, type: "html", updated: `2026-01-1${i}` }),
      ),
    ];
    const out = selectFeaturedArtifacts(pages, 4);
    expect(out.some((p) => p.slug.startsWith("priv"))).toBe(false);
    expect(out.map((p) => p.slug)).toEqual(["pub2", "pub1", "pub0"]);
  });

  it("features only HUMAN-made artifacts — excludes agents, automation, unattributed", () => {
    const out = selectFeaturedArtifacts([
      entry({ slug: "human", type: "html", owner: "alice" }),
      entry({ slug: "agent", type: "html", owner: "alice--yoyo" }),
      entry({ slug: "bare-agent", type: "html", owner: "yoyo" }),
      entry({ slug: "system", type: "html", owner: "system" }),
      entry({ slug: "anon", type: "html", owner: undefined }),
    ]);
    expect(out.map((p) => p.slug)).toEqual(["human"]);
  });

  it("sorts newest-updated first", () => {
    const out = selectFeaturedArtifacts([
      entry({ slug: "old", type: "html", updated: "2026-01-01" }),
      entry({ slug: "new", type: "html", updated: "2026-06-01" }),
      entry({ slug: "mid", type: "html", updated: "2026-03-01" }),
    ]);
    expect(out.map((p) => p.slug)).toEqual(["new", "mid", "old"]);
  });

  it("treats a missing `updated` as oldest (sorts last)", () => {
    const out = selectFeaturedArtifacts([
      entry({ slug: "dated", type: "html", updated: "2026-01-01" }),
      entry({ slug: "undated", type: "html" }),
    ]);
    expect(out.map((p) => p.slug)).toEqual(["dated", "undated"]);
  });

  it("caps at the limit (default 6)", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      entry({ slug: `a${i}`, type: "html", updated: `2026-01-0${i}` }),
    );
    expect(selectFeaturedArtifacts(many)).toHaveLength(6);
    expect(selectFeaturedArtifacts(many, 3)).toHaveLength(3);
  });

  it("returns an empty array when there are no artifacts", () => {
    expect(
      selectFeaturedArtifacts([entry({ slug: "x", type: undefined })]),
    ).toEqual([]);
  });
});
