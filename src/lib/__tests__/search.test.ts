import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Mock the LLM module — search.ts imports callLLM/hasLLMKey at module level
// for findRelatedPages, but we don't test that function here.
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(async () => "[]"),
}));

import {
  writeWikiPage,
  ensureDirectories,
  readWikiPage,
  updateIndex,
} from "../wiki";
import {
  searchWikiContent,
  findBacklinks,
  updateRelatedPages,
} from "../search";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "search-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
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
// searchWikiContent
// ---------------------------------------------------------------------------

describe("searchWikiContent", () => {
  it("returns empty array for empty query", async () => {
    await ensureDirectories();
    const results = await searchWikiContent("");
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    await ensureDirectories();
    const results = await searchWikiContent("   \t\n  ");
    expect(results).toEqual([]);
  });

  it("returns empty array when wiki directory does not exist", async () => {
    // Don't call ensureDirectories — directory doesn't exist
    const results = await searchWikiContent("anything");
    expect(results).toEqual([]);
  });

  it("finds pages matching a single term (case-insensitive)", async () => {
    await ensureDirectories();
    await writeWikiPage("neural-networks", "# Neural Networks\n\nArtificial neural networks are computing systems.");
    await writeWikiPage("transformers", "# Transformers\n\nA transformer is a deep learning architecture.");

    const results = await searchWikiContent("neural");
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("neural-networks");
    expect(results[0].title).toBe("Neural Networks");
  });

  it("is case-insensitive", async () => {
    await ensureDirectories();
    await writeWikiPage("test-page", "# Test Page\n\nHello WORLD.");

    const results = await searchWikiContent("world");
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("test-page");

    const results2 = await searchWikiContent("HELLO");
    expect(results2).toHaveLength(1);
    expect(results2[0].slug).toBe("test-page");
  });

  it("scores by number of matching terms (OR semantics)", async () => {
    await ensureDirectories();
    await writeWikiPage("both-terms", "# Both Terms\n\nThis page has alpha and beta content.");
    await writeWikiPage("one-term", "# One Term\n\nThis page only has alpha content.");

    const results = await searchWikiContent("alpha beta");
    expect(results).toHaveLength(2);
    // "both-terms" should rank first (score 2 vs score 1)
    expect(results[0].slug).toBe("both-terms");
    expect(results[1].slug).toBe("one-term");
  });

  it("sorts alphabetically by title when scores are equal", async () => {
    await ensureDirectories();
    await writeWikiPage("zebra", "# Zebra\n\nAnimal with stripes.");
    await writeWikiPage("alpha", "# Alpha\n\nAnimal with fur.");

    const results = await searchWikiContent("animal");
    expect(results).toHaveLength(2);
    // Equal score — alphabetical: Alpha before Zebra
    expect(results[0].slug).toBe("alpha");
    expect(results[1].slug).toBe("zebra");
  });

  it("skips index.md and log.md", async () => {
    await ensureDirectories();
    await writeWikiPage("index", "# Index\n\nThis is the wiki index.");
    await writeWikiPage("log", "# Log\n\nThis is the wiki log.");
    await writeWikiPage("real-page", "# Real Page\n\nThis is a real wiki page.");

    const results = await searchWikiContent("wiki");
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("real-page");
  });

  it("respects maxResults limit", async () => {
    await ensureDirectories();
    for (let i = 0; i < 5; i++) {
      await writeWikiPage(`page-${i}`, `# Page ${i}\n\nCommon keyword here.`);
    }

    const results = await searchWikiContent("keyword", 3);
    expect(results).toHaveLength(3);
  });

  it("defaults maxResults to 10", async () => {
    await ensureDirectories();
    for (let i = 0; i < 15; i++) {
      await writeWikiPage(`page-${String(i).padStart(2, "0")}`, `# Page ${i}\n\nShared term here.`);
    }

    const results = await searchWikiContent("shared");
    expect(results).toHaveLength(10);
  });

  it("builds snippet around first match with ellipsis", async () => {
    await ensureDirectories();
    const longPrefix = "A".repeat(100);
    const longSuffix = "B".repeat(100);
    await writeWikiPage("snippet-test", `# Snippet Test\n\n${longPrefix} keyword ${longSuffix}`);

    const results = await searchWikiContent("keyword");
    expect(results).toHaveLength(1);
    const snippet = results[0].snippet;
    // Should have leading ellipsis (match is far from start)
    expect(snippet.startsWith("…")).toBe(true);
    // Should have trailing ellipsis (match is far from end)
    expect(snippet.endsWith("…")).toBe(true);
    // Should contain the keyword
    expect(snippet).toContain("keyword");
  });

  it("snippet has no leading ellipsis when match is near the start", async () => {
    await ensureDirectories();
    await writeWikiPage("near-start", "# Match Near Start\n\nkeyword here and more.");

    const results = await searchWikiContent("Match");
    expect(results).toHaveLength(1);
    // "Match" appears at position 2 (after "# "), which is within snippet radius
    expect(results[0].snippet.startsWith("…")).toBe(false);
  });

  it("extracts title from first heading", async () => {
    await ensureDirectories();
    await writeWikiPage("heading-page", "# My Great Title\n\nSome content here.");

    const results = await searchWikiContent("content");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("My Great Title");
  });

  it("falls back to slug when no heading present", async () => {
    await ensureDirectories();
    await writeWikiPage("no-heading", "Just plain text with a search term.");

    const results = await searchWikiContent("search");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("no-heading");
  });

  it("returns no results when no pages match", async () => {
    await ensureDirectories();
    await writeWikiPage("page-a", "# Page A\n\nHello world.");

    const results = await searchWikiContent("nonexistent");
    expect(results).toEqual([]);
  });

  it("extracts summary from first paragraph after heading", async () => {
    await ensureDirectories();
    await writeWikiPage("summary-page", "# Summary Page\n\nThis is the summary line.\n\nMore content here.");

    const results = await searchWikiContent("summary");
    expect(results).toHaveLength(1);
    expect(results[0].summary).toContain("This is the summary line.");
  });
});

