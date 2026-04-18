import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter";

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------
describe("parseFrontmatter", () => {
  // --- No frontmatter -------------------------------------------------
  describe("no frontmatter", () => {
    it("returns empty data and full body when no `---` marker", () => {
      const text = "Hello world\nSecond line";
      const { data, body } = parseFrontmatter(text);
      expect(data).toEqual({});
      expect(body).toBe(text);
    });

    it("handles empty string", () => {
      const { data, body } = parseFrontmatter("");
      expect(data).toEqual({});
      expect(body).toBe("");
    });

    it('handles `---` on its own (no newline)', () => {
      // The string "---" with no trailing newline matches `content === "---"`
      // special case. The parser treats this as an empty frontmatter block
      // (the `---` itself serves as both opener and closer).
      const { data, body } = parseFrontmatter("---");
      expect(data).toEqual({});
      expect(body).toBe("");
    });

    it("does not treat `---` mid-document as frontmatter", () => {
      const text = "some text\n---\ntitle: hi\n---\n";
      const { data, body } = parseFrontmatter(text);
      expect(data).toEqual({});
      expect(body).toBe(text);
    });
  });

  // --- Basic scalars ---------------------------------------------------
  describe("basic scalar values", () => {
    it("parses key: value pairs", () => {
      const text = "---\ntitle: My Page\nauthor: Alice\n---\nBody text";
      const { data, body } = parseFrontmatter(text);
      expect(data).toEqual({ title: "My Page", author: "Alice" });
      expect(body).toBe("Body text");
    });

    it("trims whitespace around values", () => {
      const text = "---\ntitle:   hello   \n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.title).toBe("hello");
    });
  });

  // --- Quoted scalars --------------------------------------------------
  describe("quoted scalar values", () => {
    it("strips double quotes", () => {
      const text = '---\ntitle: "My Page"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.title).toBe("My Page");
    });

    it("strips single quotes", () => {
      const text = "---\ntitle: 'My Page'\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.title).toBe("My Page");
    });

    it("unescapes backslash-escaped double quotes", () => {
      const text = '---\ntitle: "She said \\"hi\\""\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.title).toBe('She said "hi"');
    });
  });

  // --- Values containing colons ----------------------------------------
  describe("values containing colons", () => {
    it("parses quoted value with colons", () => {
      const text = '---\nurl: "http://example.com"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.url).toBe("http://example.com");
    });

    it("splits at first colon for unquoted values", () => {
      // Unquoted value with colon — only the first colon is the delimiter
      const text = "---\nnote: a:b:c\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.note).toBe("a:b:c");
    });
  });

  // --- Inline arrays ---------------------------------------------------
  describe("inline arrays", () => {
    it("parses [a, b, c]", () => {
      const text = "---\ntags: [a, b, c]\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.tags).toEqual(["a", "b", "c"]);
    });

    it("parses empty array []", () => {
      const text = "---\ntags: []\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.tags).toEqual([]);
    });

    it("parses single element array", () => {
      const text = "---\ntags: [only]\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.tags).toEqual(["only"]);
    });

    it("handles varying whitespace in arrays", () => {
      const text = "---\ntags: [  a ,b,  c  ]\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.tags).toEqual(["a", "b", "c"]);
    });

    it("handles quoted elements with embedded commas", () => {
      const text = '---\ntags: [a, "b, c", d]\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.tags).toEqual(["a", "b, c", "d"]);
    });

    it("handles single-quoted elements in arrays", () => {
      const text = "---\ntags: [a, 'b, c', d]\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.tags).toEqual(["a", "b, c", "d"]);
    });
  });

  // --- Empty frontmatter -----------------------------------------------
  describe("empty frontmatter block", () => {
    it("returns empty data with ---\\n---", () => {
      const text = "---\n---\nBody here";
      const { data, body } = parseFrontmatter(text);
      expect(data).toEqual({});
      expect(body).toBe("Body here");
    });

    it("handles blank line after closing delimiter", () => {
      const text = "---\ntitle: hi\n---\n\nBody here";
      const { data, body } = parseFrontmatter(text);
      expect(data.title).toBe("hi");
      expect(body).toBe("Body here");
    });
  });

  // --- Empty values ----------------------------------------------------
  describe("empty values", () => {
    it("treats bare `key:` as empty string", () => {
      const text = "---\ntitle:\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.title).toBe("");
    });

    it("treats `key:` with only whitespace after as empty string", () => {
      const text = "---\ntitle:   \n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.title).toBe("");
    });
  });

  // --- Comments --------------------------------------------------------
  describe("comments in frontmatter", () => {
    it("skips lines starting with #", () => {
      const text = "---\n# This is a comment\ntitle: hi\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data).toEqual({ title: "hi" });
      expect(data).not.toHaveProperty("#");
    });
  });

  // --- Blank lines within frontmatter ---------------------------------
  describe("blank lines within frontmatter", () => {
    it("skips blank lines between fields", () => {
      const text = "---\ntitle: hi\n\nauthor: Bob\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data).toEqual({ title: "hi", author: "Bob" });
    });
  });

  // --- Windows-style line endings --------------------------------------
  describe("windows-style line endings", () => {
    it("handles \\r\\n line endings", () => {
      const text = "---\r\ntitle: hi\r\n---\r\nBody";
      const { data, body } = parseFrontmatter(text);
      expect(data.title).toBe("hi");
      expect(body).toBe("Body");
    });
  });

  // --- Error cases -----------------------------------------------------
  describe("error cases", () => {
    it("throws on missing closing delimiter", () => {
      const text = "---\ntitle: hi\nno closing";
      expect(() => parseFrontmatter(text)).toThrow("missing closing");
    });

    it("throws on indented/nested values", () => {
      const text = "---\nparent:\n  child: value\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("nested objects");
    });

    it("throws on block arrays", () => {
      const text = "---\ntags:\n- item1\n- item2\n---\nBody";
      // The `- item1` line triggers the "block arrays" check (it's indented
      // so "indented/nested" fires first). Either error is acceptable.
      expect(() => parseFrontmatter(text)).toThrow();
    });

    it("throws on block scalar |", () => {
      const text = "---\ndesc: |\n  multi\n  line\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("block scalars");
    });

    it("throws on block scalar >", () => {
      const text = "---\ndesc: >\n  folded\n  text\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("block scalars");
    });

    it("throws on YAML anchors (&)", () => {
      const text = "---\nval: &anchor hello\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("anchors");
    });

    it("throws on YAML aliases (*)", () => {
      const text = "---\nval: *anchor\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("anchors");
    });

    it("throws on malformed inline array (missing ])", () => {
      const text = "---\ntags: [a, b\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("malformed inline array");
    });

    it("throws on empty key", () => {
      const text = "---\n: value\n---\nBody";
      expect(() => parseFrontmatter(text)).toThrow("empty key");
    });

    it("throws on unterminated quoted string in array", () => {
      const text = '---\ntags: [a, "b, c]\n---\nBody';
      expect(() => parseFrontmatter(text)).toThrow("unterminated");
    });
  });
});

