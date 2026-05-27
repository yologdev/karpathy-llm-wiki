import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { parseArgs } from "../../cli";

describe("CLI argument parsing", () => {
  describe("ingest command", () => {
    it("parses ingest with URL", () => {
      const result = parseArgs(["ingest", "https://example.com"]);
      expect(result).toEqual({ command: "ingest-url", url: "https://example.com" });
    });

    it("parses ingest with --text flag", () => {
      const result = parseArgs(["ingest", "--text"]);
      expect(result).toEqual({ command: "ingest-text" });
    });

    it("returns error when ingest has no URL and no --text", () => {
      const result = parseArgs(["ingest"]);
      expect(result.command).toBe("error");
    });
  });

  describe("query command", () => {
    it("parses query with question", () => {
      const result = parseArgs(["query", "what is AI?"]);
      expect(result).toEqual({ command: "query", question: "what is AI?" });
    });

    it("joins multiple words into a single question", () => {
      const result = parseArgs(["query", "what", "is", "attention?"]);
      expect(result).toEqual({ command: "query", question: "what is attention?" });
    });

    it("returns error when query has no question", () => {
      const result = parseArgs(["query"]);
      expect(result.command).toBe("error");
    });
  });

  describe("search command", () => {
    it("parses search with query", () => {
      const result = parseArgs(["search", "attention"]);
      expect(result).toEqual({ command: "search", query: "attention", fuzzy: false, limit: 10 });
    });

    it("joins multiple words into a single query", () => {
      const result = parseArgs(["search", "attention", "mechanism"]);
      expect(result).toEqual({ command: "search", query: "attention mechanism", fuzzy: false, limit: 10 });
    });

    it("parses --fuzzy flag", () => {
      const result = parseArgs(["search", "atention", "--fuzzy"]);
      expect(result).toEqual({ command: "search", query: "atention", fuzzy: true, limit: 10 });
    });

    it("parses --scope flag", () => {
      const result = parseArgs(["search", "identity", "--scope", "agent:yoyo"]);
      expect(result).toEqual({ command: "search", query: "identity", fuzzy: false, scope: "agent:yoyo", limit: 10 });
    });

    it("parses --limit flag", () => {
      const result = parseArgs(["search", "wiki", "--limit", "5"]);
      expect(result).toEqual({ command: "search", query: "wiki", fuzzy: false, limit: 5 });
    });

    it("parses all flags together", () => {
      const result = parseArgs(["search", "test", "--fuzzy", "--scope", "agent:yoyo", "--limit", "3"]);
      expect(result).toEqual({ command: "search", query: "test", fuzzy: true, scope: "agent:yoyo", limit: 3 });
    });

    it("defaults limit to 10 for invalid --limit value", () => {
      const result = parseArgs(["search", "test", "--limit", "abc"]);
      expect(result).toEqual({ command: "search", query: "test", fuzzy: false, limit: 10 });
    });

    it("returns error when search has no query", () => {
      const result = parseArgs(["search"]);
      expect(result.command).toBe("error");
    });

    it("returns error when search has only flags", () => {
      const result = parseArgs(["search", "--fuzzy"]);
      expect(result.command).toBe("error");
    });
  });

  describe("lint command", () => {
    it("parses lint without flags", () => {
      const result = parseArgs(["lint"]);
      expect(result).toEqual({ command: "lint", fix: false });
    });

    it("parses lint with --fix flag", () => {
      const result = parseArgs(["lint", "--fix"]);
      expect(result).toEqual({ command: "lint", fix: true });
    });
  });

  describe("list command", () => {
    it("parses list without flags", () => {
      const result = parseArgs(["list"]);
      expect(result).toEqual({ command: "list", raw: false });
    });

    it("parses list with --raw flag", () => {
      const result = parseArgs(["list", "--raw"]);
      expect(result).toEqual({ command: "list", raw: true });
    });
  });

  describe("status command", () => {
    it("parses status", () => {
      const result = parseArgs(["status"]);
      expect(result).toEqual({ command: "status" });
    });
  });

  describe("history command", () => {
    it("parses history without flags (default limit 20)", () => {
      const result = parseArgs(["history"]);
      expect(result).toEqual({ command: "history", limit: 20 });
    });

    it("parses history with --limit flag", () => {
      const result = parseArgs(["history", "--limit", "10"]);
      expect(result).toEqual({ command: "history", limit: 10 });
    });

    it("defaults limit to 20 for invalid --limit value", () => {
      const result = parseArgs(["history", "--limit", "abc"]);
      expect(result).toEqual({ command: "history", limit: 20 });
    });
  });

  describe("read command", () => {
    it("parses read with slug", () => {
      const result = parseArgs(["read", "attention-mechanisms"]);
      expect(result).toEqual({ command: "read", slug: "attention-mechanisms" });
    });

    it("returns error when read has no slug", () => {
      const result = parseArgs(["read"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });

  describe("reingest command", () => {
    it("parses reingest with slug", () => {
      const result = parseArgs(["reingest", "attention-mechanisms"]);
      expect(result).toEqual({ command: "reingest", slug: "attention-mechanisms" });
    });

    it("returns error when reingest has no slug", () => {
      const result = parseArgs(["reingest"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });

  describe("delete command", () => {
    it("parses delete with slug", () => {
      const result = parseArgs(["delete", "attention-mechanisms"]);
      expect(result).toEqual({ command: "delete", slug: "attention-mechanisms" });
    });

    it("returns error when delete has no slug", () => {
      const result = parseArgs(["delete"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });

  describe("create command", () => {
    it("parses create with slug and title", () => {
      const result = parseArgs(["create", "my-page", "--title", "My Page"]);
      expect(result).toEqual({ command: "create", slug: "my-page", title: "My Page" });
    });

    it("parses create with tags", () => {
      const result = parseArgs(["create", "my-page", "--title", "My Page", "--tags", "ai,ml"]);
      expect(result).toEqual({ command: "create", slug: "my-page", title: "My Page", tags: ["ai", "ml"] });
    });

    it("returns error when create has no slug", () => {
      const result = parseArgs(["create"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });

    it("returns error when create has no --title", () => {
      const result = parseArgs(["create", "my-page"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });

    it("returns error when --title has no value", () => {
      const result = parseArgs(["create", "my-page", "--title"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });

  describe("update command", () => {
    it("parses update with slug only", () => {
      const result = parseArgs(["update", "my-page"]);
      expect(result).toEqual({ command: "update", slug: "my-page" });
    });

    it("parses update with --title", () => {
      const result = parseArgs(["update", "my-page", "--title", "New Title"]);
      expect(result).toEqual({ command: "update", slug: "my-page", title: "New Title" });
    });

    it("parses update with --tags", () => {
      const result = parseArgs(["update", "my-page", "--tags", "ai,ml"]);
      expect(result).toEqual({ command: "update", slug: "my-page", tags: ["ai", "ml"] });
    });

    it("parses update with --title and --tags", () => {
      const result = parseArgs(["update", "my-page", "--title", "New Title", "--tags", "ai,ml"]);
      expect(result).toEqual({ command: "update", slug: "my-page", title: "New Title", tags: ["ai", "ml"] });
    });

    it("returns error when update has no slug", () => {
      const result = parseArgs(["update"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });

  describe("help command", () => {
    it("parses help", () => {
      const result = parseArgs(["help"]);
      expect(result).toEqual({ command: "help" });
    });

    it("parses --help flag", () => {
      const result = parseArgs(["--help"]);
      expect(result).toEqual({ command: "help" });
    });

    it("parses -h flag", () => {
      const result = parseArgs(["-h"]);
      expect(result).toEqual({ command: "help" });
    });

    it("shows help when no args provided", () => {
      const result = parseArgs([]);
      expect(result).toEqual({ command: "help" });
    });
  });

  describe("error handling", () => {
    it("returns error for unknown command", () => {
      const result = parseArgs(["unknown"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Unknown command");
      }
    });

    it("returns error for missing ingest argument", () => {
      const result = parseArgs(["ingest"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });

    it("returns error for missing query argument", () => {
      const result = parseArgs(["query"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });

    it("returns error for missing search argument", () => {
      const result = parseArgs(["search"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// CLI command execution tests
// ---------------------------------------------------------------------------

vi.mock("../wiki", () => ({
  listWikiPages: vi.fn(),
  readWikiPageWithFrontmatter: vi.fn(),
  readWikiPage: vi.fn(),
  validateSlug: vi.fn(),
}));

vi.mock("../raw", () => ({
  listRawSources: vi.fn(),
}));

vi.mock("../config", () => ({
  getEffectiveSettings: vi.fn(),
}));

vi.mock("../query", () => ({
  query: vi.fn(),
}));

vi.mock("../lint", () => ({
  lint: vi.fn(),
}));

vi.mock("../ingest", () => ({
  ingestUrl: vi.fn(),
  ingest: vi.fn(),
  reingest: vi.fn(),
  extractSummary: vi.fn(),
}));

vi.mock("../lint-fix", () => ({
  fixLintIssue: vi.fn(),
}));

vi.mock("../search", () => ({
  searchWikiContent: vi.fn(),
  fuzzySearchWikiContent: vi.fn(),
  resolveScope: vi.fn(),
}));

vi.mock("../lifecycle", () => ({
  deleteWikiPage: vi.fn(),
  writeWikiPageWithSideEffects: vi.fn(),
}));

vi.mock("../frontmatter", () => ({
  serializeFrontmatter: vi.fn(),
}));

describe("CLI command execution", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: MockInstance<(code?: number) => never>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => { throw new Error("process.exit"); }) as unknown as () => never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("runList(false) prints wiki pages sorted by title", async () => {
    const { listWikiPages } = await import("../wiki");
    const mock = vi.mocked(listWikiPages);
    mock.mockResolvedValueOnce([
      { slug: "transformers", title: "Transformers", summary: "" },
      { slug: "attention", title: "Attention", summary: "" },
    ]);

    const { runList } = await import("../../cli");
    await runList(false);

    expect(logSpy).toHaveBeenCalledWith("attention\tAttention");
    expect(logSpy).toHaveBeenCalledWith("transformers\tTransformers");
    // Attention sorts before Transformers
    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls.indexOf("attention\tAttention")).toBeLessThan(
      calls.indexOf("transformers\tTransformers"),
    );
  });

  it("runList(true) prints raw sources sorted by slug", async () => {
    const { listRawSources } = await import("../raw");
    const mock = vi.mocked(listRawSources);
    mock.mockResolvedValueOnce([
      { slug: "source-b", filename: "source-b.md", size: 200, modified: "2025-01-02T00:00:00Z" },
      { slug: "source-a", filename: "source-a.md", size: 100, modified: "2025-01-01T00:00:00Z" },
    ]);

    const { runList } = await import("../../cli");
    await runList(true);

    expect(logSpy).toHaveBeenCalledWith("source-a\tsource-a.md");
    expect(logSpy).toHaveBeenCalledWith("source-b\tsource-b.md");
  });

  it("runStatus() prints page count, source count, and provider info", async () => {
    const { listWikiPages } = await import("../wiki");
    const { listRawSources } = await import("../raw");
    const { getEffectiveSettings } = await import("../config");

    vi.mocked(listWikiPages).mockResolvedValueOnce([
      { slug: "page-1", title: "Page 1", summary: "" },
      { slug: "page-2", title: "Page 2", summary: "" },
      { slug: "page-3", title: "Page 3", summary: "" },
    ]);
    vi.mocked(listRawSources).mockResolvedValueOnce([
      { slug: "raw-1", filename: "raw-1.md", size: 50, modified: "2025-01-01T00:00:00Z" },
    ]);
    vi.mocked(getEffectiveSettings).mockReturnValueOnce({
      provider: "anthropic",
      providerSource: "env",
      model: "claude-sonnet-4-20250514",
      modelSource: "default",
      configured: true,
      embeddingSupport: true,
      embeddingModel: null,
      embeddingModelSource: "default",
      hasApiKey: true,
      apiKeySource: "env",
      ollamaBaseUrl: null,
      ollamaBaseUrlSource: "default",
    });

    const { runStatus } = await import("../../cli");
    await runStatus();

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Wiki pages:\t3");
    expect(output).toContain("Raw sources:\t1");
    expect(output).toContain("LLM provider:\tanthropic");
    expect(output).toContain("Embeddings:\tavailable");
  });

  it("runQuery() prints answer to stdout and sources to stderr", async () => {
    const { query } = await import("../query");
    vi.mocked(query).mockResolvedValueOnce({
      answer: "Test answer about transformers",
      sources: ["transformers", "attention"],
    });

    const { runQuery } = await import("../../cli");
    await runQuery("What are transformers?");

    expect(logSpy).toHaveBeenCalledWith("Test answer about transformers");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("transformers, attention"),
    );
  });

  it("runLint(false) with issues prints them and exits with code 1", async () => {
    const { lint } = await import("../lint");
    vi.mocked(lint).mockResolvedValueOnce({
      issues: [
        {
          type: "orphan-page",
          slug: "orphan",
          message: "Not linked from index",
          severity: "warning",
        },
      ],
      summary: "1 issue found",
      checkedAt: "2025-01-01T00:00:00Z",
    });

    const { runLint } = await import("../../cli");
    await expect(runLint(false)).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("orphan-page");
    expect(output).toContain("orphan");
    expect(output).toContain("1 issue found");
  });

  it("runLint(false) with no issues prints success message", async () => {
    const { lint } = await import("../lint");
    vi.mocked(lint).mockResolvedValueOnce({
      issues: [],
      summary: "All clear",
      checkedAt: "2025-01-01T00:00:00Z",
    });

    const { runLint } = await import("../../cli");
    await runLint(false);

    expect(logSpy).toHaveBeenCalledWith("No issues found.");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("runLint(true) with issues attempts auto-fix", async () => {
    const { lint } = await import("../lint");
    const { fixLintIssue } = await import("../lint-fix");

    vi.mocked(lint).mockResolvedValueOnce({
      issues: [
        {
          type: "empty-page",
          slug: "empty",
          message: "Page has no content",
          severity: "warning",
        },
      ],
      summary: "1 issue found",
      checkedAt: "2025-01-01T00:00:00Z",
    });
    vi.mocked(fixLintIssue).mockResolvedValueOnce({
      success: true,
      message: "Page populated",
      slug: "empty",
    });

    const { runLint } = await import("../../cli");
    await runLint(true);

    expect(fixLintIssue).toHaveBeenCalledWith("empty-page", "empty", undefined, "Page has no content");
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Fixed: 1, Failed: 0");
    // Should NOT call process.exit when all fixes succeed
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("runIngestUrl() prints the primary slug", async () => {
    const { ingestUrl } = await import("../ingest");
    vi.mocked(ingestUrl).mockResolvedValueOnce({
      rawPath: "raw/example-article.md",
      primarySlug: "example-article",
      relatedUpdated: ["related-page"],
      wikiPages: ["example-article", "related-page"],
      indexUpdated: true,
      sourceUrl: "https://example.com/article",
    });

    const { runIngestUrl } = await import("../../cli");
    await runIngestUrl("https://example.com/article");

    expect(logSpy).toHaveBeenCalledWith("example-article");
    expect(logSpy).toHaveBeenCalledWith("related-page");
  });

  it("runIngestText() reads stdin and prints the primary slug", async () => {
    const { ingest } = await import("../ingest");
    vi.mocked(ingest).mockResolvedValueOnce({
      rawPath: "raw/test-title.md",
      primarySlug: "test-title",
      relatedUpdated: [],
      wikiPages: ["test-title"],
      indexUpdated: true,
    });

    // Mock process.stdin to emit data then end
    const originalOn = process.stdin.on;
    const stdinMock = vi.spyOn(process.stdin, "on").mockImplementation(
      function (this: NodeJS.ReadStream, event: string, listener: (...args: unknown[]) => void) {
        if (event === "data") {
          // Schedule data emission
          setTimeout(() => listener(Buffer.from("Test title\nSome body content")), 0);
        } else if (event === "end") {
          // Schedule end after data
          setTimeout(() => (listener as () => void)(), 5);
        }
        return this;
      } as never,
    );

    const { runIngestText } = await import("../../cli");
    await runIngestText();

    expect(ingest).toHaveBeenCalledWith("Test title", "Test title\nSome body content");
    expect(logSpy).toHaveBeenCalledWith("test-title");

    stdinMock.mockRestore();
    process.stdin.on = originalOn;
  });

  it("runSearch() prints tab-separated results", async () => {
    const { searchWikiContent } = await import("../search");
    vi.mocked(searchWikiContent).mockResolvedValueOnce([
      { slug: "attention", title: "Attention", summary: "About attention", snippet: "…the attention mechanism…", score: 2 },
      { slug: "transformers", title: "Transformers", summary: "About transformers", snippet: "…transformer architecture…", score: 1 },
    ]);

    const { runSearch } = await import("../../cli");
    await runSearch("attention", false, 10);

    expect(searchWikiContent).toHaveBeenCalledWith("attention", 10, undefined);
    expect(logSpy).toHaveBeenCalledWith("attention\t2\t…the attention mechanism…");
    expect(logSpy).toHaveBeenCalledWith("transformers\t1\t…transformer architecture…");
  });

  it("runSearch() uses fuzzySearchWikiContent when fuzzy is true", async () => {
    const { fuzzySearchWikiContent } = await import("../search");
    vi.mocked(fuzzySearchWikiContent).mockResolvedValueOnce([
      { slug: "attention", title: "Attention", summary: "About attention", snippet: "…the attention mechanism…", score: 2 },
    ]);

    const { runSearch } = await import("../../cli");
    await runSearch("atention", true, 10);

    expect(fuzzySearchWikiContent).toHaveBeenCalledWith("atention", 10, undefined);
    expect(logSpy).toHaveBeenCalledWith("attention\t2\t…the attention mechanism…");
  });

  it("runSearch() passes resolved scope", async () => {
    const { searchWikiContent, resolveScope } = await import("../search");
    const mockScope = { agentId: "yoyo", slugs: ["identity", "learnings"] };
    vi.mocked(resolveScope).mockResolvedValueOnce(mockScope);
    vi.mocked(searchWikiContent).mockResolvedValueOnce([
      { slug: "identity", title: "Identity", summary: "Agent identity", snippet: "…identity page…", score: 1 },
    ]);

    const { runSearch } = await import("../../cli");
    await runSearch("identity", false, 5, "agent:yoyo");

    expect(resolveScope).toHaveBeenCalledWith("agent:yoyo");
    expect(searchWikiContent).toHaveBeenCalledWith("identity", 5, mockScope);
  });

  it("runSearch() prints message to stderr when no results", async () => {
    const { searchWikiContent } = await import("../search");
    vi.mocked(searchWikiContent).mockResolvedValueOnce([]);

    const { runSearch } = await import("../../cli");
    await runSearch("nonexistent", false, 10);

    expect(errorSpy).toHaveBeenCalledWith("No results found.");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("runSearch() replaces tabs in snippets to preserve column format", async () => {
    const { searchWikiContent } = await import("../search");
    vi.mocked(searchWikiContent).mockResolvedValueOnce([
      { slug: "test", title: "Test", summary: "Test", snippet: "has\ttab\there", score: 1 },
    ]);

    const { runSearch } = await import("../../cli");
    await runSearch("test", false, 10);

    expect(logSpy).toHaveBeenCalledWith("test\t1\thas tab here");
  });

  it("runRead() prints metadata header and body for existing page", async () => {
    const { readWikiPageWithFrontmatter } = await import("../wiki");
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "attention",
      title: "Attention Mechanisms",
      content: "---\ntitle: Attention Mechanisms\nconfidence: 0.85\ntags: [ml, nlp]\nauthors: [yoyo]\nexpiry: 2025-12-01\n---\n\n# Attention Mechanisms\n\nAttention is a key concept.",
      path: "/wiki/attention.md",
      frontmatter: {
        title: "Attention Mechanisms",
        confidence: 0.85,
        tags: ["ml", "nlp"],
        authors: ["yoyo"],
        expiry: "2025-12-01",
      },
      body: "# Attention Mechanisms\n\nAttention is a key concept.",
    });

    const { runRead } = await import("../../cli");
    await runRead("attention");

    expect(readWikiPageWithFrontmatter).toHaveBeenCalledWith("attention");
    // Check metadata header lines
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Title:      Attention Mechanisms"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Confidence: 0.85"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Tags:       ml, nlp"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Authors:    yoyo"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Expiry:     2025-12-01"));
    // Check separator and body
    expect(logSpy).toHaveBeenCalledWith("---");
    expect(logSpy).toHaveBeenCalledWith("# Attention Mechanisms\n\nAttention is a key concept.");
  });

  it("runRead() exits with error for nonexistent page", async () => {
    const { readWikiPageWithFrontmatter } = await import("../wiki");
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce(null);

    const { runRead } = await import("../../cli");
    await expect(runRead("nonexistent-slug")).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('page "nonexistent-slug" not found'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("pnpm cli list"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runRead() omits optional metadata fields when not present", async () => {
    const { readWikiPageWithFrontmatter } = await import("../wiki");
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "simple",
      title: "Simple Page",
      content: "---\ntitle: Simple Page\n---\n\n# Simple Page\n\nJust content.",
      path: "/wiki/simple.md",
      frontmatter: { title: "Simple Page" },
      body: "# Simple Page\n\nJust content.",
    });

    const { runRead } = await import("../../cli");
    await runRead("simple");

    // The metadata header should have title and slug but not confidence/tags/authors/expiry
    const headerCall = logSpy.mock.calls[0][0] as string;
    expect(headerCall).toContain("Title:      Simple Page");
    expect(headerCall).toContain("Slug:       simple");
    expect(headerCall).not.toContain("Confidence:");
    expect(headerCall).not.toContain("Tags:");
    expect(headerCall).not.toContain("Authors:");
    expect(headerCall).not.toContain("Expiry:");
  });

  it("runReingest() prints title, source, and expiry on success", async () => {
    const { reingest } = await import("../ingest");
    const { readWikiPageWithFrontmatter } = await import("../wiki");
    vi.mocked(reingest).mockResolvedValueOnce({
      rawPath: "raw/attention-mechanisms.md",
      primarySlug: "attention-mechanisms",
      relatedUpdated: [],
      wikiPages: ["attention-mechanisms"],
      indexUpdated: true,
      sourceUrl: "https://example.com/attention",
    });
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "attention-mechanisms",
      title: "Attention Mechanisms",
      content: "---\ntitle: Attention Mechanisms\nexpiry: 2026-06-01\n---\n\n# Attention Mechanisms",
      path: "/wiki/attention-mechanisms.md",
      frontmatter: { title: "Attention Mechanisms", expiry: "2026-06-01" },
      body: "# Attention Mechanisms",
    });

    const { runReingest } = await import("../../cli");
    await runReingest("attention-mechanisms");

    expect(reingest).toHaveBeenCalledWith("attention-mechanisms");
    expect(logSpy).toHaveBeenCalledWith("Reingest complete: Attention Mechanisms");
    expect(logSpy).toHaveBeenCalledWith("  Source: https://example.com/attention");
    expect(logSpy).toHaveBeenCalledWith("  Expiry: 2026-06-01");
  });

  it("runReingest() omits expiry line when not present", async () => {
    const { reingest } = await import("../ingest");
    const { readWikiPageWithFrontmatter } = await import("../wiki");
    vi.mocked(reingest).mockResolvedValueOnce({
      rawPath: "raw/simple-page.md",
      primarySlug: "simple-page",
      relatedUpdated: [],
      wikiPages: ["simple-page"],
      indexUpdated: true,
      sourceUrl: "https://example.com/simple",
    });
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "simple-page",
      title: "Simple Page",
      content: "---\ntitle: Simple Page\n---\n\n# Simple Page",
      path: "/wiki/simple-page.md",
      frontmatter: { title: "Simple Page" },
      body: "# Simple Page",
    });

    const { runReingest } = await import("../../cli");
    await runReingest("simple-page");

    expect(logSpy).toHaveBeenCalledWith("Reingest complete: Simple Page");
    expect(logSpy).toHaveBeenCalledWith("  Source: https://example.com/simple");
    // Should NOT print expiry line
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(allOutput).not.toContain("Expiry:");
  });

  it("runReingest() propagates error for nonexistent page", async () => {
    const { reingest } = await import("../ingest");
    vi.mocked(reingest).mockRejectedValueOnce(
      new Error('Cannot re-ingest: page "nonexistent" not found'),
    );

    const { runReingest } = await import("../../cli");
    await expect(runReingest("nonexistent")).rejects.toThrow(
      'Cannot re-ingest: page "nonexistent" not found',
    );
  });

  it("runReingest() propagates error for page without source URL", async () => {
    const { reingest } = await import("../ingest");
    vi.mocked(reingest).mockRejectedValueOnce(
      new Error("Cannot re-ingest: no source URL recorded"),
    );

    const { runReingest } = await import("../../cli");
    await expect(runReingest("no-source")).rejects.toThrow(
      "Cannot re-ingest: no source URL recorded",
    );
  });

  // -------------------------------------------------------------------------
  // create command
  // -------------------------------------------------------------------------

  it("runCreate() creates a page and prints result", async () => {
    const { readWikiPage, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPage).mockResolvedValueOnce(null);

    const { serializeFrontmatter } = await import("../frontmatter");
    vi.mocked(serializeFrontmatter).mockReturnValueOnce("---\ntitle: Test Page\n---\nHello world");

    const { extractSummary } = await import("../ingest");
    vi.mocked(extractSummary).mockReturnValueOnce("Hello world");

    const { writeWikiPageWithSideEffects } = await import("../lifecycle");
    vi.mocked(writeWikiPageWithSideEffects).mockResolvedValueOnce({
      slug: "test-page",
      updatedSlugs: ["related-page"],
    });

    // Mock stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("Hello world");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runCreate } = await import("../../cli");
    await runCreate("test-page", "Test Page");

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    expect(logSpy).toHaveBeenCalledWith("Created: test-page");
    expect(logSpy).toHaveBeenCalledWith("  Title: Test Page");
    expect(logSpy).toHaveBeenCalledWith("  Cross-referenced: related-page");
  });

  it("runCreate() exits with error when page already exists", async () => {
    const { readWikiPage, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPage).mockResolvedValueOnce("existing content");

    const { runCreate } = await import("../../cli");
    await expect(runCreate("existing-page", "Existing Page")).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith('Error: page "existing-page" already exists.');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runCreate() propagates error for invalid slug", async () => {
    const { validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {
      throw new Error('Invalid slug: "BAD SLUG" does not match the safe pattern (lowercase alphanumeric and hyphens, cannot start or end with hyphen)');
    });

    const { runCreate } = await import("../../cli");
    await expect(runCreate("BAD SLUG", "Bad Page")).rejects.toThrow("Invalid slug");
  });

  it("runCreate() exits with error when stdin is empty", async () => {
    const { readWikiPage, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPage).mockResolvedValueOnce(null);

    // Mock empty stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runCreate } = await import("../../cli");
    await expect(runCreate("test-page", "Test Page")).rejects.toThrow("process.exit");

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    expect(errorSpy).toHaveBeenCalledWith("Error: no content received on stdin");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runCreate() passes tags to frontmatter", async () => {
    const { readWikiPage, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPage).mockResolvedValueOnce(null);

    const { serializeFrontmatter } = await import("../frontmatter");
    vi.mocked(serializeFrontmatter).mockReturnValueOnce("---\ntitle: Tagged\n---\nContent");

    const { extractSummary } = await import("../ingest");
    vi.mocked(extractSummary).mockReturnValueOnce("Content");

    const { writeWikiPageWithSideEffects } = await import("../lifecycle");
    vi.mocked(writeWikiPageWithSideEffects).mockResolvedValueOnce({
      slug: "tagged-page",
      updatedSlugs: [],
    });

    // Mock stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("Content");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runCreate } = await import("../../cli");
    await runCreate("tagged-page", "Tagged Page", ["ai", "ml"]);

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    // Verify tags were passed in the frontmatter call
    expect(serializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["ai", "ml"] }),
      "Content",
    );
    expect(logSpy).toHaveBeenCalledWith("Created: tagged-page");
  });

  // -------------------------------------------------------------------------
  // update command
  // -------------------------------------------------------------------------

  it("runUpdate() updates a page and prints result", async () => {
    const { readWikiPageWithFrontmatter, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "test-page",
      title: "Old Title",
      content: "---\ntitle: Old Title\n---\nOld content",
      path: "/wiki/test-page.md",
      frontmatter: { title: "Old Title", tags: ["existing"], confidence: 0.7, updated: "2025-01-01" },
      body: "Old content",
    });

    const { serializeFrontmatter } = await import("../frontmatter");
    vi.mocked(serializeFrontmatter).mockReturnValueOnce("---\ntitle: New Title\n---\nNew content");

    const { extractSummary } = await import("../ingest");
    vi.mocked(extractSummary).mockReturnValueOnce("New content");

    const { writeWikiPageWithSideEffects } = await import("../lifecycle");
    vi.mocked(writeWikiPageWithSideEffects).mockResolvedValueOnce({
      slug: "test-page",
      updatedSlugs: ["related-page"],
    });

    // Mock stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("New content");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runUpdate } = await import("../../cli");
    await runUpdate("test-page", "New Title");

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    expect(logSpy).toHaveBeenCalledWith("Updated: test-page");
    expect(logSpy).toHaveBeenCalledWith("  Title: New Title");
    expect(logSpy).toHaveBeenCalledWith("  Cross-referenced: related-page");
  });

  it("runUpdate() preserves existing title when --title omitted", async () => {
    const { readWikiPageWithFrontmatter, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "test-page",
      title: "Existing Title",
      content: "---\ntitle: Existing Title\n---\nOld content",
      path: "/wiki/test-page.md",
      frontmatter: { title: "Existing Title", tags: ["tag1"], confidence: 0.5 },
      body: "Old content",
    });

    const { serializeFrontmatter } = await import("../frontmatter");
    vi.mocked(serializeFrontmatter).mockReturnValueOnce("---\ntitle: Existing Title\n---\nUpdated body");

    const { extractSummary } = await import("../ingest");
    vi.mocked(extractSummary).mockReturnValueOnce("Updated body");

    const { writeWikiPageWithSideEffects } = await import("../lifecycle");
    vi.mocked(writeWikiPageWithSideEffects).mockResolvedValueOnce({
      slug: "test-page",
      updatedSlugs: [],
    });

    // Mock stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("Updated body");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runUpdate } = await import("../../cli");
    await runUpdate("test-page");

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    expect(logSpy).toHaveBeenCalledWith("Updated: test-page");
    expect(logSpy).toHaveBeenCalledWith("  Title: Existing Title");
    // Verify frontmatter was called preserving existing tags
    expect(serializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Existing Title", tags: ["tag1"] }),
      "Updated body",
    );
  });

  it("runUpdate() preserves existing tags when --tags omitted", async () => {
    const { readWikiPageWithFrontmatter, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "test-page",
      title: "Page",
      content: "---\ntitle: Page\n---\nContent",
      path: "/wiki/test-page.md",
      frontmatter: { title: "Page", tags: ["keep-me", "also-me"] },
      body: "Content",
    });

    const { serializeFrontmatter } = await import("../frontmatter");
    vi.mocked(serializeFrontmatter).mockReturnValueOnce("---\ntitle: New Title\n---\nNew body");

    const { extractSummary } = await import("../ingest");
    vi.mocked(extractSummary).mockReturnValueOnce("New body");

    const { writeWikiPageWithSideEffects } = await import("../lifecycle");
    vi.mocked(writeWikiPageWithSideEffects).mockResolvedValueOnce({
      slug: "test-page",
      updatedSlugs: [],
    });

    // Mock stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("New body");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runUpdate } = await import("../../cli");
    await runUpdate("test-page", "New Title");

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    // Verify frontmatter was called preserving existing tags
    expect(serializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["keep-me", "also-me"] }),
      "New body",
    );
  });

  it("runUpdate() uses provided --tags over existing", async () => {
    const { readWikiPageWithFrontmatter, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "test-page",
      title: "Page",
      content: "---\ntitle: Page\n---\nContent",
      path: "/wiki/test-page.md",
      frontmatter: { title: "Page", tags: ["old-tag"] },
      body: "Content",
    });

    const { serializeFrontmatter } = await import("../frontmatter");
    vi.mocked(serializeFrontmatter).mockReturnValueOnce("---\ntitle: Page\n---\nNew body");

    const { extractSummary } = await import("../ingest");
    vi.mocked(extractSummary).mockReturnValueOnce("New body");

    const { writeWikiPageWithSideEffects } = await import("../lifecycle");
    vi.mocked(writeWikiPageWithSideEffects).mockResolvedValueOnce({
      slug: "test-page",
      updatedSlugs: [],
    });

    // Mock stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("New body");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runUpdate } = await import("../../cli");
    await runUpdate("test-page", undefined, ["new-tag", "another"]);

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    // Verify frontmatter was called with new tags, not old
    expect(serializeFrontmatter).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["new-tag", "another"] }),
      "New body",
    );
  });

  it("runUpdate() exits with error when page not found", async () => {
    const { readWikiPageWithFrontmatter, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce(null);

    const { runUpdate } = await import("../../cli");
    await expect(runUpdate("nonexistent-slug")).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('page "nonexistent-slug" not found'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runUpdate() exits with error when stdin is empty", async () => {
    const { readWikiPageWithFrontmatter, validateSlug } = await import("../wiki");
    vi.mocked(validateSlug).mockImplementation(() => {});
    vi.mocked(readWikiPageWithFrontmatter).mockResolvedValueOnce({
      slug: "test-page",
      title: "Page",
      content: "---\ntitle: Page\n---\nContent",
      path: "/wiki/test-page.md",
      frontmatter: { title: "Page" },
      body: "Content",
    });

    // Mock empty stdin
    const originalStdin = process.stdin;
    const mockStdin = new (await import("stream")).Readable();
    mockStdin.push("");
    mockStdin.push(null);
    Object.defineProperty(process, "stdin", { value: mockStdin, writable: true });

    const { runUpdate } = await import("../../cli");
    await expect(runUpdate("test-page")).rejects.toThrow("process.exit");

    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });

    expect(errorSpy).toHaveBeenCalledWith("Error: no content received on stdin");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runDelete() prints deletion result with backlinks", async () => {
    const { deleteWikiPage } = await import("../lifecycle");
    vi.mocked(deleteWikiPage).mockResolvedValueOnce({
      slug: "old-page",
      removedFromIndex: true,
      strippedBacklinksFrom: ["page-a", "page-b"],
    });

    const { runDelete } = await import("../../cli");
    await runDelete("old-page");

    expect(logSpy).toHaveBeenCalledWith("Deleted: old-page");
    expect(logSpy).toHaveBeenCalledWith("  Removed from index");
    expect(logSpy).toHaveBeenCalledWith("  Stripped backlinks from: page-a, page-b");
  });

  it("runDelete() prints minimal output when no backlinks stripped", async () => {
    const { deleteWikiPage } = await import("../lifecycle");
    vi.mocked(deleteWikiPage).mockResolvedValueOnce({
      slug: "simple-page",
      removedFromIndex: true,
      strippedBacklinksFrom: [],
    });

    const { runDelete } = await import("../../cli");
    await runDelete("simple-page");

    expect(logSpy).toHaveBeenCalledWith("Deleted: simple-page");
    expect(logSpy).toHaveBeenCalledWith("  Removed from index");
    const allOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(allOutput).not.toContain("Stripped backlinks");
  });

  it("runDelete() propagates error for nonexistent page", async () => {
    const { deleteWikiPage } = await import("../lifecycle");
    vi.mocked(deleteWikiPage).mockRejectedValueOnce(
      new Error("page not found: nonexistent"),
    );

    const { runDelete } = await import("../../cli");
    await expect(runDelete("nonexistent")).rejects.toThrow(
      "page not found: nonexistent",
    );
  });
});
