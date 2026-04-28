import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  });
});

// ---------------------------------------------------------------------------
// CLI command execution tests
// ---------------------------------------------------------------------------

vi.mock("../wiki", () => ({
  listWikiPages: vi.fn(),
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
}));

vi.mock("../lint-fix", () => ({
  fixLintIssue: vi.fn(),
}));

describe("CLI command execution", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => { throw new Error("process.exit"); }) as never);
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
      { slug: "transformers", title: "Transformers", content: "", path: "wiki/transformers.md" },
      { slug: "attention", title: "Attention", content: "", path: "wiki/attention.md" },
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
      { slug: "page-1", title: "Page 1", content: "", path: "wiki/page-1.md" },
      { slug: "page-2", title: "Page 2", content: "", path: "wiki/page-2.md" },
      { slug: "page-3", title: "Page 3", content: "", path: "wiki/page-3.md" },
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
      maskedApiKey: "sk-…abc",
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
});
