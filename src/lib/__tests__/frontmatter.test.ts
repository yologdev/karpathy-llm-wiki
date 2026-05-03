import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter, normalizeTypedFields } from "../frontmatter";

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

// ---------------------------------------------------------------------------
// Number and boolean values
// ---------------------------------------------------------------------------
describe("number and boolean values", () => {
  it("parses unquoted float as number", () => {
    const text = "---\nconfidence: 0.85\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.confidence).toBe(0.85);
    expect(typeof data.confidence).toBe("number");
  });

  it("parses unquoted integer as number", () => {
    const text = "---\nrevision_count: 3\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.revision_count).toBe(3);
    expect(typeof data.revision_count).toBe("number");
  });

  it("parses unquoted true as boolean", () => {
    const text = "---\ndisputed: true\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.disputed).toBe(true);
    expect(typeof data.disputed).toBe("boolean");
  });

  it("parses unquoted false as boolean", () => {
    const text = "---\ndisputed: false\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.disputed).toBe(false);
    expect(typeof data.disputed).toBe("boolean");
  });

  it("coerces quoted confidence to number (schema normalization)", () => {
    const text = '---\nconfidence: "0.85"\n---\nBody';
    const { data } = parseFrontmatter(text);
    expect(data.confidence).toBe(0.85);
    expect(typeof data.confidence).toBe("number");
  });

  it("coerces quoted disputed to boolean (schema normalization)", () => {
    const text = '---\ndisputed: "true"\n---\nBody';
    const { data } = parseFrontmatter(text);
    expect(data.disputed).toBe(true);
    expect(typeof data.disputed).toBe("boolean");
  });

  it("parses negative number", () => {
    const text = "---\nscore: -1\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.score).toBe(-1);
    expect(typeof data.score).toBe("number");
  });

  it("parses larger integer", () => {
    const text = "---\ncount: 42\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.count).toBe(42);
    expect(typeof data.count).toBe("number");
  });

  it("does NOT coerce version-like strings to number", () => {
    const text = "---\nversion: 1.2.3\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.version).toBe("1.2.3");
    expect(typeof data.version).toBe("string");
  });

  it("does NOT coerce strings with non-numeric chars to number", () => {
    const text = "---\nslug: 3d-printing\n---\nBody";
    const { data } = parseFrontmatter(text);
    expect(data.slug).toBe("3d-printing");
    expect(typeof data.slug).toBe("string");
  });

  it("round-trips number and boolean values", () => {
    const data = {
      title: "Test",
      confidence: 0.85,
      revision_count: 3,
      disputed: true,
      archived: false,
    };
    const body = "Body";
    const serialized = serializeFrontmatter(data, body);
    const parsed = parseFrontmatter(serialized);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe(body);
  });

  it("serializes numbers without quotes", () => {
    const serialized = serializeFrontmatter({ score: 42 }, "Body");
    expect(serialized).toContain("score: 42");
    expect(serialized).not.toContain('"42"');
  });

  it("serializes booleans without quotes", () => {
    const serialized = serializeFrontmatter({ disputed: true }, "Body");
    expect(serialized).toContain("disputed: true");
    expect(serialized).not.toContain('"true"');
  });
});

