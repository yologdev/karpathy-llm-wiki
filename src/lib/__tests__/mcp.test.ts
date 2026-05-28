import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  handleSearchWiki,
  handleReadPage,
  handleListPages,
  handleCreatePage,
  handleUpdatePage,
  handleDeletePage,
  handleIngestUrl,
  handleIngestText,
  handleQueryWiki,
  handleSaveQueryAnswer,
  handleAgentContext,
  handleSeedAgent,
  handleListAgents,
  handleUpdateAgent,
  handleDeleteAgent,
  handleLintWiki,
  handleFixLintIssue,
  handleListDiscussions,
  handleCreateDiscussion,
  handleResolveDiscussion,
  handleAddComment,
  handleReingest,
  handleIngestHistory,
  handleDataviewQuery,
  handleListRevisions,
  handleReadRevision,
  createMcpServer,
} from "../../mcp";
import { _resetStorage } from "../storage";
import { _resetConfigCache } from "../config";
import { parseFrontmatter } from "../frontmatter";
import { registerAgent } from "../agents";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;
let originalDataDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  originalDataDir = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "raw"), { recursive: true });
  _resetStorage();
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
  _resetStorage();
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

  it("scopes results to agent pages when scope is provided", async () => {
    // Create pages — one belongs to agent, one does not
    await writeTestPage("agent-identity", "# Agent Identity\n\nAgent knowledge about testing.");
    await writeTestPage("global-page", "# Global Page\n\nGlobal knowledge about testing.");

    // Register an agent that owns only agent-identity
    await registerAgent({
      id: "test-bot",
      name: "Test Bot",
      description: "A test agent",
      identityPages: ["agent-identity"],
      learningPages: [],
      socialPages: [],
      registered: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    // Scoped search should only return agent-identity
    const scoped = await handleSearchWiki({ query: "knowledge testing", scope: "agent:test-bot" });
    expect(scoped.every((r) => r.slug === "agent-identity")).toBe(true);

    // Unscoped search should return both
    const unscoped = await handleSearchWiki({ query: "knowledge testing" });
    const slugs = unscoped.map((r) => r.slug);
    expect(slugs).toContain("agent-identity");
    expect(slugs).toContain("global-page");
  });

  it("returns all results when scope is omitted (backward compatible)", async () => {
    await writeTestPage("page-x", "# Page X\n\nUnique searchable content alpha.");

    const results = await handleSearchWiki({ query: "unique searchable content alpha" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].slug).toBe("page-x");
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

  it("sorts by confidence when requested", async () => {
    await writeTestPage(
      "low-conf",
      "---\nconfidence: 0.3\nupdated: '2025-01-01'\n---\n# Low Confidence\n\nLow confidence page.",
    );
    await writeTestPage(
      "high-conf",
      "---\nconfidence: 0.9\nupdated: '2025-01-01'\n---\n# High Confidence\n\nHigh confidence page.",
    );
    await writeTestPage(
      "no-conf",
      "---\nupdated: '2025-01-01'\n---\n# No Confidence\n\nNo confidence field.",
    );
    await writeIndex([
      { title: "Low Confidence", slug: "low-conf", summary: "Low" },
      { title: "High Confidence", slug: "high-conf", summary: "High" },
      { title: "No Confidence", slug: "no-conf", summary: "None" },
    ]);

    const result = await handleListPages({ sort: "confidence" });
    expect(result.length).toBe(3);
    // Highest confidence first
    expect(result[0].slug).toBe("high-conf");
    expect(result[0].confidence).toBe(0.9);
    expect(result[1].slug).toBe("low-conf");
    expect(result[1].confidence).toBe(0.3);
    // No confidence field → sorted last (confidence defaults to 0)
    expect(result[2].slug).toBe("no-conf");
  });

  it("returns empty array when no pages exist", async () => {
    const result = await handleListPages({});
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MCP write tools tests
// ---------------------------------------------------------------------------

describe("MCP write tools", () => {
  describe("create_page", () => {
    it("creates a new page", async () => {
      const result = await handleCreatePage({
        slug: "test-create",
        content: "# Test\n\nBody text here.",
      });

      expect(result.slug).toBe("test-create");
      expect(result.title).toBe("Test");
      expect(result.created).toBe(true);

      // Verify file exists on disk with frontmatter
      const filePath = path.join(tmpDir, "wiki", "test-create.md");
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toContain("---");
      expect(fileContent).toContain("title: Test");
      expect(fileContent).toContain("# Test");
      expect(fileContent).toContain("Body text here.");
    });

    it("includes all yopedia schema fields in frontmatter", async () => {
      await handleCreatePage({
        slug: "schema-check",
        content: "# Schema Test\n\nBody.",
      });

      const filePath = path.join(tmpDir, "wiki", "schema-check.md");
      const fileContent = await fs.readFile(filePath, "utf-8");
      const { data: frontmatter } = parseFrontmatter(fileContent);

      expect(frontmatter.confidence).toBe(0.5);
      expect(frontmatter.expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(frontmatter.authors).toEqual(["agent"]);
      expect(frontmatter.valid_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(frontmatter.disputed).toBe(false);
      expect(frontmatter.contributors).toEqual([]);
      expect(frontmatter.aliases).toEqual([]);
      expect(frontmatter.tags).toEqual([]);

      // expiry should be ~90 days from today
      const today = new Date();
      const expiry = new Date(frontmatter.expiry as string);
      const diffDays = Math.round(
        (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(91);
    });

    it("rejects duplicate slug", async () => {
      await handleCreatePage({
        slug: "dup-page",
        content: "# Duplicate\n\nFirst version.",
      });

      await expect(
        handleCreatePage({
          slug: "dup-page",
          content: "# Duplicate\n\nSecond version.",
        }),
      ).rejects.toThrow("Page already exists: dup-page");
    });

    it("rejects invalid slug", async () => {
      await expect(
        handleCreatePage({
          slug: "",
          content: "# Empty Slug\n\nBody.",
        }),
      ).rejects.toThrow();

      await expect(
        handleCreatePage({
          slug: "INVALID SLUG!",
          content: "# Bad\n\nBody.",
        }),
      ).rejects.toThrow();
    });
  });

  describe("update_page", () => {
    it("updates existing page", async () => {
      // Create first
      await handleCreatePage({
        slug: "update-me",
        content: "# Original\n\nOriginal body.",
      });

      const result = await handleUpdatePage({
        slug: "update-me",
        content: "# Updated\n\nNew body content.",
      });

      expect(result.slug).toBe("update-me");
      expect(result.title).toBe("Updated");
      expect(result.updated).toBe(true);

      // Verify file on disk has new content
      const filePath = path.join(tmpDir, "wiki", "update-me.md");
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toContain("# Updated");
      expect(fileContent).toContain("New body content.");
    });

    it("404 on missing page", async () => {
      await expect(
        handleUpdatePage({
          slug: "nonexistent-page",
          content: "# Ghost\n\nBody.",
        }),
      ).rejects.toThrow("Page not found: nonexistent-page");
    });

    it("preserves frontmatter", async () => {
      // Create a page with specific frontmatter
      await writeTestPage(
        "preserve-fm",
        "---\ntitle: Preserve\ntags: [science, ai]\ncreated: '2025-01-15'\nconfidence: 0.8\n---\n# Preserve\n\nOriginal body.",
      );

      const result = await handleUpdatePage({
        slug: "preserve-fm",
        content: "# Preserve Updated\n\nNew body.",
      });

      expect(result.updated).toBe(true);

      // Verify original frontmatter fields preserved
      const filePath = path.join(tmpDir, "wiki", "preserve-fm.md");
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toContain("tags: [science, ai]");
      expect(fileContent).toContain("confidence: 0.8");
      // The serializer outputs date strings without quotes
      expect(fileContent).toContain("created: 2025-01-15");
      // updated should be bumped to today
      const today = new Date().toISOString().slice(0, 10);
      expect(fileContent).toContain(`updated: ${today}`);
    });

    it("author attribution", async () => {
      await handleCreatePage({
        slug: "author-test",
        content: "# Author Test\n\nBody.",
      });

      const result = await handleUpdatePage({
        slug: "author-test",
        content: "# Author Test\n\nUpdated body.",
        author: "agent-alpha",
      });

      expect(result.slug).toBe("author-test");
      expect(result.updated).toBe(true);
      // The author flows through to writeWikiPageWithSideEffects
      // which stores it in the revision sidecar. We verify the call
      // succeeded without error — deeper attribution is tested in
      // lifecycle/revision tests.
    });
  });
});

// ---------------------------------------------------------------------------
// agent_context tool tests
// ---------------------------------------------------------------------------

describe("agent_context tool", () => {
  /** Helper — write an agent profile JSON to the agents directory. */
  async function writeAgentProfile(profile: {
    id: string;
    name: string;
    description: string;
    identityPages: string[];
    learningPages: string[];
    socialPages: string[];
  }): Promise<void> {
    const agentsDir = path.join(tmpDir, "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    const full = {
      ...profile,
      registered: "2026-05-03",
      lastUpdated: "2026-05-03",
    };
    await fs.writeFile(
      path.join(agentsDir, `${profile.id}.json`),
      JSON.stringify(full),
      "utf-8",
    );
  }

  it("returns agent context with page content", async () => {
    await writeAgentProfile({
      id: "test-agent",
      name: "Test Agent",
      description: "An agent for testing",
      identityPages: ["identity-page"],
      learningPages: ["learnings-page"],
      socialPages: ["social-page"],
    });

    await writeTestPage("identity-page", "# Identity\n\nI am a test agent.");
    await writeTestPage("learnings-page", "# Learnings\n\nI learned things.");
    await writeTestPage("social-page", "# Social\n\nPeople are interesting.");

    const result = await handleAgentContext({ agent_id: "test-agent" });

    // Verify agent info
    expect(result.agent.id).toBe("test-agent");
    expect(result.agent.name).toBe("Test Agent");
    expect(result.agent.description).toBe("An agent for testing");

    // Verify context sections contain page content
    expect(result.context.identity).toContain("I am a test agent.");
    expect(result.context.learnings).toContain("I learned things.");
    expect(result.context.socialWisdom).toContain("People are interesting.");

    // Verify meta
    expect(result.meta.pageCount).toBe(3);
    expect(result.meta.totalChars).toBeGreaterThan(0);
  });

  it("throws for unknown agent", async () => {
    await expect(
      handleAgentContext({ agent_id: "nonexistent-agent" }),
    ).rejects.toThrow("Agent not found");
  });

  it("handles missing wiki pages gracefully", async () => {
    await writeAgentProfile({
      id: "sparse-agent",
      name: "Sparse Agent",
      description: "Agent with missing pages",
      identityPages: ["missing-identity"],
      learningPages: ["missing-learnings"],
      socialPages: ["missing-social"],
    });

    const result = await handleAgentContext({ agent_id: "sparse-agent" });

    // Should return successfully with empty content, not crash
    expect(result.agent.id).toBe("sparse-agent");
    expect(result.context.identity).toBe("");
    expect(result.context.learnings).toBe("");
    expect(result.context.socialWisdom).toBe("");
    expect(result.meta.pageCount).toBe(0);
    expect(result.meta.totalChars).toBe(0);
  });

  it("strips YAML frontmatter from page content", async () => {
    await writeAgentProfile({
      id: "fm-agent",
      name: "Frontmatter Agent",
      description: "Agent with frontmatter pages",
      identityPages: ["fm-identity"],
      learningPages: ["fm-learnings"],
      socialPages: ["fm-social"],
    });

    // Write pages with YAML frontmatter — this is how real wiki pages look
    await writeTestPage(
      "fm-identity",
      "---\nslug: fm-identity\nauthors: [yoyo]\nconfidence: 0.9\nexpiry: 2026-12-01\n---\n# Identity\n\nI am an agent with frontmatter.",
    );
    await writeTestPage(
      "fm-learnings",
      "---\nslug: fm-learnings\ntags: [learning]\n---\n# Learnings\n\nI learned to strip frontmatter.",
    );
    await writeTestPage(
      "fm-social",
      "---\nslug: fm-social\nconfidence: 0.8\n---\n# Social\n\nPeople are great.",
    );

    const result = await handleAgentContext({ agent_id: "fm-agent" });

    // Content should NOT contain YAML frontmatter delimiters from metadata
    expect(result.context.identity).not.toMatch(/^---/m);
    expect(result.context.learnings).not.toMatch(/^---/m);
    expect(result.context.socialWisdom).not.toMatch(/^---/m);

    // Content should NOT contain frontmatter fields
    expect(result.context.identity).not.toContain("slug: fm-identity");
    expect(result.context.identity).not.toContain("confidence: 0.9");

    // Content SHOULD contain the actual body text
    expect(result.context.identity).toContain("I am an agent with frontmatter.");
    expect(result.context.learnings).toContain("I learned to strip frontmatter.");
    expect(result.context.socialWisdom).toContain("People are great.");

    expect(result.meta.pageCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// seed_agent tool tests
// ---------------------------------------------------------------------------

describe("seed_agent tool", () => {
  it("creates agent and returns profile", async () => {
    const result = await handleSeedAgent({
      agent_id: "new-agent",
      name: "New Agent",
      description: "A freshly seeded agent",
      sections: [
        {
          slug: "new-agent-identity",
          title: "New Agent Identity",
          type: "identity",
          content: "I am a new agent.",
        },
        {
          slug: "new-agent-learnings",
          title: "New Agent Learnings",
          type: "learnings",
          content: "I have learned nothing yet.",
        },
        {
          slug: "new-agent-social",
          title: "New Agent Social",
          type: "social",
          content: "No social wisdom yet.",
        },
      ],
    });

    // Returns AgentProfile
    expect(result.id).toBe("new-agent");
    expect(result.name).toBe("New Agent");
    expect(result.description).toBe("A freshly seeded agent");
    expect(result.identityPages).toEqual(["new-agent-identity"]);
    expect(result.learningPages).toEqual(["new-agent-learnings"]);
    expect(result.socialPages).toEqual(["new-agent-social"]);
    expect(result.registered).toBeDefined();
    expect(result.lastUpdated).toBeDefined();

    // Verify wiki pages were created
    const identityPage = await fs.readFile(
      path.join(tmpDir, "wiki", "new-agent-identity.md"),
      "utf-8",
    );
    expect(identityPage).toContain("I am a new agent.");

    // Verify agent profile JSON was created
    const profileJson = await fs.readFile(
      path.join(tmpDir, "agents", "new-agent.json"),
      "utf-8",
    );
    const profile = JSON.parse(profileJson);
    expect(profile.id).toBe("new-agent");
  });

  it("throws with missing required field", async () => {
    await expect(
      handleSeedAgent({
        agent_id: "bad-agent",
        name: "",
        description: "Has no name",
        sections: [],
      }),
    ).rejects.toThrow();
  });

  it("is idempotent — re-seeding updates existing pages", async () => {
    // First seed
    const first = await handleSeedAgent({
      agent_id: "idempotent-agent",
      name: "Idempotent Agent",
      description: "Will be seeded twice",
      sections: [
        {
          slug: "idempotent-identity",
          title: "Identity",
          type: "identity",
          content: "Version 1 content.",
        },
      ],
    });

    expect(first.id).toBe("idempotent-agent");
    const firstRegistered = first.registered;

    // Re-seed with updated content
    const second = await handleSeedAgent({
      agent_id: "idempotent-agent",
      name: "Idempotent Agent v2",
      description: "Updated description",
      sections: [
        {
          slug: "idempotent-identity",
          title: "Identity v2",
          type: "identity",
          content: "Version 2 content.",
        },
      ],
    });

    // Should preserve original registration date
    expect(second.registered).toBe(firstRegistered);
    // But update the name and description
    expect(second.name).toBe("Idempotent Agent v2");
    expect(second.description).toBe("Updated description");

    // Wiki page should have updated content
    const pageContent = await fs.readFile(
      path.join(tmpDir, "wiki", "idempotent-identity.md"),
      "utf-8",
    );
    expect(pageContent).toContain("Version 2 content.");
    expect(pageContent).not.toContain("Version 1 content.");
  });
});

// ---------------------------------------------------------------------------
// delete_page tests
// ---------------------------------------------------------------------------

describe("delete_page", () => {
  it("deletes an existing page and returns confirmation", async () => {
    // Create a page first
    await handleCreatePage({
      slug: "to-delete",
      content: "# To Delete\n\nThis page will be deleted.",
    });

    // Verify it exists
    const page = await handleReadPage({ slug: "to-delete" });
    expect(page.slug).toBe("to-delete");

    // Delete it
    const result = await handleDeletePage({ slug: "to-delete" });
    expect(result.slug).toBe("to-delete");
    expect(result.removedFromIndex).toBe(true);

    // Verify it's gone
    await expect(handleReadPage({ slug: "to-delete" })).rejects.toThrow(
      "Page not found",
    );
  });

  it("throws error for non-existent slug", async () => {
    await expect(
      handleDeletePage({ slug: "does-not-exist" }),
    ).rejects.toThrow("page not found");
  });

  it("strips backlinks from other pages when deleting", async () => {
    // Create two pages, one linking to the other
    await handleCreatePage({
      slug: "keeper",
      content:
        "# Keeper\n\nThis page links to [Target](target.md).\n\n**See also:** [Target](target.md)",
    });
    await handleCreatePage({
      slug: "target",
      content: "# Target\n\nThis is the target page.",
    });

    // Delete the target
    const result = await handleDeletePage({ slug: "target" });
    expect(result.slug).toBe("target");

    // The keeper page should have had backlinks stripped
    const keeper = await handleReadPage({ slug: "keeper" });
    expect(keeper.content).not.toContain("[Target](target.md)");
  });
});

// ---------------------------------------------------------------------------
// ingest_url tests
// ---------------------------------------------------------------------------

describe("ingest_url", () => {
  it("rejects invalid URLs", async () => {
    await expect(
      handleIngestUrl({ url: "not-a-url" }),
    ).rejects.toThrow("Invalid URL");
  });

  it("rejects URLs without http/https protocol", async () => {
    await expect(
      handleIngestUrl({ url: "ftp://example.com/page" }),
    ).rejects.toThrow("Invalid URL");
  });

  it("validates URL format before calling ingest", async () => {
    // Should throw immediately for obviously bad URLs
    // (not after trying to fetch)
    await expect(
      handleIngestUrl({ url: "" }),
    ).rejects.toThrow("Invalid URL");
  });
});

// ---------------------------------------------------------------------------
// ingest_text tests
// ---------------------------------------------------------------------------

describe("ingest_text", () => {
  it("rejects empty content", async () => {
    await expect(
      handleIngestText({ content: "" }),
    ).rejects.toThrow("content is required and must be non-empty");
  });

  it("rejects whitespace-only content", async () => {
    await expect(
      handleIngestText({ content: "   \n\t  " }),
    ).rejects.toThrow("content is required and must be non-empty");
  });

  it("ingests valid text content and creates a wiki page", async () => {
    // Temporarily unset LLM keys so ingest uses the fallback (no-LLM) path
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    _resetConfigCache();
    try {
      const result = await handleIngestText({
        content: "Quantum computing uses qubits to perform calculations exponentially faster than classical computers for certain problems.",
        title: "Quantum Computing",
        tags: ["science", "computing"],
      });

      expect(result.slug).toBeTruthy();
      expect(result.title).toBeTruthy();
      expect(result.summary).toBeTruthy();
      expect(result.sourceUrl).toBe("");

      // Verify the page was actually created
      const page = await handleReadPage({ slug: result.slug });
      expect(page.content).toBeTruthy();
    } finally {
      if (savedKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = savedKey;
      }
      _resetConfigCache();
    }
  });

  it("auto-generates title from content when title is omitted", async () => {
    // Temporarily unset LLM keys so ingest uses the fallback (no-LLM) path
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    _resetConfigCache();
    try {
      const result = await handleIngestText({
        content: "Machine learning is a subset of artificial intelligence that enables systems to learn from data.",
      });

      expect(result.slug).toBeTruthy();
      expect(result.title).toBeTruthy();
      expect(result.sourceUrl).toBe("");
    } finally {
      if (savedKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = savedKey;
      }
      _resetConfigCache();
    }
  });
});

// ---------------------------------------------------------------------------
// query_wiki tests
// ---------------------------------------------------------------------------

describe("query_wiki", () => {
  it("returns structured result with answer and sources fields on empty wiki", async () => {
    const result = await handleQueryWiki({ question: "What is AI?" });
    expect(result).toHaveProperty("answer");
    expect(result).toHaveProperty("sources");
    expect(typeof result.answer).toBe("string");
    expect(Array.isArray(result.sources)).toBe(true);
  });

  it("returns informative message when wiki is empty", async () => {
    const result = await handleQueryWiki({ question: "Tell me about neural networks" });
    expect(result.answer).toContain("empty");
    expect(result.sources).toEqual([]);
  });

  it("returns no-API-key fallback when wiki has pages but no LLM key", async () => {
    // Write a page directly to the filesystem (avoids side effects from create)
    await writeTestPage(
      "test-topic",
      "---\ntags: [test]\n---\n# Test Topic\n\nSome content about testing.",
    );
    await writeIndex([
      {
        title: "Test Topic",
        slug: "test-topic",
        summary: "Some content about testing",
      },
    ]);

    // Temporarily clear all LLM keys so query() takes the no-key fallback path
    const savedKeys: Record<string, string | undefined> = {};
    const keyNames = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "OLLAMA_BASE_URL",
      "OLLAMA_MODEL",
    ];
    for (const k of keyNames) {
      savedKeys[k] = process.env[k];
      delete process.env[k];
    }
    _resetConfigCache(); // ensure loadConfigSync doesn't return cached provider

    try {
      const result = await handleQueryWiki({ question: "What about testing?" });
      // Without an API key, it should return the "No API key" message with page list
      expect(result.answer).toContain("test-topic");
      expect(result.sources).toEqual([]);
    } finally {
      // Restore all keys
      for (const k of keyNames) {
        if (savedKeys[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = savedKeys[k];
        }
      }
      _resetConfigCache();
    }
  });

  it("accepts format parameter without error", async () => {
    // Verify each format value is accepted
    const formats = ["prose", "table", "slides"] as const;
    for (const format of formats) {
      const result = await handleQueryWiki({
        question: "What is AI?",
        format,
      });
      expect(result).toHaveProperty("answer");
      expect(result).toHaveProperty("sources");
    }
  });

  it("defaults to prose format when not specified", async () => {
    const result = await handleQueryWiki({ question: "What is AI?" });
    // Should work without error — prose is the default
    expect(result).toHaveProperty("answer");
  });

  it("accepts scope parameter without error", async () => {
    // Even with an invalid agent scope, should return a result (not crash)
    const result = await handleQueryWiki({
      question: "What is AI?",
      scope: "agent:nonexistent-agent",
    });
    expect(result).toHaveProperty("answer");
    expect(result).toHaveProperty("sources");
    // Invalid scope returns a descriptive message
    expect(result.answer).toContain("nonexistent-agent");
  });

  it("returns scoped message for agent with no pages", async () => {
    // Register an agent with no pages
    await registerAgent({
      id: "empty-bot",
      name: "Empty Bot",
      description: "An agent with no pages",
      identityPages: [],
      learningPages: [],
      socialPages: [],
      registered: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    const result = await handleQueryWiki({
      question: "anything",
      scope: "agent:empty-bot",
    });
    // Should indicate no pages found for this scope
    expect(result.answer).toContain("No pages found");
    expect(result.sources).toEqual([]);
  });

  it("works without scope (backward compatible)", async () => {
    const result = await handleQueryWiki({ question: "What is AI?" });
    expect(result).toHaveProperty("answer");
    expect(result).toHaveProperty("sources");
  });
});

// ---------------------------------------------------------------------------
// save_query_answer tests
// ---------------------------------------------------------------------------

describe("save_query_answer", () => {
  it("saves an answer as a wiki page and returns slug", async () => {
    await writeIndex([]);

    const result = await handleSaveQueryAnswer({
      question: "What is machine learning?",
      answer: "Machine learning is a subset of AI that learns from data.",
    });

    expect(result.slug).toBe("what-is-machine-learning");
    expect(result.success).toBe(true);

    // Verify the page was actually written
    const page = await handleReadPage({ slug: "what-is-machine-learning" });
    expect(page.content).toContain("Machine learning is a subset of AI");
  });

  it("uses explicit slug when provided", async () => {
    await writeIndex([]);

    const result = await handleSaveQueryAnswer({
      question: "What is deep learning?",
      answer: "Deep learning uses neural networks with many layers.",
      slug: "deep-learning-overview",
    });

    expect(result.slug).toBe("deep-learning-overview");
    expect(result.success).toBe(true);

    // Verify the page exists at the explicit slug
    const page = await handleReadPage({ slug: "deep-learning-overview" });
    expect(page.content).toContain("Deep learning uses neural networks");
  });

  it("sets proper frontmatter on saved page", async () => {
    await writeIndex([]);

    await handleSaveQueryAnswer({
      question: "What is NLP?",
      answer: "Natural language processing deals with text and language.",
    });

    const page = await handleReadPage({ slug: "what-is-nlp" });
    expect(page.frontmatter).toBeDefined();
    expect(page.frontmatter.source).toBe("query");
    expect(page.frontmatter.tags).toContain("query-answer");
    expect(page.frontmatter.confidence).toBe(0.5);
    expect(page.frontmatter.authors).toContain("system");
  });

  it("throws when question is empty", async () => {
    await expect(
      handleSaveQueryAnswer({
        question: "",
        answer: "Some answer.",
      }),
    ).rejects.toThrow("question is required");
  });

  it("throws when answer is empty", async () => {
    await expect(
      handleSaveQueryAnswer({
        question: "A question?",
        answer: "",
      }),
    ).rejects.toThrow("answer is required");
  });

  it("accepts optional sources parameter without error", async () => {
    await writeIndex([]);

    const result = await handleSaveQueryAnswer({
      question: "How does reinforcement learning work?",
      answer: "RL uses rewards to train agents.",
      sources: ["machine-learning", "ai-fundamentals"],
    });

    expect(result.slug).toBeTruthy();
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lint_wiki tests
// ---------------------------------------------------------------------------

describe("lint_wiki", () => {
  it("returns empty issues for a clean wiki", async () => {
    await writeTestPage(
      "test-page",
      '---\ntags: [test]\nconfidence: 0.8\nexpiry: 2099-01-01\ncreated: 2025-01-01\nupdated: 2025-01-01\nauthors: [tester]\nsources: \'[{"type":"url","url":"https://example.com","fetched":"2025-01-01","triggered_by":"tester"}]\'\n---\n# Test Page\n\nSome content here.',
    );
    await writeIndex([
      { title: "Test Page", slug: "test-page", summary: "Some content here." },
    ]);

    const result = await handleLintWiki({});
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("checkedAt");
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("detects orphan pages", async () => {
    // Page exists on disk but not in index
    await writeTestPage(
      "orphan-page",
      "---\ntags: [test]\n---\n# Orphan Page\n\nThis page is not in the index.",
    );
    await writeIndex([]); // empty index

    const result = await handleLintWiki({ checks: ["orphan-page"] });
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    const orphanIssues = result.issues.filter((i) => i.type === "orphan-page");
    expect(orphanIssues.length).toBe(1);
    expect(orphanIssues[0].slug).toBe("orphan-page");
  });

  it("detects stale index entries", async () => {
    // Index references a page that doesn't exist on disk
    await writeIndex([
      { title: "Ghost Page", slug: "ghost-page", summary: "Not on disk." },
    ]);

    const result = await handleLintWiki({ checks: ["stale-index"] });
    const staleIssues = result.issues.filter((i) => i.type === "stale-index");
    expect(staleIssues.length).toBe(1);
    expect(staleIssues[0].slug).toBe("ghost-page");
  });

  it("scopes checks via the checks parameter", async () => {
    await writeTestPage(
      "lonely-page",
      "---\ntags: [test]\n---\n# Lonely\n\nNo index entry.",
    );
    await writeIndex([]);

    // Only run stale-index — should not find orphan-page issues
    const result = await handleLintWiki({ checks: ["stale-index"] });
    const orphanIssues = result.issues.filter((i) => i.type === "orphan-page");
    expect(orphanIssues.length).toBe(0);
  });

  it("filters by minSeverity", async () => {
    // Create a setup that produces info-level issues (orphan is warning)
    await writeTestPage(
      "orphan-sev",
      "---\ntags: [test]\n---\n# Orphan\n\nOrphan page.",
    );
    await writeIndex([]);

    // With minSeverity=error, warning-level orphan issues should be excluded
    const result = await handleLintWiki({
      checks: ["orphan-page"],
      minSeverity: "error",
    });
    expect(result.issues.length).toBe(0);
  });

  it("rejects invalid check types", async () => {
    await expect(
      handleLintWiki({ checks: ["nonexistent-check"] }),
    ).rejects.toThrow("Invalid check type");
  });

  it("rejects invalid minSeverity", async () => {
    await expect(
      handleLintWiki({ minSeverity: "extreme" }),
    ).rejects.toThrow("Invalid minSeverity");
  });
});

// ---------------------------------------------------------------------------
// fix_lint_issue tests
// ---------------------------------------------------------------------------

describe("fix_lint_issue", () => {
  it("fixes an orphan page by adding it to the index", async () => {
    await writeTestPage(
      "orphan-fix",
      "---\ntags: [test]\n---\n# Orphan Fix\n\nThis page should be added to the index.",
    );
    await writeIndex([]);

    const result = await handleFixLintIssue({
      type: "orphan-page",
      slug: "orphan-fix",
    });

    expect(result.success).toBe(true);
    expect(result.slug).toBe("orphan-fix");
    expect(result.message).toContain("orphan-fix");
  });

  it("fixes a stale index entry by removing it", async () => {
    await writeIndex([
      { title: "Stale Entry", slug: "stale-entry", summary: "Gone." },
    ]);

    const result = await handleFixLintIssue({
      type: "stale-index",
      slug: "stale-entry",
    });

    expect(result.success).toBe(true);
    expect(result.slug).toBe("stale-entry");
  });

  it("fixes an empty page by deleting it", async () => {
    await writeTestPage("empty-page", "---\ntags: []\n---\n");
    await writeIndex([
      { title: "Empty Page", slug: "empty-page", summary: "" },
    ]);

    const result = await handleFixLintIssue({
      type: "empty-page",
      slug: "empty-page",
    });

    expect(result.success).toBe(true);
    expect(result.slug).toBe("empty-page");
  });

  it("throws for page not found", async () => {
    await writeIndex([]);
    await expect(
      handleFixLintIssue({
        type: "orphan-page",
        slug: "nonexistent-page",
      }),
    ).rejects.toThrow("Page not found");
  });

  it("throws for unsupported fix type", async () => {
    await expect(
      handleFixLintIssue({
        type: "made-up-type",
        slug: "some-page",
      }),
    ).rejects.toThrow("not supported");
  });

  it("throws for low-confidence (not auto-fixable)", async () => {
    await expect(
      handleFixLintIssue({
        type: "low-confidence",
        slug: "some-page",
      }),
    ).rejects.toThrow("cannot be auto-fixed");
  });

  it("passes target parameter for cross-ref fixes", async () => {
    // Set up source and target pages
    await writeTestPage(
      "source-page",
      "---\ntags: [test]\n---\n# Source Page\n\nSome content about a topic.",
    );
    await writeTestPage(
      "target-page",
      "---\ntags: [test]\n---\n# Target Page\n\nRelated content.",
    );
    await writeIndex([
      { title: "Source Page", slug: "source-page", summary: "Source." },
      { title: "Target Page", slug: "target-page", summary: "Target." },
    ]);

    const result = await handleFixLintIssue({
      type: "missing-crossref",
      slug: "source-page",
      target: "target-page",
    });

    expect(result.success).toBe(true);
    expect(result.slug).toBe("source-page");
  });
});

// ---------------------------------------------------------------------------
// list_discussions tests
// ---------------------------------------------------------------------------

describe("list_discussions", () => {
  it("returns empty threads array for page with no discussions", async () => {
    await writeTestPage(
      "no-talk",
      "---\ntags: [test]\n---\n# No Talk\n\nA page with no discussions.",
    );

    const result = await handleListDiscussions({ pageSlug: "no-talk" });
    expect(result.pageSlug).toBe("no-talk");
    expect(result.threads).toEqual([]);
  });

  it("returns threads with status, author, and commentCount", async () => {
    await writeTestPage(
      "test-page",
      "---\ntags: [test]\n---\n# Test Page\n\nContent.",
    );

    // Create a discussion first
    await handleCreateDiscussion({
      pageSlug: "test-page",
      title: "Accuracy concern",
      body: "The first paragraph seems inaccurate.",
      author: "yoyo",
    });

    const result = await handleListDiscussions({ pageSlug: "test-page" });
    expect(result.pageSlug).toBe("test-page");
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].index).toBe(0);
    expect(result.threads[0].title).toBe("Accuracy concern");
    expect(result.threads[0].status).toBe("open");
    expect(result.threads[0].author).toBe("yoyo");
    expect(result.threads[0].commentCount).toBe(1);
    expect(result.threads[0].created).toBeDefined();
    expect(result.threads[0].updated).toBeDefined();
  });

  it("returns multiple threads with correct indices", async () => {
    await writeTestPage(
      "multi-talk",
      "---\ntags: [test]\n---\n# Multi Talk\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "multi-talk",
      title: "First thread",
      body: "First body.",
      author: "alice",
    });
    await handleCreateDiscussion({
      pageSlug: "multi-talk",
      title: "Second thread",
      body: "Second body.",
      author: "bob",
    });

    const result = await handleListDiscussions({ pageSlug: "multi-talk" });
    expect(result.threads).toHaveLength(2);
    expect(result.threads[0].index).toBe(0);
    expect(result.threads[0].title).toBe("First thread");
    expect(result.threads[0].author).toBe("alice");
    expect(result.threads[1].index).toBe(1);
    expect(result.threads[1].title).toBe("Second thread");
    expect(result.threads[1].author).toBe("bob");
  });
});

// ---------------------------------------------------------------------------
// create_discussion tests
// ---------------------------------------------------------------------------

describe("create_discussion", () => {
  it("creates a new thread and returns it", async () => {
    await writeTestPage(
      "new-topic",
      "---\ntags: [test]\n---\n# New Topic\n\nContent.",
    );

    const result = await handleCreateDiscussion({
      pageSlug: "new-topic",
      title: "Citation needed",
      body: "The claim in paragraph 2 needs a source.",
      author: "yoyo",
    });

    expect(result.pageSlug).toBe("new-topic");
    expect(result.title).toBe("Citation needed");
    expect(result.status).toBe("open");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].author).toBe("yoyo");
    expect(result.comments[0].body).toBe(
      "The claim in paragraph 2 needs a source.",
    );
    expect(result.created).toBeDefined();
    expect(result.updated).toBeDefined();
  });

  it("throws when pageSlug is empty", async () => {
    await expect(
      handleCreateDiscussion({
        pageSlug: "",
        title: "Test",
        body: "Test body",
        author: "yoyo",
      }),
    ).rejects.toThrow("pageSlug is required");
  });

  it("throws when title is empty", async () => {
    await expect(
      handleCreateDiscussion({
        pageSlug: "some-page",
        title: "",
        body: "Test body",
        author: "yoyo",
      }),
    ).rejects.toThrow("title must be a non-empty string");
  });

  it("throws when body is empty", async () => {
    await expect(
      handleCreateDiscussion({
        pageSlug: "some-page",
        title: "Test",
        body: "",
        author: "yoyo",
      }),
    ).rejects.toThrow("body must be a non-empty string");
  });

  it("throws when author is empty", async () => {
    await expect(
      handleCreateDiscussion({
        pageSlug: "some-page",
        title: "Test",
        body: "Test body",
        author: "",
      }),
    ).rejects.toThrow("author must be a non-empty string");
  });
});

// ---------------------------------------------------------------------------
// resolve_discussion tests
// ---------------------------------------------------------------------------

describe("resolve_discussion", () => {
  it("resolves a thread as resolved", async () => {
    await writeTestPage(
      "resolve-test",
      "---\ntags: [test]\n---\n# Resolve Test\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "resolve-test",
      title: "Outdated info",
      body: "This section is outdated.",
      author: "yoyo",
    });

    const result = await handleResolveDiscussion({
      pageSlug: "resolve-test",
      threadIndex: 0,
      resolution: "resolved",
    });

    expect(result.status).toBe("resolved");
    expect(result.title).toBe("Outdated info");
  });

  it("resolves a thread as wontfix", async () => {
    await writeTestPage(
      "wontfix-test",
      "---\ntags: [test]\n---\n# Wontfix Test\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "wontfix-test",
      title: "Minor issue",
      body: "Not worth fixing.",
      author: "yoyo",
    });

    const result = await handleResolveDiscussion({
      pageSlug: "wontfix-test",
      threadIndex: 0,
      resolution: "wontfix",
    });

    expect(result.status).toBe("wontfix");
  });

  it("throws for invalid threadIndex", async () => {
    await writeTestPage(
      "invalid-idx",
      "---\ntags: [test]\n---\n# Invalid Index\n\nContent.",
    );

    await expect(
      handleResolveDiscussion({
        pageSlug: "invalid-idx",
        threadIndex: 99,
        resolution: "resolved",
      }),
    ).rejects.toThrow("thread index 99 not found");
  });

  it("throws for missing pageSlug", async () => {
    await expect(
      handleResolveDiscussion({
        pageSlug: "",
        threadIndex: 0,
        resolution: "resolved",
      }),
    ).rejects.toThrow("pageSlug is required");
  });

  it("shows resolved status in list_discussions", async () => {
    await writeTestPage(
      "list-resolved",
      "---\ntags: [test]\n---\n# List Resolved\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "list-resolved",
      title: "Thread to resolve",
      body: "Will be resolved.",
      author: "yoyo",
    });

    await handleResolveDiscussion({
      pageSlug: "list-resolved",
      threadIndex: 0,
      resolution: "resolved",
    });

    const list = await handleListDiscussions({ pageSlug: "list-resolved" });
    expect(list.threads[0].status).toBe("resolved");
  });

  it("reopens a resolved thread via open status", async () => {
    await writeTestPage(
      "reopen-test",
      "---\ntags: [test]\n---\n# Reopen Test\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "reopen-test",
      title: "Premature resolution",
      body: "Resolved too early.",
      author: "yoyo",
    });

    await handleResolveDiscussion({
      pageSlug: "reopen-test",
      threadIndex: 0,
      resolution: "resolved",
    });

    const result = await handleResolveDiscussion({
      pageSlug: "reopen-test",
      threadIndex: 0,
      resolution: "open",
    });

    expect(result.status).toBe("open");

    const list = await handleListDiscussions({ pageSlug: "reopen-test" });
    expect(list.threads[0].status).toBe("open");
  });

  it("reopens a wontfix thread via open status", async () => {
    await writeTestPage(
      "reopen-wontfix-test",
      "---\ntags: [test]\n---\n# Reopen Wontfix\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "reopen-wontfix-test",
      title: "Dismissed too soon",
      body: "This was dismissed but needs revisiting.",
      author: "yoyo",
    });

    await handleResolveDiscussion({
      pageSlug: "reopen-wontfix-test",
      threadIndex: 0,
      resolution: "wontfix",
    });

    const result = await handleResolveDiscussion({
      pageSlug: "reopen-wontfix-test",
      threadIndex: 0,
      resolution: "open",
    });

    expect(result.status).toBe("open");
  });
});

// ---------------------------------------------------------------------------
// add_comment tests
// ---------------------------------------------------------------------------

describe("add_comment", () => {
  it("adds a comment to an existing thread", async () => {
    await writeTestPage(
      "comment-page",
      "---\ntags: [test]\n---\n# Comment Page\n\nContent.",
    );

    // Create a thread first
    await handleCreateDiscussion({
      pageSlug: "comment-page",
      title: "A discussion",
      body: "Initial message",
      author: "yoyo",
    });

    // Add a comment
    const comment = await handleAddComment({
      pageSlug: "comment-page",
      threadIndex: 0,
      content: "This is a reply",
      author: "agent-2",
    });

    expect(comment.author).toBe("agent-2");
    expect(comment.body).toBe("This is a reply");
    expect(comment.id).toBeDefined();
    expect(comment.parentId).toBeNull();

    // Verify the comment appears in the thread listing
    const list = await handleListDiscussions({ pageSlug: "comment-page" });
    expect(list.threads[0].commentCount).toBe(2); // original + reply
  });

  it("adds a threaded reply with parentId", async () => {
    await writeTestPage(
      "threaded-reply",
      "---\ntags: [test]\n---\n# Threaded Reply\n\nContent.",
    );

    const thread = await handleCreateDiscussion({
      pageSlug: "threaded-reply",
      title: "Thread for reply",
      body: "Top-level message",
      author: "yoyo",
    });

    const parentId = thread.comments[0].id;

    const reply = await handleAddComment({
      pageSlug: "threaded-reply",
      threadIndex: 0,
      content: "Nested reply",
      author: "agent-3",
      parentId,
    });

    expect(reply.parentId).toBe(parentId);
    expect(reply.body).toBe("Nested reply");
  });

  it("defaults author to anonymous when omitted", async () => {
    await writeTestPage(
      "anon-comment",
      "---\ntags: [test]\n---\n# Anon Comment\n\nContent.",
    );

    await handleCreateDiscussion({
      pageSlug: "anon-comment",
      title: "Thread",
      body: "First message",
      author: "yoyo",
    });

    const comment = await handleAddComment({
      pageSlug: "anon-comment",
      threadIndex: 0,
      content: "Anonymous contribution",
    });

    expect(comment.author).toBe("anonymous");
  });

  it("throws for missing pageSlug", async () => {
    await expect(
      handleAddComment({
        pageSlug: "",
        threadIndex: 0,
        content: "test",
      }),
    ).rejects.toThrow("pageSlug is required");
  });

  it("throws for missing content", async () => {
    await expect(
      handleAddComment({
        pageSlug: "some-page",
        threadIndex: 0,
        content: "",
      }),
    ).rejects.toThrow("body must be a non-empty string");
  });

  it("throws for invalid threadIndex", async () => {
    await writeTestPage(
      "bad-idx-comment",
      "---\ntags: [test]\n---\n# Bad Index\n\nContent.",
    );

    await expect(
      handleAddComment({
        pageSlug: "bad-idx-comment",
        threadIndex: 99,
        content: "test comment",
        author: "yoyo",
      }),
    ).rejects.toThrow("thread index 99 not found");
  });
});

// ---------------------------------------------------------------------------
// reingest tests
// ---------------------------------------------------------------------------

describe("reingest", () => {
  it("throws for missing slug", async () => {
    await expect(
      handleReingest({ slug: "" }),
    ).rejects.toThrow("slug is required");
  });

  it("throws for non-existent page", async () => {
    await expect(
      handleReingest({ slug: "nonexistent-page" }),
    ).rejects.toThrow('page "nonexistent-page" not found');
  });

  it("throws for page without source_url", async () => {
    await writeTestPage(
      "no-source",
      "---\ntags: [test]\n---\n# No Source\n\nThis page has no source URL.",
    );
    await writeIndex([
      { title: "No Source", slug: "no-source", summary: "No source URL" },
    ]);

    await expect(
      handleReingest({ slug: "no-source" }),
    ).rejects.toThrow("no source URL recorded");
  });
});

// ---------------------------------------------------------------------------
// ingest_history
// ---------------------------------------------------------------------------

describe("ingest_history", () => {
  it("returns empty array when no ledger file exists", async () => {
    const result = await handleIngestHistory({});
    expect(result).toEqual({ entries: [] });
  });

  it("returns empty array with explicit limit", async () => {
    const result = await handleIngestHistory({ limit: 10 });
    expect(result).toEqual({ entries: [] });
  });

  it("returns ledger entries when ledger exists", async () => {
    // Write a ledger file with two entries
    const dataDir = path.join(tmpDir, "data");
    await fs.mkdir(dataDir, { recursive: true });
    const ledgerPath = path.join(dataDir, "ingest-ledger.jsonl");
    const entry1 = {
      ingest_id: "test-1",
      source_type: "url",
      source_url: "https://example.com/a",
      primary_slug: "example-a",
      related_slugs: [],
      started_at: "2025-01-01T00:00:00Z",
      finished_at: "2025-01-01T00:01:00Z",
      status: "ok",
    };
    const entry2 = {
      ingest_id: "test-2",
      source_type: "text",
      source_url: "",
      primary_slug: "pasted-text",
      related_slugs: ["related-page"],
      started_at: "2025-01-02T00:00:00Z",
      finished_at: "2025-01-02T00:01:00Z",
      status: "ok",
    };
    await fs.writeFile(
      ledgerPath,
      JSON.stringify(entry1) + "\n" + JSON.stringify(entry2) + "\n",
    );

    const result = await handleIngestHistory({});
    expect(result.entries).toHaveLength(2);
    // Most recent first
    expect(result.entries[0].ingest_id).toBe("test-2");
    expect(result.entries[1].ingest_id).toBe("test-1");
  });

  it("respects limit parameter", async () => {
    const dataDir = path.join(tmpDir, "data");
    await fs.mkdir(dataDir, { recursive: true });
    const ledgerPath = path.join(dataDir, "ingest-ledger.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < 5; i++) {
      lines.push(
        JSON.stringify({
          ingest_id: `test-${i}`,
          source_type: "url",
          source_url: `https://example.com/${i}`,
          primary_slug: `page-${i}`,
          related_slugs: [],
          started_at: `2025-01-0${i + 1}T00:00:00Z`,
          finished_at: `2025-01-0${i + 1}T00:01:00Z`,
          status: "ok",
        }),
      );
    }
    await fs.writeFile(ledgerPath, lines.join("\n") + "\n");

    const result = await handleIngestHistory({ limit: 2 });
    expect(result.entries).toHaveLength(2);
    // Most recent first — last entry should come first
    expect(result.entries[0].ingest_id).toBe("test-4");
    expect(result.entries[1].ingest_id).toBe("test-3");
  });

  it("defaults to limit 50 when not specified", async () => {
    const dataDir = path.join(tmpDir, "data");
    await fs.mkdir(dataDir, { recursive: true });
    const ledgerPath = path.join(dataDir, "ingest-ledger.jsonl");
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(
        JSON.stringify({
          ingest_id: `test-${i}`,
          source_type: "url",
          source_url: `https://example.com/${i}`,
          primary_slug: `page-${i}`,
          related_slugs: [],
          started_at: "2025-01-01T00:00:00Z",
          finished_at: "2025-01-01T00:01:00Z",
          status: "ok",
        }),
      );
    }
    await fs.writeFile(ledgerPath, lines.join("\n") + "\n");

    const result = await handleIngestHistory({});
    expect(result.entries).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// create_page author attribution tests
// ---------------------------------------------------------------------------

describe("handleCreatePage author attribution", () => {
  it("sets authors to provided author", async () => {
    await writeIndex([]);
    const result = await handleCreatePage({
      slug: "test-page",
      content: "# Test Page\n\nSome content.",
      author: "yoyo",
    });
    expect(result.created).toBe(true);

    const raw = await fs.readFile(
      path.join(tmpDir, "wiki", "test-page.md"),
      "utf-8",
    );
    const parsed = parseFrontmatter(raw);
    expect(parsed.data.authors).toEqual(["yoyo"]);
  });

  it("defaults authors to agent when no author provided", async () => {
    await writeIndex([]);
    const result = await handleCreatePage({
      slug: "default-author",
      content: "# Default\n\nContent.",
    });
    expect(result.created).toBe(true);

    const raw = await fs.readFile(
      path.join(tmpDir, "wiki", "default-author.md"),
      "utf-8",
    );
    const parsed = parseFrontmatter(raw);
    expect(parsed.data.authors).toEqual(["agent"]);
  });
});

// ---------------------------------------------------------------------------
// update_page contributor attribution tests
// ---------------------------------------------------------------------------

describe("handleUpdatePage contributor attribution", () => {
  it("appends author to contributors in frontmatter", async () => {
    await writeTestPage(
      "existing-page",
      "---\ntitle: Existing\nauthors: [original-author]\ncontributors: []\n---\n# Existing\n\nOriginal content.",
    );
    await writeIndex([
      { title: "Existing", slug: "existing-page", summary: "Original" },
    ]);

    await handleUpdatePage({
      slug: "existing-page",
      content: "# Existing\n\nUpdated content.",
      author: "yoyo",
    });

    const raw = await fs.readFile(
      path.join(tmpDir, "wiki", "existing-page.md"),
      "utf-8",
    );
    const parsed = parseFrontmatter(raw);
    expect(parsed.data.contributors).toContain("yoyo");
  });

  it("does not duplicate existing contributor", async () => {
    await writeTestPage(
      "dup-page",
      "---\ntitle: Dup\nauthors: [someone]\ncontributors: [yoyo]\n---\n# Dup\n\nContent.",
    );
    await writeIndex([
      { title: "Dup", slug: "dup-page", summary: "Content" },
    ]);

    await handleUpdatePage({
      slug: "dup-page",
      content: "# Dup\n\nNew content.",
      author: "yoyo",
    });

    const raw = await fs.readFile(
      path.join(tmpDir, "wiki", "dup-page.md"),
      "utf-8",
    );
    const parsed = parseFrontmatter(raw);
    const contributors = parsed.data.contributors as string[];
    expect(contributors.filter((c) => c === "yoyo")).toHaveLength(1);
  });

  it("does not modify contributors when no author provided", async () => {
    await writeTestPage(
      "no-author-page",
      "---\ntitle: NoAuthor\nauthors: [someone]\ncontributors: [existing]\n---\n# NoAuthor\n\nContent.",
    );
    await writeIndex([
      { title: "NoAuthor", slug: "no-author-page", summary: "Content" },
    ]);

    await handleUpdatePage({
      slug: "no-author-page",
      content: "# NoAuthor\n\nUpdated.",
    });

    const raw = await fs.readFile(
      path.join(tmpDir, "wiki", "no-author-page.md"),
      "utf-8",
    );
    const parsed = parseFrontmatter(raw);
    expect(parsed.data.contributors).toEqual(["existing"]);
  });
});

// ---------------------------------------------------------------------------
// list_agents tests
// ---------------------------------------------------------------------------

describe("list_agents", () => {
  it("returns empty array when no agents registered", async () => {
    const result = await handleListAgents();
    expect(result.agents).toEqual([]);
  });

  it("returns registered agents with id, name, description", async () => {
    await registerAgent({
      id: "agent-a",
      name: "Agent A",
      description: "First agent",
      identityPages: [],
      learningPages: [],
      socialPages: [],
      registered: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    });
    await registerAgent({
      id: "agent-b",
      name: "Agent B",
      description: "Second agent",
      identityPages: ["b-identity"],
      learningPages: [],
      socialPages: [],
      registered: "2025-02-01T00:00:00.000Z",
      lastUpdated: "2025-02-01T00:00:00.000Z",
    });

    const result = await handleListAgents();
    expect(result.agents).toHaveLength(2);

    const ids = result.agents.map((a) => a.id).sort();
    expect(ids).toEqual(["agent-a", "agent-b"]);

    const agentA = result.agents.find((a) => a.id === "agent-a");
    expect(agentA).toBeDefined();
    expect(agentA!.name).toBe("Agent A");
    expect(agentA!.description).toBe("First agent");
    expect(agentA!.registered).toBe("2025-01-01T00:00:00.000Z");
    expect(agentA!.lastUpdated).toBe("2025-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// update_agent tests
// ---------------------------------------------------------------------------

describe("update_agent", () => {
  it("updates agent name and description", async () => {
    await registerAgent({
      id: "updatable",
      name: "Original Name",
      description: "Original description",
      identityPages: [],
      learningPages: [],
      socialPages: [],
      registered: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    });

    const result = await handleUpdateAgent({
      agent_id: "updatable",
      name: "Updated Name",
      description: "Updated description",
    });

    expect(result.id).toBe("updatable");
    expect(result.name).toBe("Updated Name");
    expect(result.description).toBe("Updated description");
  });

  it("throws when agent does not exist", async () => {
    await expect(
      handleUpdateAgent({
        agent_id: "nonexistent",
        name: "New Name",
      }),
    ).rejects.toThrow("Agent not found: nonexistent");
  });

  it("accepts partial updates (name only)", async () => {
    await registerAgent({
      id: "partial-update",
      name: "Old Name",
      description: "Keep this",
      identityPages: [],
      learningPages: [],
      socialPages: [],
      registered: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    });

    const result = await handleUpdateAgent({
      agent_id: "partial-update",
      name: "New Name",
    });

    expect(result.name).toBe("New Name");
    expect(result.description).toBe("Keep this");
  });

  it("removes pages from agent profile", async () => {
    await registerAgent({
      id: "page-remover",
      name: "Page Remover",
      description: "Test agent",
      identityPages: ["page-a", "page-b"],
      learningPages: ["page-c"],
      socialPages: [],
      registered: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    });

    const result = await handleUpdateAgent({
      agent_id: "page-remover",
      removePages: ["page-b", "page-c"],
    });

    expect(result.identityPages).toEqual(["page-a"]);
    expect(result.learningPages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// delete_agent tests
// ---------------------------------------------------------------------------

describe("delete_agent", () => {
  it("deletes an existing agent", async () => {
    await registerAgent({
      id: "to-delete",
      name: "Delete Me",
      description: "Will be deleted",
      identityPages: [],
      learningPages: [],
      socialPages: [],
      registered: "2025-01-01T00:00:00.000Z",
      lastUpdated: "2025-01-01T00:00:00.000Z",
    });

    const result = await handleDeleteAgent({ agent_id: "to-delete" });
    expect(result.deleted).toBe(true);
    expect(result.agent_id).toBe("to-delete");

    // Verify agent is actually gone
    const listing = await handleListAgents();
    expect(listing.agents.find((a) => a.id === "to-delete")).toBeUndefined();
  });

  it("throws when agent does not exist", async () => {
    await expect(
      handleDeleteAgent({ agent_id: "nonexistent" }),
    ).rejects.toThrow("Agent not found: nonexistent");
  });
});

// ---------------------------------------------------------------------------
// dataview_query tests
// ---------------------------------------------------------------------------

describe("dataview_query", () => {
  beforeEach(async () => {
    // Create test pages with various frontmatter fields
    await writeTestPage(
      "alpha",
      `---
title: Alpha Page
confidence: 0.9
tags: [machine-learning, ai]
created: "2025-01-15"
authors: [yoyo]
---
# Alpha Page

Content about alpha.`,
    );
    await writeTestPage(
      "beta",
      `---
title: Beta Page
confidence: 0.3
tags: [databases]
created: "2025-02-20"
authors: [human]
---
# Beta Page

Content about beta.`,
    );
    await writeTestPage(
      "gamma",
      `---
title: Gamma Page
confidence: 0.7
tags: [machine-learning]
created: "2025-03-10"
authors: [yoyo]
disputed: true
---
# Gamma Page

Content about gamma.`,
    );
    await writeIndex([
      { title: "Alpha Page", slug: "alpha", summary: "About alpha" },
      { title: "Beta Page", slug: "beta", summary: "About beta" },
      { title: "Gamma Page", slug: "gamma", summary: "About gamma" },
    ]);
  });

  it("returns all pages when no filters are given", async () => {
    const result = await handleDataviewQuery({});
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it("filters by a single field (confidence < 0.5)", async () => {
    const result = await handleDataviewQuery({
      filters: [{ field: "confidence", op: "lt", value: "0.5" }],
    });
    expect(result.total).toBe(1);
    expect(result.results[0].slug).toBe("beta");
  });

  it("filters with multiple conditions (AND semantics)", async () => {
    const result = await handleDataviewQuery({
      filters: [
        { field: "tags", op: "contains", value: "machine-learning" },
        { field: "confidence", op: "gte", value: "0.8" },
      ],
    });
    expect(result.total).toBe(1);
    expect(result.results[0].slug).toBe("alpha");
  });

  it("supports the contains operator on tags", async () => {
    const result = await handleDataviewQuery({
      filters: [{ field: "tags", op: "contains", value: "machine-learning" }],
    });
    expect(result.total).toBe(2);
    const slugs = result.results.map((r) => r.slug).sort();
    expect(slugs).toEqual(["alpha", "gamma"]);
  });

  it("supports the exists operator", async () => {
    const result = await handleDataviewQuery({
      filters: [{ field: "disputed", op: "exists" }],
    });
    expect(result.total).toBe(1);
    expect(result.results[0].slug).toBe("gamma");
  });

  it("sorts results by a frontmatter field ascending", async () => {
    const result = await handleDataviewQuery({
      sortBy: "confidence",
      sortOrder: "asc",
    });
    expect(result.results.map((r) => r.slug)).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
  });

  it("sorts results by a frontmatter field descending", async () => {
    const result = await handleDataviewQuery({
      sortBy: "created",
      sortOrder: "desc",
    });
    expect(result.results.map((r) => r.slug)).toEqual([
      "gamma",
      "beta",
      "alpha",
    ]);
  });

  it("respects the limit parameter", async () => {
    const result = await handleDataviewQuery({
      sortBy: "confidence",
      sortOrder: "desc",
      limit: 2,
    });
    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].slug).toBe("alpha");
    expect(result.results[1].slug).toBe("gamma");
  });

  it("throws on invalid filter operator", async () => {
    await expect(
      handleDataviewQuery({
        filters: [{ field: "confidence", op: "invalid_op", value: "0.5" }],
      }),
    ).rejects.toThrow('unknown filter op: "invalid_op"');
  });

  it("throws on missing value for non-exists operator", async () => {
    await expect(
      handleDataviewQuery({
        filters: [{ field: "confidence", op: "gt" }],
      }),
    ).rejects.toThrow('requires a value');
  });

  it("throws on invalid limit", async () => {
    await expect(
      handleDataviewQuery({ limit: -1 }),
    ).rejects.toThrow("limit must be a positive integer");
  });

  it("throws on limit exceeding maximum", async () => {
    await expect(
      handleDataviewQuery({ limit: 999 }),
    ).rejects.toThrow("limit exceeds maximum of 200");
  });

  it("combines filters, sort, and limit", async () => {
    const result = await handleDataviewQuery({
      filters: [{ field: "authors", op: "contains", value: "yoyo" }],
      sortBy: "confidence",
      sortOrder: "desc",
      limit: 1,
    });
    expect(result.total).toBe(1);
    expect(result.results[0].slug).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// list_revisions
// ---------------------------------------------------------------------------

describe("list_revisions", () => {
  it("returns empty revisions array for a page with no edits", async () => {
    await writeTestPage("test-page", "---\ntitle: Test\n---\n# Test\nHello");
    const result = await handleListRevisions({ slug: "test-page" });
    expect(result.slug).toBe("test-page");
    expect(result.revisions).toEqual([]);
  });

  it("returns revisions after a page is updated", async () => {
    // Create the page
    await writeTestPage("test-page", "---\ntitle: Test\n---\n# Test\nVersion 1");

    // Save a revision (simulates what happens before an update)
    const { saveRevision } = await import("../../lib/revisions");
    await saveRevision("test-page", "---\ntitle: Test\n---\n# Test\nVersion 1", "yoyo", "initial save");

    const result = await handleListRevisions({ slug: "test-page" });
    expect(result.slug).toBe("test-page");
    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0].slug).toBe("test-page");
    expect(result.revisions[0].author).toBe("yoyo");
    expect(result.revisions[0].reason).toBe("initial save");
    expect(typeof result.revisions[0].timestamp).toBe("number");
    expect(typeof result.revisions[0].date).toBe("string");
    expect(typeof result.revisions[0].sizeBytes).toBe("number");
  });

  it("throws for a nonexistent page", async () => {
    await expect(
      handleListRevisions({ slug: "no-such-page" }),
    ).rejects.toThrow("page not found: no-such-page");
  });

  it("throws for an invalid slug", async () => {
    await expect(
      handleListRevisions({ slug: "INVALID SLUG!" }),
    ).rejects.toThrow(/invalid slug/i);
  });

  it("throws when slug is empty", async () => {
    await expect(
      handleListRevisions({ slug: "" }),
    ).rejects.toThrow("slug is required");
  });
});

// ---------------------------------------------------------------------------
// read_revision
// ---------------------------------------------------------------------------

describe("read_revision", () => {
  it("returns the content of a specific revision", async () => {
    const content = "---\ntitle: Test\n---\n# Test\nVersion 1";
    await writeTestPage("test-page", content);

    const { saveRevision } = await import("../../lib/revisions");
    await saveRevision("test-page", content, "yoyo", "snapshot");

    // Get the timestamp from list
    const list = await handleListRevisions({ slug: "test-page" });
    expect(list.revisions).toHaveLength(1);
    const ts = list.revisions[0].timestamp;

    const result = await handleReadRevision({ slug: "test-page", timestamp: ts });
    expect(result.slug).toBe("test-page");
    expect(result.timestamp).toBe(ts);
    expect(result.content).toBe(content);
    expect(result.revision.timestamp).toBe(ts);
    expect(result.revision.slug).toBe("test-page");
    expect(typeof result.revision.date).toBe("string");
    expect(typeof result.revision.sizeBytes).toBe("number");
    expect(result.revision.sizeBytes).toBeGreaterThan(0);
    expect(result.revision.author).toBe("yoyo");
    expect(result.revision.reason).toBe("snapshot");
  });

  it("throws for a nonexistent page", async () => {
    await expect(
      handleReadRevision({ slug: "no-such-page", timestamp: 1234567890 }),
    ).rejects.toThrow("page not found: no-such-page");
  });

  it("throws for a nonexistent revision timestamp", async () => {
    await writeTestPage("test-page", "---\ntitle: Test\n---\n# Test\nHello");
    await expect(
      handleReadRevision({ slug: "test-page", timestamp: 9999999999999 }),
    ).rejects.toThrow("revision not found: 9999999999999");
  });

  it("throws for an invalid slug", async () => {
    await expect(
      handleReadRevision({ slug: "BAD SLUG!", timestamp: 123 }),
    ).rejects.toThrow(/invalid slug/i);
  });

  it("throws when slug is empty", async () => {
    await expect(
      handleReadRevision({ slug: "", timestamp: 123 }),
    ).rejects.toThrow("slug is required");
  });

  it("throws for invalid timestamp values", async () => {
    await expect(
      handleReadRevision({ slug: "test-page", timestamp: -1 }),
    ).rejects.toThrow("timestamp must be a positive number");

    await expect(
      handleReadRevision({ slug: "test-page", timestamp: 0 }),
    ).rejects.toThrow("timestamp must be a positive number");
  });
});

// ---------------------------------------------------------------------------
// mcp.json manifest ↔ server drift test
// ---------------------------------------------------------------------------

describe("mcp.json manifest sync", () => {
  it("manifest tools match exactly the tools registered by createMcpServer()", async () => {
    // Read the manifest
    const manifestPath = path.resolve(__dirname, "../../../mcp.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw);
    const manifestTools: string[] = manifest.tools;

    // Get registered tools from the server
    // _registeredTools is private in TypeScript but accessible at runtime
    const server = createMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registeredTools = Object.keys((server as any)._registeredTools);

    const manifestSet = new Set(manifestTools);
    const serverSet = new Set(registeredTools);

    // Tools in server but missing from manifest
    const missingFromManifest = registeredTools.filter(
      (t) => !manifestSet.has(t),
    );
    // Tools in manifest but not registered in server
    const extraInManifest = manifestTools.filter((t) => !serverSet.has(t));

    if (missingFromManifest.length > 0) {
      throw new Error(
        `Server registers tools not in mcp.json (manifest is missing): ${missingFromManifest.join(", ")}`,
      );
    }

    if (extraInManifest.length > 0) {
      throw new Error(
        `mcp.json lists tools not registered by server (manifest has extras): ${extraInManifest.join(", ")}`,
      );
    }

    // Also check for duplicates in the manifest
    expect(manifestTools.length).toBe(
      manifestSet.size,
    );

    expect(manifestTools.sort()).toEqual(registeredTools.sort());
  });
});
