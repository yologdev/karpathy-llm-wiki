Title: Dedicated test suite for frontmatter.ts
Files: src/lib/__tests__/frontmatter.test.ts
Issue: none

The `frontmatter.ts` module (267 lines) is a hand-rolled YAML frontmatter parser/serializer that every wiki page flows through. It has zero dedicated tests — only indirect coverage via `ingest.test.ts` and `export.test.ts`. Given its complexity (quote handling, inline arrays, block scalar rejection, round-trip fidelity), this is a high-value test target.

Create `src/lib/__tests__/frontmatter.test.ts` with comprehensive tests covering:

**parseFrontmatter:**
- No frontmatter → returns empty data + full body
- Basic scalar values (`key: value`)
- Quoted scalar values (single and double quotes)
- Values containing colons (must be quoted)
- Inline arrays (`tags: [a, b, c]`)
- Inline arrays with quoted elements containing commas (`[a, "b, c"]`)
- Empty frontmatter block (`---\n---\n`)
- Empty values (`key:` with nothing after)
- Comments in frontmatter (lines starting with `#`)
- Blank lines within frontmatter
- Windows-style line endings (`\r\n`)
- Content `"---"` on its own (no newline)
- **Error cases:** missing closing delimiter, indented/nested values, block arrays (`- item`), block scalars (`|`, `>`), YAML anchors (`&`, `*`), malformed inline arrays (missing `]`), empty key

**serializeFrontmatter:**
- Empty data → returns body only (no `---` block)
- Scalar values without special chars
- Scalar values requiring quoting (contains `:`, starts with `[`, `"`, `'`, `#`, `&`, `*`, leading/trailing whitespace)
- Array values serialized as inline arrays
- Array elements requiring quoting (contain comma, quotes, brackets, empty strings)
- Round-trip: `parseFrontmatter(serializeFrontmatter(data, body))` returns the original data and body

**splitInlineArray (tested indirectly via parseFrontmatter):**
- Empty array `[]`
- Single element
- Multiple elements with varying whitespace
- Quoted elements with embedded commas
- Unterminated quote → throws

Verify: `pnpm build && pnpm lint && pnpm test`
