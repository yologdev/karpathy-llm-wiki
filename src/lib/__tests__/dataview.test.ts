import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  queryByFrontmatter,
  validateQuery,
  type DataviewQuery,
  type DataviewFilter,
} from "../dataview";
import { serializeFrontmatter } from "../frontmatter";
import { ensureDirectories, updateIndex, writeWikiPage } from "../wiki";
import type { IndexEntry } from "../types";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

/** Helper: create a wiki page with frontmatter and body. */
async function createPage(
  slug: string,
  title: string,
  frontmatter: Record<string, string | string[]>,
  body?: string,
): Promise<void> {
  const md = body ?? `# ${title}\n\nContent for ${title}.`;
  const content = serializeFrontmatter(frontmatter, md);
  await writeWikiPage(slug, content);
}

/** Helper: update index with given entries. */
async function buildIndex(
  entries: { slug: string; title: string; summary: string }[],
): Promise<void> {
  await updateIndex(entries as IndexEntry[]);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dataview-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  await ensureDirectories();
});

afterEach(async () => {
  if (originalWikiDir === undefined) {
    delete process.env.WIKI_DIR;
  } else {
    process.env.WIKI_DIR = originalWikiDir;
  }
  if (originalRawDir === undefined) {
    delete process.env.RAW_DIR;
  } else {
    process.env.RAW_DIR = originalRawDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Seed helper: creates a small set of wiki pages for most tests
// ---------------------------------------------------------------------------

async function seedPages() {
  await createPage("transformers", "Transformers", {
    created: "2025-01-10",
    updated: "2025-06-15",
    tags: ["ai", "deep-learning"],
    source_count: "3",
    source_url: "https://example.com/transformers",
  });
  await createPage("attention", "Attention Mechanisms", {
    created: "2025-03-20",
    updated: "2025-04-01",
    tags: ["ai", "architecture"],
    source_count: "1",
  });
  await createPage("python", "Python Language", {
    created: "2024-12-01",
    updated: "2025-01-05",
    tags: ["programming"],
    source_count: "5",
    source_url: "https://python.org",
  });

  await buildIndex([
    { slug: "transformers", title: "Transformers", summary: "About transformers" },
    { slug: "attention", title: "Attention Mechanisms", summary: "Attention in neural nets" },
    { slug: "python", title: "Python Language", summary: "Python programming" },
  ]);
}

// ---------------------------------------------------------------------------
// Tests: Filter by tag contains
// ---------------------------------------------------------------------------

describe("filter by tag contains", () => {
  it("returns pages whose tags array contains the value", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "tags", op: "contains", value: "ai" }],
    });

    const slugs = results.map((r) => r.slug).sort();
    expect(slugs).toEqual(["attention", "transformers"]);
  });

  it("returns empty when no page has the tag", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "tags", op: "contains", value: "rust" }],
    });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Filter by created date range (gt/lt)
// ---------------------------------------------------------------------------

describe("filter by created date range", () => {
  it("filters pages created after a date (gt)", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "created", op: "gt", value: "2025-01-01" }],
    });

    const slugs = results.map((r) => r.slug).sort();
    expect(slugs).toEqual(["attention", "transformers"]);
  });

  it("filters pages created before a date (lt)", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "created", op: "lt", value: "2025-01-01" }],
    });

    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("python");
  });

  it("combined gt + lt produces a date range", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [
        { field: "created", op: "gte", value: "2025-01-01" },
        { field: "created", op: "lte", value: "2025-02-01" },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("transformers");
  });
});

// ---------------------------------------------------------------------------
// Tests: Filter by source_count (gte)
// ---------------------------------------------------------------------------

describe("filter by source_count", () => {
  it("filters by source_count >= 3", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "source_count", op: "gte", value: "3" }],
    });

    const slugs = results.map((r) => r.slug).sort();
    expect(slugs).toEqual(["python", "transformers"]);
  });

  it("filters by exact source_count", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "source_count", op: "eq", value: "1" }],
    });

    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("attention");
  });
});

// ---------------------------------------------------------------------------
// Tests: Filter by exists (has source_url)
// ---------------------------------------------------------------------------

describe("filter by exists", () => {
  it("returns pages that have a source_url field", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "source_url", op: "exists" }],
    });

    const slugs = results.map((r) => r.slug).sort();
    expect(slugs).toEqual(["python", "transformers"]);
  });

  it("returns empty when filtering for a field no page has", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "nonexistent_field", op: "exists" }],
    });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sort by created asc/desc
// ---------------------------------------------------------------------------