// ---------------------------------------------------------------------------
// normalizeTypedFields — schema-aware type coercion
// ---------------------------------------------------------------------------
describe("normalizeTypedFields", () => {
  // --- confidence (number 0-1) ---
  describe("confidence field", () => {
    it('coerces quoted "0.7" to number 0.7', () => {
      const text = '---\nconfidence: "0.7"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.confidence).toBe(0.7);
      expect(typeof data.confidence).toBe("number");
    });

    it("keeps unquoted 0.7 as number", () => {
      const text = "---\nconfidence: 0.7\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.confidence).toBe(0.7);
      expect(typeof data.confidence).toBe("number");
    });

    it("clamps 1.5 to 1.0", () => {
      const text = "---\nconfidence: 1.5\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.confidence).toBe(1.0);
    });

    it("clamps -0.1 to 0.0", () => {
      const text = "---\nconfidence: -0.1\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.confidence).toBe(0.0);
    });

    it('removes non-numeric "banana"', () => {
      const text = '---\nconfidence: "banana"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data).not.toHaveProperty("confidence");
    });

    it("removes unquoted non-numeric value", () => {
      const data = { confidence: "not-a-number" as unknown as number };
      normalizeTypedFields(data);
      expect(data).not.toHaveProperty("confidence");
    });

    it("clamps boundary value 0 correctly", () => {
      const text = "---\nconfidence: 0\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.confidence).toBe(0);
    });

    it("clamps boundary value 1 correctly", () => {
      const text = "---\nconfidence: 1\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.confidence).toBe(1);
    });
  });

  // --- disputed (boolean) ---
  describe("disputed field", () => {
    it('coerces quoted "true" to boolean true', () => {
      const text = '---\ndisputed: "true"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.disputed).toBe(true);
      expect(typeof data.disputed).toBe("boolean");
    });

    it('coerces quoted "false" to boolean false', () => {
      const text = '---\ndisputed: "false"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.disputed).toBe(false);
      expect(typeof data.disputed).toBe("boolean");
    });

    it("keeps unquoted true as boolean", () => {
      const text = "---\ndisputed: true\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.disputed).toBe(true);
      expect(typeof data.disputed).toBe("boolean");
    });

    it("keeps unquoted false as boolean", () => {
      const text = "---\ndisputed: false\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.disputed).toBe(false);
      expect(typeof data.disputed).toBe("boolean");
    });

    it('removes non-boolean "banana"', () => {
      const data = { disputed: "banana" as unknown as boolean };
      normalizeTypedFields(data);
      expect(data).not.toHaveProperty("disputed");
    });
  });

  // --- expiry (ISO date string) ---
  describe("expiry field", () => {
    it("keeps valid ISO date", () => {
      const text = "---\nexpiry: 2026-01-01\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.expiry).toBe("2026-01-01");
      expect(typeof data.expiry).toBe("string");
    });

    it("keeps quoted valid ISO date", () => {
      const text = '---\nexpiry: "2026-01-01"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.expiry).toBe("2026-01-01");
    });

    it('removes "not-a-date"', () => {
      const text = '---\nexpiry: "not-a-date"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data).not.toHaveProperty("expiry");
    });

    it("removes partial date", () => {
      const text = "---\nexpiry: 2026-01\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data).not.toHaveProperty("expiry");
    });
  });

  // --- valid_from (ISO date string) ---
  describe("valid_from field", () => {
    it("keeps valid ISO date", () => {
      const text = "---\nvalid_from: 2026-01-01\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.valid_from).toBe("2026-01-01");
      expect(typeof data.valid_from).toBe("string");
    });

    it('removes "not-a-date"', () => {
      const text = '---\nvalid_from: "not-a-date"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data).not.toHaveProperty("valid_from");
    });
  });

  // --- array fields: authors, contributors, aliases ---
  describe("array fields", () => {
    it("wraps bare string authors in array", () => {
      const text = "---\nauthors: yoyo\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.authors).toEqual(["yoyo"]);
    });

    it("keeps array authors as array", () => {
      const text = "---\nauthors: [yoyo, human]\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.authors).toEqual(["yoyo", "human"]);
    });

    it("wraps bare string contributors in array", () => {
      const text = "---\ncontributors: alice\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.contributors).toEqual(["alice"]);
    });

    it("wraps bare string aliases in array", () => {
      const text = "---\naliases: alt-name\n---\nBody";
      const { data } = parseFrontmatter(text);
      expect(data.aliases).toEqual(["alt-name"]);
    });

    it("converts empty string to empty array", () => {
      const data = { authors: "" as unknown as string[] };
      normalizeTypedFields(data);
      expect(data.authors).toEqual([]);
    });

    it("wraps unexpected number in array", () => {
      const data = { authors: 42 as unknown as string[] };
      normalizeTypedFields(data);
      expect(data.authors).toEqual(["42"]);
    });
  });

  // --- non-schema fields are untouched ---
  describe("non-schema fields", () => {
    it("does not coerce a non-schema quoted number", () => {
      const text = '---\ncustom_score: "42"\n---\nBody';
      const { data } = parseFrontmatter(text);
      // custom_score is not a schema field — stays as string
      expect(data.custom_score).toBe("42");
      expect(typeof data.custom_score).toBe("string");
    });

    it("does not coerce a non-schema quoted boolean", () => {
      const text = '---\nis_cool: "true"\n---\nBody';
      const { data } = parseFrontmatter(text);
      expect(data.is_cool).toBe("true");
      expect(typeof data.is_cool).toBe("string");
    });
  });

  // --- round-trip preservation ---
  describe("round-trip", () => {
    it("parse → serialize → parse preserves normalized types", () => {
      const text = [
        "---",
        'confidence: "0.7"',
        'disputed: "true"',
        "expiry: 2026-06-15",
        "authors: yoyo",
        "contributors: [alice, bob]",
        "aliases: [alt1]",
        "title: Test Page",
        "---",
        "",
        "Body content",
      ].join("\n");

      const first = parseFrontmatter(text);
      expect(first.data.confidence).toBe(0.7);
      expect(first.data.disputed).toBe(true);
      expect(first.data.authors).toEqual(["yoyo"]);

      const serialized = serializeFrontmatter(first.data, first.body);
      const second = parseFrontmatter(serialized);

      expect(second.data.confidence).toBe(0.7);
      expect(typeof second.data.confidence).toBe("number");
      expect(second.data.disputed).toBe(true);
      expect(typeof second.data.disputed).toBe("boolean");
      expect(second.data.expiry).toBe("2026-06-15");
      expect(second.data.authors).toEqual(["yoyo"]);
      expect(second.data.contributors).toEqual(["alice", "bob"]);
      expect(second.data.aliases).toEqual(["alt1"]);
      expect(second.body).toBe(first.body);
    });
  });
});
