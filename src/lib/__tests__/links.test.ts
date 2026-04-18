import { describe, it, expect } from "vitest";
import { escapeRegex, extractWikiLinks, hasLinkTo } from "../links";

describe("escapeRegex", () => {
  it("escapes all special regex characters", () => {
    const special = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(special);
    // Every special char should be preceded by a backslash
    expect(escaped).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
    // The escaped string should be usable in a RegExp without throwing
    expect(() => new RegExp(escaped)).not.toThrow();
  });

  it("passes through plain strings unchanged", () => {
    expect(escapeRegex("hello")).toBe("hello");
    expect(escapeRegex("foo-bar_baz")).toBe("foo-bar_baz");
  });

  it("handles empty string", () => {
    expect(escapeRegex("")).toBe("");
  });
});

describe("extractWikiLinks", () => {
  it("extracts a single [text](slug.md) link", () => {
    const content = "See [Machine Learning](machine-learning.md) for details.";
    const links = extractWikiLinks(content);
    expect(links).toEqual([
      { text: "Machine Learning", targetSlug: "machine-learning" },
    ]);
  });

  it("extracts multiple links from the same content", () => {
    const content =
      "Read [AI](ai.md) and [Deep Learning](deep-learning.md) pages.";
    const links = extractWikiLinks(content);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ text: "AI", targetSlug: "ai" });
    expect(links[1]).toEqual({
      text: "Deep Learning",
      targetSlug: "deep-learning",
    });
  });

  it("handles slugs with hyphens and underscores", () => {
    const content = "[A Page](some_slug-name.md)";
    const links = extractWikiLinks(content);
    expect(links).toEqual([
      { text: "A Page", targetSlug: "some_slug-name" },
    ]);
  });

  it("returns empty array when no links are present", () => {
    expect(extractWikiLinks("Just plain text.")).toEqual([]);
    expect(extractWikiLinks("")).toEqual([]);
  });

  it("does NOT match non-.md links", () => {
    const content = "[Example](https://example.com)";
    expect(extractWikiLinks(content)).toEqual([]);
  });

  it("does NOT match bare text without link syntax", () => {
    const content = "something.md is mentioned but not linked";
    expect(extractWikiLinks(content)).toEqual([]);
  });
});

describe("hasLinkTo", () => {
  it("returns true when content contains a link to the slug", () => {
    const content = "See [Transformers](transformers.md) for more info.";
    expect(hasLinkTo(content, "transformers")).toBe(true);
  });

  it("returns false when slug appears in prose but not as a link", () => {
    const content = "The transformers architecture is powerful.";
    expect(hasLinkTo(content, "transformers")).toBe(false);
  });

  it("returns false when content is empty", () => {
    expect(hasLinkTo("", "anything")).toBe(false);
  });

  it("handles slugs with special regex characters", () => {
    // Slug containing chars that are special in regex
    const content = "See [C++](c++.md) for details.";
    expect(hasLinkTo(content, "c++")).toBe(true);
    // Should not false-positive on similar but different content
    expect(hasLinkTo("See [Cpp](cpp.md) page.", "c++")).toBe(false);
  });

  it("does not match partial slug in link", () => {
    const content = "See [Foobar](foobar.md) page.";
    // "foo" should not match "foobar.md"
    expect(hasLinkTo(content, "foo")).toBe(false);
  });
});