describe("sort by created", () => {
  it("sorts ascending by default", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      sortBy: "created",
      sortOrder: "asc",
    });

    const slugs = results.map((r) => r.slug);
    expect(slugs).toEqual(["python", "transformers", "attention"]);
  });

  it("sorts descending", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      sortBy: "created",
      sortOrder: "desc",
    });

    const slugs = results.map((r) => r.slug);
    expect(slugs).toEqual(["attention", "transformers", "python"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: Limit enforcement
// ---------------------------------------------------------------------------

describe("limit", () => {
  it("returns at most `limit` results", async () => {
    await seedPages();

    const results = await queryByFrontmatter({ limit: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("defaults to 50 (all pages returned when fewer)", async () => {
    await seedPages();

    const results = await queryByFrontmatter({});

    // We only have 3 pages
    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Tests: Empty filters returns all pages
// ---------------------------------------------------------------------------

describe("empty filters", () => {
  it("returns all pages when no filters are specified", async () => {
    await seedPages();

    const results = await queryByFrontmatter({});

    expect(results).toHaveLength(3);
  });

  it("returns all pages with an empty filters array", async () => {
    await seedPages();

    const results = await queryByFrontmatter({ filters: [] });

    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Tests: Unknown field returns empty (doesn't crash)
// ---------------------------------------------------------------------------

describe("unknown field", () => {
  it("returns empty for eq on unknown field", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "does_not_exist", op: "eq", value: "foo" }],
    });

    expect(results).toHaveLength(0);
  });

  it("does not crash for gt on unknown field", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "nope", op: "gt", value: "2025-01-01" }],
    });

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: neq operator
// ---------------------------------------------------------------------------

describe("neq operator", () => {
  it("excludes pages with a matching value", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "source_count", op: "neq", value: "1" }],
    });

    const slugs = results.map((r) => r.slug).sort();
    expect(slugs).toEqual(["python", "transformers"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: Validation
// ---------------------------------------------------------------------------

describe("validateQuery", () => {
  it("rejects unknown op", () => {
    expect(() =>
      validateQuery({
        filters: [
          { field: "tags", op: "like" as DataviewFilter["op"], value: "ai" },
        ],
      }),
    ).toThrow(/unknown filter op/);
  });

  it("rejects non-exists op without a value", () => {
    expect(() =>
      validateQuery({
        filters: [{ field: "tags", op: "eq" } as DataviewFilter],
      }),
    ).toThrow(/requires a value/);
  });

  it("accepts exists op without a value", () => {
    expect(() =>
      validateQuery({
        filters: [{ field: "tags", op: "exists" }],
      }),
    ).not.toThrow();
  });

  it("rejects limit over 200", () => {
    expect(() => validateQuery({ limit: 201 })).toThrow(/exceeds maximum/);
  });

  it("rejects negative limit", () => {
    expect(() => validateQuery({ limit: -1 })).toThrow(/positive integer/);
  });

  it("rejects invalid sortOrder", () => {
    expect(() =>
      validateQuery({ sortOrder: "random" as DataviewQuery["sortOrder"] }),
    ).toThrow(/invalid sortOrder/);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sort with missing field pushes to end
// ---------------------------------------------------------------------------

describe("sort with missing field", () => {
  it("pages missing the sort field appear last", async () => {
    await createPage("with-field", "With Field", {
      created: "2025-01-01",
      priority: "high",
    });
    await createPage("without-field", "Without Field", {
      created: "2025-02-01",
    });

    await buildIndex([
      { slug: "with-field", title: "With Field", summary: "Has priority" },
      { slug: "without-field", title: "Without Field", summary: "No priority" },
    ]);

    const results = await queryByFrontmatter({
      sortBy: "priority",
      sortOrder: "asc",
    });

    expect(results[0].slug).toBe("with-field");
    expect(results[1].slug).toBe("without-field");
  });
});

// ---------------------------------------------------------------------------
// Tests: Combined filter + sort + limit
// ---------------------------------------------------------------------------

describe("combined filter + sort + limit", () => {
  it("filters, sorts, then limits", async () => {
    await seedPages();

    const results = await queryByFrontmatter({
      filters: [{ field: "tags", op: "contains", value: "ai" }],
      sortBy: "created",
      sortOrder: "desc",
      limit: 1,
    });

    expect(results).toHaveLength(1);
    // Attention was created later (2025-03-20) than Transformers (2025-01-10)
    expect(results[0].slug).toBe("attention");
  });
});

// ---------------------------------------------------------------------------
// Tests: Empty wiki
// ---------------------------------------------------------------------------

describe("empty wiki", () => {
  it("returns empty array when no pages exist", async () => {
    const results = await queryByFrontmatter({});
    expect(results).toEqual([]);
  });
});
