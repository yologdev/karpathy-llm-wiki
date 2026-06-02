import { describe, it, expect } from "vitest";
import { slugify, decodeSlug } from "../slugify";

describe("slugify", () => {
  it("converts a basic title to a slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("collapses consecutive special chars into a single hyphen", () => {
    expect(slugify("hello--world")).toBe("hello-world");
    expect(slugify("hello---world")).toBe("hello-world");
    expect(slugify("hello - world")).toBe("hello-world");
    expect(slugify("foo!!bar$$baz")).toBe("foo-bar-baz");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("---leading")).toBe("leading");
    expect(slugify("trailing---")).toBe("trailing");
    expect(slugify("!hello!")).toBe("hello");
  });

  it("trims surrounding whitespace before processing", () => {
    expect(slugify("  hello  ")).toBe("hello");
    expect(slugify("  spaced out  ")).toBe("spaced-out");
    expect(slugify("\thello\n")).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("---")).toBe("");
  });

  it("passes through an already-valid slug unchanged", () => {
    expect(slugify("already-valid")).toBe("already-valid");
    expect(slugify("abc123")).toBe("abc123");
  });

  it("handles numeric-only titles", () => {
    expect(slugify("2024")).toBe("2024");
    expect(slugify("42 is the answer")).toBe("42-is-the-answer");
  });

  it("handles mixed case and special characters", () => {
    expect(slugify("Transformer Architecture")).toBe("transformer-architecture");
    expect(slugify("What is GPT-4?")).toBe("what-is-gpt-4");
    expect(slugify("C++ & Rust: A Comparison")).toBe("c-rust-a-comparison");
  });

  it("preserves CJK characters (Chinese titles no longer collapse to empty)", () => {
    expect(slugify("知识库")).toBe("知识库");
    expect(slugify("大语言模型")).toBe("大语言模型");
  });

  it("keeps CJK while hyphenating around Latin/punctuation", () => {
    expect(slugify("RAG 检索增强生成")).toBe("rag-检索增强生成");
    expect(slugify("你好 World")).toBe("你好-world");
  });
});

describe("decodeSlug", () => {
  it("decodes a percent-encoded CJK slug from a URL path", () => {
    expect(decodeSlug("%E7%9F%A5%E8%AF%86%E5%BA%93")).toBe("知识库");
  });

  it("is a no-op for already-decoded slugs", () => {
    expect(decodeSlug("知识库")).toBe("知识库");
    expect(decodeSlug("llm-wiki")).toBe("llm-wiki");
  });

  it("falls back to the raw value on malformed encoding", () => {
    expect(decodeSlug("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