// ---------------------------------------------------------------------------
// serializeFrontmatter
// ---------------------------------------------------------------------------
describe("serializeFrontmatter", () => {
  // --- Empty data → body only ------------------------------------------
  it("returns body only when data is empty", () => {
    const result = serializeFrontmatter({}, "Hello body");
    expect(result).toBe("Hello body");
  });

  it("returns body only when data has no keys", () => {
    const result = serializeFrontmatter({}, "");
    expect(result).toBe("");
  });

  // --- Plain scalars ---------------------------------------------------
  it("serializes simple scalar values without quoting", () => {
    const result = serializeFrontmatter({ title: "My Page" }, "Body");
    expect(result).toBe("---\ntitle: My Page\n---\n\nBody");
  });

  // --- Quoting rules ---------------------------------------------------
  describe("scalar quoting", () => {
    it("quotes values containing colons", () => {
      const result = serializeFrontmatter({ url: "http://example.com" }, "");
      expect(result).toContain('url: "http://example.com"');
    });

    it("quotes values starting with [", () => {
      const result = serializeFrontmatter({ note: "[not an array]" }, "");
      expect(result).toContain('note: "[not an array]"');
    });

    it('quotes values starting with "', () => {
      const result = serializeFrontmatter({ note: '"quoted"' }, "");
      // The inner quotes are escaped
      expect(result).toContain('note: "\\"quoted\\""');
    });

    it("quotes values starting with '", () => {
      const result = serializeFrontmatter({ note: "'single'" }, "");
      expect(result).toContain("note: \"'single'\"");
    });

    it("quotes values starting with #", () => {
      const result = serializeFrontmatter({ note: "# heading" }, "");
      expect(result).toContain('note: "# heading"');
    });

    it("quotes values starting with &", () => {
      const result = serializeFrontmatter({ note: "&anchor" }, "");
      expect(result).toContain('note: "&anchor"');
    });

    it("quotes values starting with *", () => {
      const result = serializeFrontmatter({ note: "*alias" }, "");
      expect(result).toContain('note: "*alias"');
    });

    it("quotes values with leading whitespace", () => {
      const result = serializeFrontmatter({ note: "  padded" }, "");
      expect(result).toContain('note: "  padded"');
    });

    it("quotes values with trailing whitespace", () => {
      const result = serializeFrontmatter({ note: "padded  " }, "");
      expect(result).toContain('note: "padded  "');
    });
  });

  // --- Array serialization ---------------------------------------------
  describe("array serialization", () => {
    it("serializes arrays as inline arrays", () => {
      const result = serializeFrontmatter({ tags: ["a", "b", "c"] }, "");
      expect(result).toContain("tags: [a, b, c]");
    });

    it("quotes array elements containing commas", () => {
      const result = serializeFrontmatter({ tags: ["a", "b, c"] }, "");
      expect(result).toContain('tags: [a, "b, c"]');
    });

    it("quotes array elements containing double quotes", () => {
      const result = serializeFrontmatter({ tags: ['say "hi"'] }, "");
      expect(result).toContain('tags: ["say \\"hi\\""]');
    });

    it("quotes array elements containing brackets", () => {
      const result = serializeFrontmatter({ tags: ["[x]", "y"] }, "");
      expect(result).toContain('tags: ["[x]", y]');
    });

    it("quotes empty string array elements", () => {
      const result = serializeFrontmatter({ tags: [""] }, "");
      expect(result).toContain('tags: [""]');
    });

    it("quotes array elements with leading/trailing whitespace", () => {
      const result = serializeFrontmatter({ tags: [" spaced "] }, "");
      expect(result).toContain('tags: [" spaced "]');
    });

    it("serializes empty array", () => {
      const result = serializeFrontmatter({ tags: [] }, "");
      expect(result).toContain("tags: []");
    });
  });

  // --- Output structure ------------------------------------------------
  it("separates frontmatter and body with a blank line", () => {
    const result = serializeFrontmatter({ title: "hi" }, "Body text");
    expect(result).toBe("---\ntitle: hi\n---\n\nBody text");
  });

  it("preserves key insertion order", () => {
    const result = serializeFrontmatter({ z: "1", a: "2" }, "");
    const lines = result.split("\n");
    expect(lines[1]).toBe("z: 1");
    expect(lines[2]).toBe("a: 2");
  });
});

