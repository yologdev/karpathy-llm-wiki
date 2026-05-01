Title: Extend frontmatter to support number and boolean values
Files: src/lib/frontmatter.ts, src/lib/__tests__/frontmatter.test.ts
Issue: none

## Context

Phase 1 of the yopedia pivot requires new frontmatter fields:
- `confidence` (0–1 float) → needs **number** support
- `disputed` (boolean) → needs **boolean** support
- `revision_count` (integer) → needs **number** support

Currently `Frontmatter` is typed as `{ [key: string]: string | string[] }` and
the parser treats all scalars as strings. The serializer just calls `String()`.

## What to do

### 1. Extend the `Frontmatter` type (frontmatter.ts)

Change the interface:
```typescript
export interface Frontmatter {
  [key: string]: string | string[] | number | boolean;
}
```

### 2. Extend `parseFrontmatter` to recognize numbers and booleans

After `unquoteScalar()`, add type coercion for unquoted scalars:
- `"true"` / `"false"` → boolean (only unquoted — `"true"` in quotes stays string)
- Strings that match `/^-?\d+(\.\d+)?$/` → number (only unquoted)
- Everything else remains a string
- Quoted values (`"123"`, `"true"`) ALWAYS stay as strings — this preserves backward compat

This means existing pages with `source_count: "1"` (quoted) stay as strings,
while new fields like `confidence: 0.85` (unquoted) parse as numbers.

Important: modify the **scalar parsing path** only (line ~198 area). The inline
array path continues to produce `string[]` — no mixed-type arrays.

### 3. Extend `serializeFrontmatter` to handle numbers and booleans

In the serialization loop:
- `typeof value === 'number'` → emit bare number (no quotes)
- `typeof value === 'boolean'` → emit bare `true`/`false` (no quotes)
- String values unchanged

### 4. Write tests (frontmatter.test.ts)

Add a new describe block `"number and boolean values"` with tests:
- Parse `confidence: 0.85` → number 0.85
- Parse `revision_count: 3` → number 3
- Parse `disputed: true` → boolean true
- Parse `disputed: false` → boolean false
- Parse `confidence: "0.85"` → string "0.85" (quoted stays string)
- Parse `disputed: "true"` → string "true" (quoted stays string)
- Round-trip: serialize then parse preserves types
- Negative numbers: `score: -1` → number -1
- Integer: `count: 42` → number 42
- NOT a number: `version: 1.2.3` → string "1.2.3"
- NOT a number: `slug: 3d-printing` → string "3d-printing" (has non-numeric chars)

### 5. Verify no regressions

Run `pnpm build && pnpm lint && pnpm test` — the existing test suite must still
pass. All existing frontmatter (which uses quoted or non-numeric strings) should
parse identically.

## Backward compatibility

- Existing `source_count: "1"` (with quotes) stays as string "1" — no behavior change
- Existing `source_count: 1` (without quotes, if any) would now parse as number — this is
  the desired behavior for the new schema, and existing code that does
  `Number(prevCountRaw)` handles both types correctly
- `String(value)` calls throughout the codebase handle numbers and booleans safely
