import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  handleSearchWiki,
  handleReadPage,
  handleListPages,
} from "../../mcp";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "raw"), { recursive: true });
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
// Helper — write wiki pages and index
// ---------------------------------------------------------------------------

async function writeTestPage(slug: string, content: string): Promise<void> {
  await fs.writeFile(
    path.join(tmpDir, "wiki", `${slug}.md`),
    content,
    "utf-8",
  );
}

async function writeIndex(
  entries: { title: string; slug: string; summary: string }[],
): Promise<void> {
  const lines = entries.map(
    (e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`,
  );
  const content = `# Wiki Index\n\n${lines.join("\n")}\n`;
  await fs.writeFile(
    path.join(tmpDir, "wiki", "index.md"),
    content,
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// search_wiki tests
// ---------------------------------------------------------------------------

describe("search_wiki", () => {
  it("returns results for matching content", async () => {
    await writeTestPage(
      "neural-networks",
      "---\ntags: [ml]\n---\n# Neural Networks\n\nNeural networks are computing systems inspired by biological neural networks.",
    );
    await writeTestPage(
      "gradient-descent",
      "---\ntags: [ml]\n---\n# Gradient Descent\n\nGradient descent is an optimization algorithm.",
    );

    const results = await handleSearchWiki({ query: "neural" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].slug).toBe("neural-networks");
    expect(results[0].title).toBe("Neural Networks");
    expect(results[0].snippet).toBeDefined();
    expect(typeof results[0].score).toBe("number");
  });

  it("returns empty array for no matches", async () => {
    await writeTestPage(
      "neural-networks",
      "# Neural Networks\n\nSome content about neural nets.",
    );

    const results = await handleSearchWiki({ query: "quantum-entanglement-xyz" });
    expect(results).toEqual([]);
  });

  it("respects limit parameter", async () => {
    await writeTestPage("a", "# Page A\n\nCommon topic here.");
    await writeTestPage("b", "# Page B\n\nCommon topic here.");
    await writeTestPage("c", "# Page C\n\nCommon topic here.");

    const results = await handleSearchWiki({ query: "common topic", limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// read_page tests
// ---------------------------------------------------------------------------

describe("read_page", () => {
  it("returns page content with frontmatter", async () => {
    await writeTestPage(
      "test-page",
      "---\ntags: [science]\nupdated: '2025-01-01'\n---\n# Test Page\n\nThis is test content.",
    );

    const result = await handleReadPage({ slug: "test-page" });
    expect(result.slug).toBe("test-page");
    expect(result.title).toBe("Test Page");
    expect(result.content).toContain("This is test content.");
    expect(result.frontmatter).toBeDefined();
    expect(result.frontmatter.tags).toEqual(["science"]);
    expect(result.frontmatter.updated).toBe("2025-01-01");
  });

  it("throws for nonexistent slug", async () => {
    await expect(
      handleReadPage({ slug: "does-not-exist" }),
    ).rejects.toThrow("Page not found: does-not-exist");
  });
});

// ---------------------------------------------------------------------------
// list_pages tests
// ---------------------------------------------------------------------------

describe("list_pages", () => {
  it("returns all pages", async () => {
    await writeTestPage(
      "alpha",
      "---\ntags: [a]\nupdated: '2025-01-01'\n---\n# Alpha\n\nAlpha page.",
    );
    await writeTestPage(
      "beta",
      "---\ntags: [b]\nupdated: '2025-06-15'\n---\n# Beta\n\nBeta page.",
    );
    await writeIndex([
      { title: "Alpha", slug: "alpha", summary: "Alpha page" },
      { title: "Beta", slug: "beta", summary: "Beta page" },
    ]);

    const result = await handleListPages({});
    expect(result.length).toBe(2);
    // Default sort is by title
    expect(result[0].slug).toBe("alpha");
    expect(result[1].slug).toBe("beta");
  });

  it("respects limit parameter", async () => {
    await writeTestPage("a", "# A\n\nPage A.");
    await writeTestPage("b", "# B\n\nPage B.");
    await writeTestPage("c", "# C\n\nPage C.");
    await writeIndex([
      { title: "A", slug: "a", summary: "Page A" },
      { title: "B", slug: "b", summary: "Page B" },
      { title: "C", slug: "c", summary: "Page C" },
    ]);

    const result = await handleListPages({ limit: 2 });
    expect(result.length).toBe(2);
  });

  it("sorts by updated when requested", async () => {
    await writeTestPage(
      "old",
      "---\nupdated: '2024-01-01'\n---\n# Old\n\nOld page.",
    );
    await writeTestPage(
      "new",
      "---\nupdated: '2025-06-15'\n---\n# New\n\nNew page.",
    );
    await writeIndex([
      { title: "Old", slug: "old", summary: "Old page" },
      { title: "New", slug: "new", summary: "New page" },
    ]);

    const result = await handleListPages({ sort: "updated" });
    expect(result.length).toBe(2);
    // Newest first
    expect(result[0].slug).toBe("new");
    expect(result[1].slug).toBe("old");
  });

  it("returns empty array when no pages exist", async () => {
    const result = await handleListPages({});
    expect(result).toEqual([]);
  });
});
