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
