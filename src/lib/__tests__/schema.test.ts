import { describe, it, expect, afterEach } from "vitest";
import { loadPageConventions, loadPageTemplates } from "../schema";
import { mkdtemp, writeFile, rm } from "fs/promises";
import path from "path";
import os from "os";

/**
 * Dedicated tests for src/lib/schema.ts
 *
 * Both exported functions accept an optional `schemaPath` parameter,
 * so we write temporary SCHEMA.md files in temp directories rather than
 * depending on the real project root.
 */

const tmpDirs: string[] = [];

async function makeTempSchema(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "schema-test-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "SCHEMA.md");
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

afterEach(async () => {
  for (const d of tmpDirs) {
    await rm(d, { recursive: true, force: true }).catch(() => {});
  }
  tmpDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Full realistic SCHEMA.md content used across multiple tests
// ---------------------------------------------------------------------------

const FULL_SCHEMA = `# Wiki Schema

An intro paragraph.

## Layers

The system has three layers.

## Page conventions

- Filenames are kebab-case slugs ending in \`.md\`.
- Every page starts with an H1 title.
- Cross-references use \`[Title](slug.md)\`.

## Page templates

### Source summary

Created by ingest.

\`\`\`yaml
---
type: summary
---
\`\`\`

### Entity page

About a person or org.

## Known gaps

- Vector search not yet implemented.
`;

// ---------------------------------------------------------------------------
// loadPageConventions
// ---------------------------------------------------------------------------

describe("loadPageConventions", () => {
  it("extracts the Page conventions section from a valid SCHEMA.md", async () => {
    const schemaPath = await makeTempSchema(FULL_SCHEMA);
    const result = await loadPageConventions(schemaPath);

    expect(result).toContain("## Page conventions");
    expect(result).toContain("kebab-case slugs");
    expect(result).toContain("Cross-references");
    // Should NOT bleed into the next section
    expect(result).not.toContain("## Page templates");
    expect(result).not.toContain("Source summary");
  });

  it('returns "" when SCHEMA.md does not exist', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "schema-test-"));
    tmpDirs.push(dir);
    const missingPath = path.join(dir, "SCHEMA.md");
    const result = await loadPageConventions(missingPath);
    expect(result).toBe("");
  });

  it('returns "" when the heading is not found', async () => {
    const schemaPath = await makeTempSchema(
      "# Wiki Schema\n\n## Layers\n\nSome content.\n",
    );
    const result = await loadPageConventions(schemaPath);
    expect(result).toBe("");
  });

  it("extracts content up to the next ## heading", async () => {
    const schema = [
      "# Schema",
      "",
      "## Page conventions",
      "",
      "Rule 1.",
      "Rule 2.",
      "",
      "## Next section",
      "",
      "Other stuff.",
    ].join("\n");
    const schemaPath = await makeTempSchema(schema);
    const result = await loadPageConventions(schemaPath);

    expect(result).toContain("Rule 1.");
    expect(result).toContain("Rule 2.");
    expect(result).not.toContain("Next section");
    expect(result).not.toContain("Other stuff.");
  });

  it("extracts the last section when no following ## heading exists", async () => {
    const schema = [
      "# Schema",
      "",
      "## Layers",
      "",
      "Layer info.",
      "",
      "## Page conventions",
      "",
      "Final rule A.",
      "Final rule B.",
    ].join("\n");
    const schemaPath = await makeTempSchema(schema);
    const result = await loadPageConventions(schemaPath);

    expect(result).toContain("Final rule A.");
    expect(result).toContain("Final rule B.");
    expect(result).not.toContain("Layer info.");
  });
});

// ---------------------------------------------------------------------------
// loadPageTemplates
// ---------------------------------------------------------------------------

describe("loadPageTemplates", () => {
  it("extracts the Page templates section from a valid SCHEMA.md", async () => {
    const schemaPath = await makeTempSchema(FULL_SCHEMA);
    const result = await loadPageTemplates(schemaPath);

    expect(result).toContain("## Page templates");
    expect(result).toContain("### Source summary");
    expect(result).toContain("### Entity page");
    expect(result).toContain("type: summary");
    // Should NOT bleed into the next section
    expect(result).not.toContain("## Known gaps");
    expect(result).not.toContain("Vector search");
  });

  it('returns "" when SCHEMA.md does not exist', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "schema-test-"));
    tmpDirs.push(dir);
    const missingPath = path.join(dir, "SCHEMA.md");
    const result = await loadPageTemplates(missingPath);
    expect(result).toBe("");
  });

  it('returns "" when the heading is not found', async () => {
    const schemaPath = await makeTempSchema(
      "# Wiki Schema\n\n## Layers\n\nSome content.\n",
    );
    const result = await loadPageTemplates(schemaPath);
    expect(result).toBe("");
  });

  it("handles SCHEMA.md with only templates (no conventions)", async () => {
    const schema = [
      "# Schema",
      "",
      "## Layers",
      "",
      "Layer info.",
      "",
      "## Page templates",
      "",
      "### Source summary",
      "",
      "Template content here.",
      "",
      "### Entity page",
      "",
      "Entity template here.",
    ].join("\n");
    const schemaPath = await makeTempSchema(schema);
    const result = await loadPageTemplates(schemaPath);

    expect(result).toContain("## Page templates");
    expect(result).toContain("Source summary");
    expect(result).toContain("Entity template here.");
    // Should not contain content from Layers
    expect(result).not.toContain("Layer info.");
  });

  it("includes sub-headings (###) within the section", async () => {
    const schema = [
      "## Page templates",
      "",
      "### Type A",
      "",
      "Content A.",
      "",
      "### Type B",
      "",
      "Content B.",
      "",
      "## Another section",
      "",
      "Unrelated.",
    ].join("\n");
    const schemaPath = await makeTempSchema(schema);
    const result = await loadPageTemplates(schemaPath);

    expect(result).toContain("### Type A");
    expect(result).toContain("Content A.");
    expect(result).toContain("### Type B");
    expect(result).toContain("Content B.");
    expect(result).not.toContain("Another section");
  });
});