// ---------------------------------------------------------------------------
// Round-trip fidelity
// ---------------------------------------------------------------------------
describe("round-trip: parse ↔ serialize", () => {
  it("round-trips simple scalars", () => {
    const data = { title: "My Page", author: "Alice" };
    const body = "# Hello\n\nSome content.";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it("round-trips arrays", () => {
    const data = { tags: ["alpha", "beta", "gamma"] };
    const body = "Body text";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it("round-trips values requiring quoting (colons)", () => {
    const data = { source: "https://example.com/page" };
    const body = "Content";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it("round-trips array elements with commas", () => {
    const data = { tags: ["hello", "a, b", "world"] };
    const body = "";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
  });

  it("round-trips values starting with special characters", () => {
    const data = {
      a: "[bracket",
      b: "#hash",
      c: "&amp",
      d: "*star",
    };
    const body = "Body";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it("round-trips values with embedded double quotes", () => {
    const data = { note: 'She said "hello"' };
    const body = "Body";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
  });

  it("round-trips empty body", () => {
    const data = { title: "Page" };
    const body = "";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it("round-trips empty data", () => {
    const body = "Just body text";
    const serialized = serializeFrontmatter({}, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe(body);
  });

  it("round-trips mixed scalars and arrays", () => {
    const data = {
      title: "Complex Page",
      source: "https://example.com",
      tags: ["AI", "machine learning", "NLP"],
      status: "draft",
    };
    const body = "# Complex Page\n\nLots of content here.\n";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });
});