// ---------------------------------------------------------------------------
// findBacklinks
// ---------------------------------------------------------------------------

describe("findBacklinks", () => {
  it("finds pages that link to the target slug", async () => {
    await ensureDirectories();
    await writeWikiPage("target", "# Target\n\nTarget page content.");
    await writeWikiPage("linker", "# Linker\n\nSee [Target](target.md) for more.");
    await writeWikiPage("no-link", "# No Link\n\nUnrelated content.");
    await updateIndex([
      { title: "Target", slug: "target", summary: "Target page." },
      { title: "Linker", slug: "linker", summary: "Links to target." },
      { title: "No Link", slug: "no-link", summary: "Unrelated." },
    ]);

    const backlinks = await findBacklinks("target");
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].slug).toBe("linker");
    expect(backlinks[0].title).toBe("Linker");
  });

  it("skips index and log pages", async () => {
    await ensureDirectories();
    await writeWikiPage("target", "# Target\n\nContent.");
    await writeWikiPage("index", "# Index\n\n- [Target](target.md)");
    await writeWikiPage("log", "# Log\n\n- Ingested [Target](target.md)");
    await writeWikiPage("real-linker", "# Real\n\nSee [Target](target.md).");
    await updateIndex([
      { title: "Target", slug: "target", summary: "Content." },
      { title: "Real", slug: "real-linker", summary: "Links to target." },
    ]);

    const backlinks = await findBacklinks("target");
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].slug).toBe("real-linker");
  });

  it("skips the target page itself", async () => {
    await ensureDirectories();
    await writeWikiPage("self-ref", "# Self Ref\n\nSee [Self Ref](self-ref.md) for recursion.");
    await updateIndex([
      { title: "Self Ref", slug: "self-ref", summary: "Self-referencing." },
    ]);

    const backlinks = await findBacklinks("self-ref");
    expect(backlinks).toEqual([]);
  });

  it("returns empty array when no pages link to target", async () => {
    await ensureDirectories();
    await writeWikiPage("lonely", "# Lonely\n\nNo one links here.");
    await writeWikiPage("other", "# Other\n\nSome unrelated content.");
    await updateIndex([
      { title: "Lonely", slug: "lonely", summary: "No links." },
      { title: "Other", slug: "other", summary: "Unrelated." },
    ]);

    const backlinks = await findBacklinks("lonely");
    expect(backlinks).toEqual([]);
  });

  it("returns empty array when wiki is empty", async () => {
    await ensureDirectories();
    const backlinks = await findBacklinks("nonexistent");
    expect(backlinks).toEqual([]);
  });

  it("detects multiple backlinks", async () => {
    await ensureDirectories();
    await writeWikiPage("target", "# Target\n\nContent.");
    await writeWikiPage("page-a", "# Page A\n\nLinks to [Target](target.md).");
    await writeWikiPage("page-b", "# Page B\n\nAlso links to [Target](target.md).");
    await writeWikiPage("page-c", "# Page C\n\nAnd [Target](target.md) here too.");
    await updateIndex([
      { title: "Target", slug: "target", summary: "Content." },
      { title: "Page A", slug: "page-a", summary: "A." },
      { title: "Page B", slug: "page-b", summary: "B." },
      { title: "Page C", slug: "page-c", summary: "C." },
    ]);

    const backlinks = await findBacklinks("target");
    expect(backlinks).toHaveLength(3);
    const slugs = backlinks.map((b) => b.slug).sort();
    expect(slugs).toEqual(["page-a", "page-b", "page-c"]);
  });
});

