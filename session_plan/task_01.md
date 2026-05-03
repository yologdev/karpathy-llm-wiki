Title: Add frontmatter field type validation/coercion for typed schema fields
Files: src/lib/frontmatter.ts, src/lib/__tests__/frontmatter.test.ts
Issue: none (assessment gap #4 — prevents silent data corruption)

## Problem

The frontmatter parser correctly coerces *unquoted* YAML scalars: `confidence: 0.7`
becomes a number. But *quoted* scalars pass through as strings: `confidence: "0.7"`
stays the string `"0.7"`. LLMs sometimes produce quoted numbers/booleans in YAML.

Downstream code uses `typeof confidence === "number"` guards, so a string `"0.7"`
silently passes through unchecked — it's not flagged as low-confidence, not caught
by any lint, and `"0.7" < 0.3` is a string comparison that returns `true`.

The learnings file (entry: "Type-narrowing in a shared interface is a time bomb")
explicitly warns about this exact class of bug.

## Solution

Add a `normalizeTypedFields()` function in `frontmatter.ts` that runs after parsing.
For a known set of schema fields, coerce to the correct type:

- `confidence` → number (0-1 range, clamp if outside)
- `disputed` → boolean
- `expiry` → string (validate ISO date format YYYY-MM-DD)
- `valid_from` → string (validate ISO date format YYYY-MM-DD)
- `authors` → string[] (wrap bare string in array)
- `contributors` → string[] (wrap bare string in array)
- `aliases` → string[] (wrap bare string in array)

Call `normalizeTypedFields(data)` at the end of `parseFrontmatter()` before returning.

If a value can't be coerced (e.g., `confidence: "banana"`), log a warning and
delete the field (let downstream code see it as absent rather than wrong type).

## Tests to add

In `frontmatter.test.ts`:
- `confidence: "0.7"` (quoted) → parsed as number 0.7
- `confidence: 1.5` → clamped to 1.0
- `confidence: -0.1` → clamped to 0.0
- `confidence: "banana"` → field removed
- `disputed: "true"` (quoted) → parsed as boolean true
- `disputed: "false"` (quoted) → parsed as boolean false
- `expiry: 2026-01-01` → kept as string "2026-01-01"
- `expiry: "not-a-date"` → field removed
- `valid_from: 2026-01-01` → kept as string "2026-01-01"
- `authors: yoyo` (bare string) → wrapped as ["yoyo"]
- `authors: [yoyo, human]` → kept as array
- Round-trip: parse → serialize → parse preserves normalized types

## Verification

```bash
pnpm build && pnpm lint && pnpm test
```
