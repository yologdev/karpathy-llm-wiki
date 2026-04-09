import { describe, it, expect } from "vitest";
import { convertToObsidianLinks } from "../export";

describe("convertToObsidianLinks", () => {
  it("converts a basic internal link", () => {
    expect(convertToObsidianLinks("[Title](slug.md)")).toBe("[[slug|Title]]");
  });

  it("does not convert external URLs", () => {
    const input = "[Google](https://google.com)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("does not convert external URLs ending in .md", () => {
    const input = "[Docs](https://example.com/readme.md)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("converts multiple links on one line", () => {
    const input = "See [Alpha](alpha.md) and [Beta](beta.md) for details.";
    expect(convertToObsidianLinks(input)).toBe(
      "See [[alpha|Alpha]] and [[beta|Beta]] for details.",
    );
  });

  it("handles slugs with hyphens", () => {
    expect(convertToObsidianLinks("[My Page](my-page.md)")).toBe(
      "[[my-page|My Page]]",
    );
  });

  it("handles single-character slugs", () => {
    expect(convertToObsidianLinks("[X](x.md)")).toBe("[[x|X]]");
  });

  it("does not convert image embeds", () => {
    const input = "![diagram](arch.md)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("leaves non-.md internal links alone", () => {
    const input = "[File](data.json)";
    expect(convertToObsidianLinks(input)).toBe(input);
  });

  it("preserves YAML frontmatter", () => {
    const input = `---
title: Test
tags: [ai, ml]
---

# Test

See [Related](related.md).`;
    const expected = `---
title: Test
tags: [ai, ml]
---

# Test

See [[related|Related]].`;
    expect(convertToObsidianLinks(input)).toBe(expected);
  });
});