// ---------------------------------------------------------------------------
// updateRelatedPages
// ---------------------------------------------------------------------------

describe("updateRelatedPages", () => {
  it("appends 'See also' links to related pages", async () => {
    await ensureDirectories();
    await writeWikiPage("existing", "# Existing Page\n\nSome content here.");

    const modified = await updateRelatedPages("new-page", "New Page", ["existing"]);
    expect(modified).toEqual(["existing"]);

    const page = await readWikiPage("existing");
    expect(page).not.toBeNull();
    expect(page!.content).toContain("**See also:** [New Page](new-page.md)");
  });

  it("skips pages that already link to the new slug", async () => {
    await ensureDirectories();
    await writeWikiPage("already-linked", "# Already Linked\n\nSee [New Page](new-page.md) for details.");

    const modified = await updateRelatedPages("new-page", "New Page", ["already-linked"]);
    expect(modified).toEqual([]);
  });

  it("extends existing 'See also' section rather than creating duplicate", async () => {
    await ensureDirectories();
    await writeWikiPage("has-see-also", "# Has See Also\n\nContent.\n\n**See also:** [Old Page](old-page.md)");

    const modified = await updateRelatedPages("new-page", "New Page", ["has-see-also"]);
    expect(modified).toEqual(["has-see-also"]);

    const page = await readWikiPage("has-see-also");
    expect(page).not.toBeNull();
    // Should have both links on the same "See also" line
    expect(page!.content).toContain("**See also:** [Old Page](old-page.md), [New Page](new-page.md)");
    // Should NOT have two separate "See also" lines
    const seeAlsoCount = (page!.content.match(/\*\*See also:\*\*/g) || []).length;
    expect(seeAlsoCount).toBe(1);
  });

  it("returns array of actually modified slugs", async () => {
    await ensureDirectories();
    await writeWikiPage("will-modify", "# Will Modify\n\nContent.");
    await writeWikiPage("already-links", "# Already Links\n\nSee [Target](target.md).");
    await writeWikiPage("also-modify", "# Also Modify\n\nMore content.");

    const modified = await updateRelatedPages("target", "Target", [
      "will-modify",
      "already-links",
      "also-modify",
    ]);
    expect(modified.sort()).toEqual(["also-modify", "will-modify"]);
  });

  it("skips slugs that do not exist as wiki pages", async () => {
    await ensureDirectories();

    const modified = await updateRelatedPages("new-page", "New Page", ["nonexistent"]);
    expect(modified).toEqual([]);
  });

  it("handles empty relatedSlugs array", async () => {
    await ensureDirectories();
    const modified = await updateRelatedPages("new-page", "New Page", []);
    expect(modified).toEqual([]);
  });

  it("handles multiple related slugs with mixed existing See-also", async () => {
    await ensureDirectories();
    await writeWikiPage("page-with-seealso", "# Page With SeeAlso\n\nContent.\n\n**See also:** [Other](other.md)");
    await writeWikiPage("page-without", "# Page Without\n\nContent.");

    const modified = await updateRelatedPages("new-topic", "New Topic", [
      "page-with-seealso",
      "page-without",
    ]);
    expect(modified.sort()).toEqual(["page-with-seealso", "page-without"]);

    const p1 = await readWikiPage("page-with-seealso");
    expect(p1!.content).toContain("**See also:** [Other](other.md), [New Topic](new-topic.md)");

    const p2 = await readWikiPage("page-without");
    expect(p2!.content).toContain("**See also:** [New Topic](new-topic.md)");
  });
});
