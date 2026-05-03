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
  fuzzyMatch,
  levenshteinDistance,
  fuzzySearchWikiContent,
  resolveScope,
} from "../search";
import type { SearchScope } from "../search";
import { registerAgent, ensureAgentsDir } from "../agents";
import type { AgentProfile } from "../types";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;
let originalDataDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "search-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  originalDataDir = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
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
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
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

// ---------------------------------------------------------------------------
// levenshteinDistance
// ---------------------------------------------------------------------------

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("handles single character difference", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("handles transposition (two edits for simple swap)", () => {
    expect(levenshteinDistance("ab", "ba")).toBe(2);
  });

  it("computes correct distance for real typos", () => {
    // "attnetion" vs "attention" — swap of n and t → distance 2
    expect(levenshteinDistance("attnetion", "attention")).toBe(2);
    // "transformer" vs "transformers" — extra s → distance 1
    expect(levenshteinDistance("transformer", "transformers")).toBe(1);
    // "neural" vs "neurla" — transposition → distance 2
    expect(levenshteinDistance("neural", "neurla")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch
// ---------------------------------------------------------------------------

describe("fuzzyMatch", () => {
  it("matches 'attention' against 'attnetion' (edit distance 2, word ≥5 chars)", () => {
    expect(fuzzyMatch("attention", "attnetion")).toBe(true);
  });

  it("matches 'transformer' against 'transformers' (edit distance 1)", () => {
    expect(fuzzyMatch("transformer", "transformers")).toBe(true);
  });

  it("rejects 'AI' vs 'XY' (words ≤2 chars require exact match)", () => {
    expect(fuzzyMatch("AI", "XY")).toBe(false);
  });

  it("matches 'neural' against 'neurla' (transposition)", () => {
    expect(fuzzyMatch("neural", "neurla")).toBe(true);
  });

  it("rejects 'cat' vs 'dog' (distance 3, too high for 3-char word)", () => {
    expect(fuzzyMatch("cat", "dog")).toBe(false);
  });

  it("matches exact strings", () => {
    expect(fuzzyMatch("hello", "hello world")).toBe(true);
  });

  it("returns false for empty query", () => {
    expect(fuzzyMatch("", "some text")).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(fuzzyMatch("query", "")).toBe(false);
  });

  it("requires all query words to match (multi-word)", () => {
    expect(fuzzyMatch("neural network", "neurla networks are great")).toBe(true);
    expect(fuzzyMatch("neural quantum", "neurla networks are great")).toBe(false);
  });

  it("respects maxDistance override", () => {
    // "cat" vs "bat" is distance 1, but with maxDistance 0 it should fail
    expect(fuzzyMatch("cat", "bat", 0)).toBe(false);
    // With maxDistance 1 it should pass
    expect(fuzzyMatch("cat", "bat", 1)).toBe(true);
  });

  it("handles short words (3-4 chars) with distance 1", () => {
    // "map" (3 chars) → max distance 1
    expect(fuzzyMatch("map", "mpa")).toBe(false);  // distance 2 → exceeds limit
    expect(fuzzyMatch("map", "nap")).toBe(true);   // distance 1 → true
    expect(fuzzyMatch("map", "xyz")).toBe(false);  // distance 3 → false
  });
});

// ---------------------------------------------------------------------------
// fuzzySearchWikiContent
// ---------------------------------------------------------------------------

describe("fuzzySearchWikiContent", () => {
  it("returns exact results when enough exist", async () => {
    await ensureDirectories();
    await writeWikiPage("page-a", "# Alpha\n\nAttention mechanisms work well.");
    await writeWikiPage("page-b", "# Beta\n\nAttention is key to transformers.");
    await writeWikiPage("page-c", "# Gamma\n\nAttention layers are stacked.");

    const results = await fuzzySearchWikiContent("attention");
    expect(results.length).toBe(3);
    // None should be flagged as fuzzy
    expect(results.every((r) => !r.fuzzy)).toBe(true);
  });

  it("falls back to fuzzy when exact results are sparse", async () => {
    await ensureDirectories();
    await writeWikiPage("exact-match", "# Exact\n\nAttention is important.");
    await writeWikiPage("typo-match", "# Typo\n\nAttnetion mechanisms are useful.");
    await writeWikiPage("no-match", "# Unrelated\n\nSomething completely different.");

    const results = await fuzzySearchWikiContent("attention");
    // Should have 1 exact + 1 fuzzy
    expect(results.length).toBe(2);
    expect(results[0].slug).toBe("exact-match");
    expect(results[0].fuzzy).toBeFalsy();
    expect(results[1].slug).toBe("typo-match");
    expect(results[1].fuzzy).toBe(true);
  });

  it("returns empty array for empty query", async () => {
    await ensureDirectories();
    const results = await fuzzySearchWikiContent("");
    expect(results).toEqual([]);
  });

  it("does not duplicate pages in exact and fuzzy results", async () => {
    await ensureDirectories();
    await writeWikiPage("transformers", "# Transformers\n\nTransformer architecture details.");

    const results = await fuzzySearchWikiContent("transformer");
    const slugs = results.map((r) => r.slug);
    // Should appear only once
    expect(slugs.filter((s) => s === "transformers").length).toBe(1);
  });

  it("skips fuzzy for very short query terms", async () => {
    await ensureDirectories();
    await writeWikiPage("ai-page", "# AI\n\nArtificial intelligence overview.");
    await writeWikiPage("xy-page", "# XY\n\nSome XY content.");

    // "AI" is ≤2 chars, so fuzzy won't match "XY"
    const results = await fuzzySearchWikiContent("AI");
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("ai-page");
    expect(slugs).not.toContain("xy-page");
  });
});

// ---------------------------------------------------------------------------
// Scoped search — searchWikiContent with scope parameter
// ---------------------------------------------------------------------------

describe("searchWikiContent with scope", () => {
  it("returns all matching pages when no scope is provided", async () => {
    await ensureDirectories();
    await writeWikiPage("alpha", "# Alpha\n\nMachine learning concepts.");
    await writeWikiPage("beta", "# Beta\n\nMore machine learning.");
    await writeWikiPage("gamma", "# Gamma\n\nUnrelated content about cooking.");

    const results = await searchWikiContent("machine learning");
    expect(results).toHaveLength(2);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("alpha");
    expect(slugs).toContain("beta");
  });

  it("returns only pages in the scope's slug list", async () => {
    await ensureDirectories();
    await writeWikiPage("alpha", "# Alpha\n\nMachine learning concepts.");
    await writeWikiPage("beta", "# Beta\n\nMore machine learning.");
    await writeWikiPage("gamma", "# Gamma\n\nMachine learning for cooking.");

    const scope: SearchScope = { agentId: "test", slugs: ["alpha", "gamma"] };
    const results = await searchWikiContent("machine learning", 10, scope);
    expect(results).toHaveLength(2);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("alpha");
    expect(slugs).toContain("gamma");
    expect(slugs).not.toContain("beta");
  });

  it("returns empty when scope slugs don't match any existing pages", async () => {
    await ensureDirectories();
    await writeWikiPage("alpha", "# Alpha\n\nMachine learning concepts.");

    const scope: SearchScope = { agentId: "test", slugs: ["nonexistent"] };
    const results = await searchWikiContent("machine learning", 10, scope);
    expect(results).toEqual([]);
  });

  it("returns empty when scope slugs exist but don't match query", async () => {
    await ensureDirectories();
    await writeWikiPage("alpha", "# Alpha\n\nMachine learning concepts.");
    await writeWikiPage("beta", "# Beta\n\nCooking recipes.");

    const scope: SearchScope = { agentId: "test", slugs: ["beta"] };
    const results = await searchWikiContent("machine learning", 10, scope);
    expect(results).toEqual([]);
  });

  it("scope with empty slugs array returns no results", async () => {
    await ensureDirectories();
    await writeWikiPage("alpha", "# Alpha\n\nMachine learning concepts.");

    const scope: SearchScope = { agentId: "test", slugs: [] };
    const results = await searchWikiContent("machine learning", 10, scope);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scoped search — fuzzySearchWikiContent with scope parameter
// ---------------------------------------------------------------------------

describe("fuzzySearchWikiContent with scope", () => {
  it("applies scope filtering to both exact and fuzzy phases", async () => {
    await ensureDirectories();
    await writeWikiPage("exact-match", "# Exact\n\nAttention is important.");
    await writeWikiPage("typo-match", "# Typo\n\nAttnetion mechanisms are useful.");
    await writeWikiPage("excluded", "# Excluded\n\nAttention should be excluded.");

    // Scope includes exact-match and typo-match, but not excluded
    const scope: SearchScope = { agentId: "test", slugs: ["exact-match", "typo-match"] };
    const results = await fuzzySearchWikiContent("attention", 10, scope);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("exact-match");
    expect(slugs).toContain("typo-match");
    expect(slugs).not.toContain("excluded");
  });

  it("returns no results when scope excludes all matching pages", async () => {
    await ensureDirectories();
    await writeWikiPage("match", "# Match\n\nAttention is important.");

    const scope: SearchScope = { agentId: "test", slugs: ["other-page"] };
    const results = await fuzzySearchWikiContent("attention", 10, scope);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveScope — parse scope strings and resolve to SearchScope
// ---------------------------------------------------------------------------

describe("resolveScope", () => {
  function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
    return {
      id: "yoyo",
      name: "Yoyo",
      description: "A test agent",
      identityPages: ["yoyo-identity"],
      learningPages: ["yoyo-learnings"],
      socialPages: ["yoyo-social"],
      registered: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      ...overrides,
    };
  }

  it("resolves 'agent:yoyo' to the agent's page slugs", async () => {
    await ensureAgentsDir();
    await registerAgent(makeProfile());

    const result = await resolveScope("agent:yoyo");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("yoyo");
    expect(result!.slugs).toEqual(
      expect.arrayContaining(["yoyo-identity", "yoyo-learnings", "yoyo-social"]),
    );
    expect(result!.slugs).toHaveLength(3);
  });

  it("returns null for agent that does not exist", async () => {
    await ensureAgentsDir();
    const result = await resolveScope("agent:nonexistent");
    expect(result).toBeNull();
  });

  it("returns null for invalid scope format", async () => {
    const result = await resolveScope("invalid");
    expect(result).toBeNull();
  });

  it("returns null for empty string", async () => {
    const result = await resolveScope("");
    expect(result).toBeNull();
  });

  it("returns null for scope with unknown prefix", async () => {
    const result = await resolveScope("user:someone");
    expect(result).toBeNull();
  });

  it("combines all three page arrays from agent profile", async () => {
    await ensureAgentsDir();
    await registerAgent(
      makeProfile({
        identityPages: ["id-1", "id-2"],
        learningPages: ["learn-1"],
        socialPages: [],
      }),
    );

    const result = await resolveScope("agent:yoyo");
    expect(result).not.toBeNull();
    expect(result!.slugs).toEqual(["id-1", "id-2", "learn-1"]);
  });

  it("returns empty slugs array when agent has no pages", async () => {
    await ensureAgentsDir();
    await registerAgent(
      makeProfile({
        identityPages: [],
        learningPages: [],
        socialPages: [],
      }),
    );

    const result = await resolveScope("agent:yoyo");
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("yoyo");
    expect(result!.slugs).toEqual([]);
  });
});
