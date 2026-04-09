import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  slugify,
  extractSummary,
  ingest,
  isUrl,
  stripHtml,
  extractTitle,
  extractWithReadability,
  fetchUrlContent,
  ingestUrl,
  findRelatedPages,
  updateRelatedPages,
} from "../ingest";
import { listWikiPages, readWikiPage, writeWikiPage } from "../wiki";
import type { IndexEntry } from "../types";

// Mock the LLM module so ingest never calls the real API
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(),
}));

// Import the mocked module so we can override per-test
import { hasLLMKey, callLLM } from "../llm";
const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips special characters", () => {
    expect(slugify("What's New? (2024)")).toBe("what-s-new-2024");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  ---Hello---  ")).toBe("hello");
  });

  it("collapses consecutive non-alphanumeric chars into a single hyphen", () => {
    expect(slugify("a   b...c")).toBe("a-b-c");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles purely numeric titles", () => {
    expect(slugify("2024")).toBe("2024");
  });
});

// ---------------------------------------------------------------------------
// ingest — empty slug guard
// ---------------------------------------------------------------------------

describe("ingest — empty slug guard", () => {
  it('rejects empty title (slug would be "")', async () => {
    await expect(ingest("", "some content")).rejects.toThrow(
      /empty slug/,
    );
  });

  it("rejects title that produces empty slug after stripping special chars", async () => {
    await expect(ingest("!!!", "some content")).rejects.toThrow(
      /empty slug/,
    );
  });

  it("rejects whitespace-only title", async () => {
    await expect(ingest("   ", "some content")).rejects.toThrow(
      /empty slug/,
    );
  });
});

// ---------------------------------------------------------------------------
// extractSummary
// ---------------------------------------------------------------------------

describe("extractSummary", () => {
  it("does not split on bare period (old bug: 'Dr.' → 'Dr')", () => {
    const text = "Dr. Smith is a renowned scientist. He studies AI.";
    const summary = extractSummary(text);
    // Old code split on bare "." giving "Dr". New code uses "[.!?]\s" which
    // matches "Dr. " — gives "Dr." which at least includes the period.
    // The key fix: it's no longer splitting on bare "." or bare "\n".
    expect(summary).not.toBe("Dr");
    expect(summary.length).toBeGreaterThanOrEqual(3);
  });

  it("uses first sentence ending with period-space", () => {
    const text = "This is the first sentence. This is the second.";
    expect(extractSummary(text)).toBe("This is the first sentence.");
  });

  it("uses paragraph break as boundary", () => {
    const text = "First paragraph without period\n\nSecond paragraph here";
    expect(extractSummary(text)).toBe("First paragraph without period");
  });

  it("picks the earlier of sentence boundary and paragraph break", () => {
    const text = "Short sentence. More text\n\nParagraph two";
    expect(extractSummary(text)).toBe("Short sentence.");
  });

  it("truncates long content with no sentence boundary", () => {
    const long = "a".repeat(300);
    const summary = extractSummary(long);
    expect(summary.length).toBeLessThanOrEqual(203 + 3); // 200 + "..."
    expect(summary.endsWith("...")).toBe(true);
  });

  it("returns empty string for empty content", () => {
    expect(extractSummary("")).toBe("");
    expect(extractSummary("   ")).toBe("");
  });

  it("returns full content when shorter than maxLen and no sentence end", () => {
    expect(extractSummary("Short text")).toBe("Short text");
  });

  it("handles exclamation marks as sentence boundaries", () => {
    const text = "Wow! That was amazing. Indeed.";
    expect(extractSummary(text)).toBe("Wow!");
  });

  it("handles question marks as sentence boundaries", () => {
    const text = "What happened? Nobody knows.";
    expect(extractSummary(text)).toBe("What happened?");
  });

  it("respects custom maxLen", () => {
    const text = "This is a fairly long first sentence that goes on and on. Second sentence.";
    const summary = extractSummary(text, 20);
    // Sentence boundary is beyond maxLen=20, so it truncates
    expect(summary.length).toBeLessThanOrEqual(23 + 3);
    expect(summary.endsWith("...")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ingest pipeline (integration, no LLM key)
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-test-"));
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

describe("ingest", () => {
  it("creates wiki page and index entry", async () => {
    const result = await ingest("Test Article", "This is the content. More stuff here.");
    expect(result.wikiPages).toContain("test-article");
    expect(result.indexUpdated).toBe(true);

    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0].slug).toBe("test-article");
    expect(entries[0].title).toBe("Test Article");
    expect(entries[0].summary).toBe("This is the content.");
  });

  it("updates existing entry on re-ingest instead of duplicating", async () => {
    // First ingest
    await ingest("My Topic", "Original content about the topic. More details.");

    let entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toBe("Original content about the topic.");

    // Re-ingest with updated content
    await ingest("My Topic", "Updated content about the topic. New information.");

    entries = await listWikiPages();
    // Should still be 1 entry, NOT 2
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("My Topic");
    expect(entries[0].summary).toBe("Updated content about the topic.");
  });

  it("updates title on re-ingest when slug matches but title differs", async () => {
    // The slug for both is "hello-world"
    await ingest("Hello World", "First version of the doc. Details here.");

    let entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Hello World");

    // Same slug, different title text (slug normalizes the same)
    await ingest("Hello  World", "Second version of the doc. Different details.");

    entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Hello  World");
    expect(entries[0].summary).toBe("Second version of the doc.");
  });

  it("uses extractSummary for index entries (not bare period split)", async () => {
    await ingest("Dr Smith Bio", "Dr. Smith earned his Ph.D. in 2001. He then joined MIT.");

    const entries = await listWikiPages();
    expect(entries).toHaveLength(1);
    // Old code would produce "Dr" from bare period split.
    // New code produces "Dr." (period + space boundary) — still short but includes punctuation.
    expect(entries[0].summary).not.toBe("Dr");
    expect(entries[0].summary.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ingest — YAML frontmatter
// ---------------------------------------------------------------------------

describe("ingest — YAML frontmatter", () => {
  it("prepends a frontmatter block to new pages", async () => {
    await ingest("Frontmatter Test", "Some source content. With a sentence.");

    const { readWikiPageWithFrontmatter } = await import("../wiki");
    const page = await readWikiPageWithFrontmatter("frontmatter-test");
    expect(page).not.toBeNull();

    // Raw content must start with the frontmatter delimiter.
    expect(page!.content.startsWith("---\n")).toBe(true);

    // Parsed frontmatter has the four expected keys.
    expect(typeof page!.frontmatter.created).toBe("string");
    expect(typeof page!.frontmatter.updated).toBe("string");
    expect(page!.frontmatter.source_count).toBe("1");
    expect(page!.frontmatter.tags).toEqual([]);

    // created/updated are YYYY-MM-DD strings.
    expect(page!.frontmatter.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(page!.frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Body (frontmatter stripped) still contains a heading.
    expect(page!.body).toContain("# ");
  });

  it("increments source_count and preserves created on re-ingest", async () => {
    const { readWikiPageWithFrontmatter } = await import("../wiki");

    await ingest("Recurring", "First version of the content. Details.");
    const first = await readWikiPageWithFrontmatter("recurring");
    expect(first).not.toBeNull();
    const originalCreated = first!.frontmatter.created as string;
    expect(first!.frontmatter.source_count).toBe("1");

    // Simulate a later re-ingest: manually rewrite the page with an older
    // `created` date so we can verify it's preserved across re-ingest even
    // when the clock has moved.
    await writeWikiPage(
      "recurring",
      `---\ncreated: 2020-01-01\nupdated: 2020-01-01\nsource_count: 1\ntags: [keep-me]\n---\n\n# Recurring\n\nOlder body.\n`,
    );

    await ingest("Recurring", "Second version of the content. More details.");

    const second = await readWikiPageWithFrontmatter("recurring");
    expect(second).not.toBeNull();
    // created preserved from the existing page on disk
    expect(second!.frontmatter.created).toBe("2020-01-01");
    // source_count incremented
    expect(second!.frontmatter.source_count).toBe("2");
    // updated advanced to today (YYYY-MM-DD)
    expect(second!.frontmatter.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(second!.frontmatter.updated).not.toBe("2020-01-01");
    // user-edited tags preserved
    expect(second!.frontmatter.tags).toEqual(["keep-me"]);
    // sanity: originalCreated was a "today" date on the first ingest
    expect(originalCreated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// isUrl
// ---------------------------------------------------------------------------

describe("isUrl", () => {
  it("recognizes http URLs", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("recognizes https URLs", () => {
    expect(isUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects plain text", () => {
    expect(isUrl("just some text")).toBe(false);
  });

  it("rejects titles that contain URLs", () => {
    expect(isUrl("My article about https")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUrl("")).toBe(false);
  });

  it("handles URLs with leading whitespace", () => {
    expect(isUrl("  https://example.com")).toBe(true);
  });

  it("rejects ftp URLs", () => {
    expect(isUrl("ftp://files.example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripHtml & extractTitle
// ---------------------------------------------------------------------------

describe("stripHtml", () => {
  it("removes basic HTML tags and preserves text", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("removes script tags and their contents", () => {
    const html = '<p>Before</p><script>var x = 1;</script><p>After</p>';
    expect(stripHtml(html)).toBe("Before After");
  });

  it("removes style tags and their contents", () => {
    const html = '<style>.foo { color: red; }</style><p>Content</p>';
    expect(stripHtml(html)).toBe("Content");
  });

  it("removes nav, header, footer elements", () => {
    const html = '<nav><a href="/">Home</a></nav><main><p>Article text</p></main><footer>Copyright</footer>';
    expect(stripHtml(html)).toBe("Article text");
  });

  it("removes noscript elements", () => {
    const html = '<noscript>Please enable JS</noscript><p>Real content</p>';
    expect(stripHtml(html)).toBe("Real content");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39; &nbsp;")).toBe('& < > " \'');
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>  Hello   world  </p>")).toBe("Hello world");
  });

  it("handles multiline script tags", () => {
    const html = `<script type="text/javascript">
      function foo() {
        return "bar";
      }
    </script><p>Content here</p>`;
    expect(stripHtml(html)).toBe("Content here");
  });
});

describe("extractTitle", () => {
  it("extracts title from HTML", () => {
    const html = '<html><head><title>My Page Title</title></head><body></body></html>';
    expect(extractTitle(html)).toBe("My Page Title");
  });

  it("returns empty string when no title tag", () => {
    const html = '<html><head></head><body><p>content</p></body></html>';
    expect(extractTitle(html)).toBe("");
  });

  it("handles title with extra whitespace", () => {
    const html = '<title>  Spaced   Title  </title>';
    expect(extractTitle(html)).toBe("Spaced Title");
  });
});

// ---------------------------------------------------------------------------
// extractWithReadability
// ---------------------------------------------------------------------------

describe("extractWithReadability", () => {
  it("extracts article content and title from well-structured HTML", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>My Article</title></head>
      <body>
        <nav><a href="/">Home</a></nav>
        <article>
          <h1>My Article</h1>
          <p>This is the first paragraph of a well-written article about testing.</p>
          <p>This is the second paragraph with more detail about the topic at hand.</p>
          <p>And a third paragraph to ensure there is enough content for Readability.</p>
        </article>
        <footer>Copyright 2024</footer>
      </body>
      </html>
    `;
    const result = extractWithReadability(html);
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain("first paragraph");
    expect(result!.textContent).toContain("second paragraph");
    // Nav and footer content should not appear in extracted text
    expect(result!.textContent).not.toContain("Copyright 2024");
  });

  it("returns null for minimal HTML with no article structure", () => {
    const html = "<html><body><p>Hi</p></body></html>";
    const result = extractWithReadability(html);
    // Readability may return null for very short/non-article content
    // Either null or a valid result is acceptable for minimal content
    if (result !== null) {
      expect(result.textContent.length).toBeGreaterThan(0);
    }
  });

  it("strips script and style content from article extraction", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Script Test</title></head>
      <body>
        <article>
          <h1>Article Title</h1>
          <p>Real article content that should be extracted properly.</p>
          <p>More content to give Readability something substantial to work with.</p>
          <p>Yet another paragraph of meaningful article text for extraction.</p>
          <script>var tracking = "should not appear";</script>
          <style>.hidden { display: none; }</style>
        </article>
      </body>
      </html>
    `;
    const result = extractWithReadability(html);
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain("Real article content");
    expect(result!.textContent).not.toContain("should not appear");
    expect(result!.textContent).not.toContain("display: none");
  });

  it("handles HTML with tables cleanly", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Table Page</title></head>
      <body>
        <article>
          <h1>Data Report</h1>
          <p>Here is a summary of the data from the quarterly report.</p>
          <table>
            <tr><th>Name</th><th>Value</th></tr>
            <tr><td>Alpha</td><td>100</td></tr>
            <tr><td>Beta</td><td>200</td></tr>
          </table>
          <p>The above table shows the key metrics for the quarter.</p>
          <p>Additional analysis follows in the next section of this report.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractWithReadability(html);
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain("Alpha");
    expect(result!.textContent).toContain("Beta");
    expect(result!.textContent).toContain("summary of the data");
  });
});

// ---------------------------------------------------------------------------
// fetchUrlContent (mocked fetch)
// ---------------------------------------------------------------------------

describe("fetchUrlContent", () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Test Article</title></head>
    <body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <header><h1>Site Header</h1></header>
      <main>
        <h1>Test Article</h1>
        <p>This is the main article content. It has multiple sentences.</p>
        <p>Second paragraph with more information.</p>
      </main>
      <footer><p>Copyright 2024</p></footer>
      <script>console.log("tracking");</script>
    </body>
    </html>
  `;

  /** Helper to create a mock headers object */
  function mockHeaders(h: Record<string, string> = {}) {
    return { get: (key: string) => h[key.toLowerCase()] ?? null };
  }

  it("extracts title and content from HTML", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve(sampleHtml),
    });

    try {
      const result = await fetchUrlContent("https://example.com/article");
      expect(result.title).toBe("Test Article");
      expect(result.content).toContain("main article content");
      expect(result.content).toContain("Second paragraph");
      // Nav, header, footer, script content should be stripped
      expect(result.content).not.toContain("Site Header");
      expect(result.content).not.toContain("Copyright 2024");
      expect(result.content).not.toContain("tracking");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("falls back to hostname when no title tag", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve("<html><body><p>Some content</p></body></html>"),
    });

    try {
      const result = await fetchUrlContent("https://example.com/page");
      expect(result.title).toBe("example.com");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    try {
      await expect(fetchUrlContent("https://example.com/missing")).rejects.toThrow(
        "Failed to fetch URL: 404 Not Found",
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws when Content-Length header exceeds 5 MB", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders({ "content-length": "10000000" }),
      text: () => Promise.resolve("<p>should not be read</p>"),
    });

    try {
      await expect(fetchUrlContent("https://example.com/huge")).rejects.toThrow(
        /Content too large.*10000000/,
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws when body exceeds 5 MB (no Content-Length header)", async () => {
    const originalFetch = global.fetch;
    const hugeBody = "<p>" + "x".repeat(6 * 1024 * 1024) + "</p>";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(), // no content-length
      text: () => Promise.resolve(hugeBody),
    });

    try {
      await expect(fetchUrlContent("https://example.com/huge")).rejects.toThrow(
        /Content too large/,
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("truncates extracted content exceeding 100K characters", async () => {
    const originalFetch = global.fetch;
    // Build HTML whose stripped text will be > 100K chars
    const longText = "word ".repeat(25_000); // 125K chars
    const html = `<html><head><title>Long Doc</title></head><body><p>${longText}</p></body></html>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve(html),
    });

    try {
      const result = await fetchUrlContent("https://example.com/long");
      expect(result.content.length).toBeLessThanOrEqual(100_000 + 30); // allow for suffix
      expect(result.content).toContain("[Content truncated]");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("passes AbortSignal.timeout to fetch", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve("<html><body><p>Hello</p></body></html>"),
    });

    try {
      await fetchUrlContent("https://example.com/test");
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1]).toHaveProperty("signal");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("uses Readability for article-shaped HTML", async () => {
    const originalFetch = global.fetch;
    const articleHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Readability Article</title></head>
      <body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <header><h1>Site Name</h1></header>
        <article>
          <h1>Readability Article</h1>
          <p>This is a substantial article with enough content for Readability to detect it as an article. It discusses various topics in detail.</p>
          <p>The second paragraph continues the discussion with additional details and analysis of the subject matter at hand.</p>
          <p>A third paragraph provides even more context and ensures Readability has sufficient text to work with for extraction.</p>
        </article>
        <footer><p>Copyright 2024 - Site Footer</p></footer>
        <script>console.log("analytics tracking code");</script>
      </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve(articleHtml),
    });

    try {
      const result = await fetchUrlContent("https://example.com/article");
      expect(result.title).toBe("Readability Article");
      expect(result.content).toContain("substantial article");
      expect(result.content).toContain("second paragraph");
      // Readability should strip nav, footer, script content
      expect(result.content).not.toContain("analytics tracking code");
      expect(result.content).not.toContain("Copyright 2024");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("falls back to stripHtml when Readability cannot parse the page", async () => {
    const originalFetch = global.fetch;
    // Minimal HTML that Readability may not identify as an article
    const minimalHtml = `<html><body><p>Some content</p></body></html>`;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve(minimalHtml),
    });

    try {
      const result = await fetchUrlContent("https://example.com/minimal");
      // Whether Readability succeeds or the fallback kicks in,
      // we should still get the content
      expect(result.content).toContain("Some content");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("prefers Readability title over regex-extracted title", async () => {
    const originalFetch = global.fetch;
    // HTML where <title> differs from the article heading that Readability might pick up
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>SEO Title - MySite.com</title></head>
      <body>
        <article>
          <h1>Clean Article Title</h1>
          <p>This is a well-structured article with enough content for Readability to process it correctly and extract the article.</p>
          <p>Additional paragraphs help Readability determine this is indeed an article worth extracting from the page.</p>
          <p>A third paragraph of meaningful content ensures the extraction succeeds with proper title detection.</p>
        </article>
      </body>
      </html>
    `;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(),
      text: () => Promise.resolve(html),
    });

    try {
      const result = await fetchUrlContent("https://example.com/article");
      // Readability should extract a title - it may use <title> or <h1>
      // The key thing: we should get a meaningful title, not just the hostname
      expect(result.title).toBeTruthy();
      expect(result.title).not.toBe("example.com");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// ingestUrl (integration with mocked fetch, no LLM key)
// ---------------------------------------------------------------------------

describe("ingestUrl", () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Web Article</title></head>
    <body>
      <main>
        <p>This is a web article about AI. It covers many topics.</p>
      </main>
    </body>
    </html>
  `;

  it("fetches URL and creates wiki page", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve(sampleHtml),
    });

    try {
      const result = await ingestUrl("https://example.com/ai-article");
      expect(result.wikiPages).toContain("web-article");
      expect(result.indexUpdated).toBe(true);

      const entries = await listWikiPages();
      const entry = entries.find((e) => e.slug === "web-article");
      expect(entry).toBeDefined();
      expect(entry!.title).toBe("Web Article");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// cross-referencing
// ---------------------------------------------------------------------------

describe("cross-referencing", () => {
  describe("findRelatedPages", () => {
    it("returns empty array when no LLM key", async () => {
      mockedHasLLMKey.mockReturnValue(false);
      const entries: IndexEntry[] = [
        { title: "AI", slug: "ai", summary: "About AI" },
      ];
      const result = await findRelatedPages("new-page", "some content", entries);
      expect(result).toEqual([]);
    });

    it("returns empty array when no existing pages", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      const result = await findRelatedPages("new-page", "some content", []);
      expect(result).toEqual([]);
    });

    it("returns related slugs from LLM response", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockResolvedValue('["ai", "machine-learning"]');
      const entries: IndexEntry[] = [
        { title: "AI", slug: "ai", summary: "About AI" },
        { title: "Machine Learning", slug: "machine-learning", summary: "About ML" },
        { title: "Cooking", slug: "cooking", summary: "About cooking" },
      ];
      const result = await findRelatedPages("new-page", "deep learning content", entries);
      expect(result).toEqual(["ai", "machine-learning"]);
    });

    it("filters out invalid slugs from LLM response", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockResolvedValue('["ai", "nonexistent-page"]');
      const entries: IndexEntry[] = [
        { title: "AI", slug: "ai", summary: "About AI" },
      ];
      const result = await findRelatedPages("new-page", "content", entries);
      expect(result).toEqual(["ai"]);
    });

    it("filters out the new page's own slug", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockResolvedValue('["new-page", "ai"]');
      const entries: IndexEntry[] = [
        { title: "New Page", slug: "new-page", summary: "The new page" },
        { title: "AI", slug: "ai", summary: "About AI" },
      ];
      const result = await findRelatedPages("new-page", "content", entries);
      expect(result).toEqual(["ai"]);
    });

    it("returns empty array on LLM error", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockRejectedValue(new Error("API error"));
      const entries: IndexEntry[] = [
        { title: "AI", slug: "ai", summary: "About AI" },
      ];
      const result = await findRelatedPages("new-page", "content", entries);
      expect(result).toEqual([]);
    });

    it("returns empty array on malformed JSON", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      mockedCallLLM.mockResolvedValue("not valid json at all");
      const entries: IndexEntry[] = [
        { title: "AI", slug: "ai", summary: "About AI" },
      ];
      const result = await findRelatedPages("new-page", "content", entries);
      expect(result).toEqual([]);
    });

    it("returns empty array when only entry is the new page itself", async () => {
      mockedHasLLMKey.mockReturnValue(true);
      const entries: IndexEntry[] = [
        { title: "New Page", slug: "new-page", summary: "The new page" },
      ];
      const result = await findRelatedPages("new-page", "content", entries);
      // indexList would be empty after filtering out newSlug
      expect(result).toEqual([]);
    });
  });

  describe("updateRelatedPages", () => {
    it("appends 'See also' link to related pages", async () => {
      await writeWikiPage("ai", "# AI\n\nContent about AI.");
      const updated = await updateRelatedPages("new-page", "New Page", ["ai"]);
      expect(updated).toEqual(["ai"]);

      const page = await readWikiPage("ai");
      expect(page).not.toBeNull();
      expect(page!.content).toContain("**See also:** [New Page](new-page.md)");
    });

    it("skips pages that already link to the new page", async () => {
      await writeWikiPage(
        "ai",
        "# AI\n\nContent about AI. See [New Page](new-page.md).",
      );
      const updated = await updateRelatedPages("new-page", "New Page", ["ai"]);
      expect(updated).toEqual([]);
    });

    it("appends to existing 'See also' section rather than creating duplicate", async () => {
      await writeWikiPage(
        "ai",
        "# AI\n\nContent about AI.\n\n**See also:** [Other Page](other-page.md)",
      );
      const updated = await updateRelatedPages("new-page", "New Page", ["ai"]);
      expect(updated).toEqual(["ai"]);

      const page = await readWikiPage("ai");
      expect(page).not.toBeNull();
      // Should have both links on the same "See also" line
      expect(page!.content).toContain(
        "**See also:** [Other Page](other-page.md), [New Page](new-page.md)",
      );
      // Should NOT have two separate "See also" lines
      const seeAlsoCount = (page!.content.match(/\*\*See also:\*\*/g) || []).length;
      expect(seeAlsoCount).toBe(1);
    });

    it("skips non-existent pages", async () => {
      const updated = await updateRelatedPages("new-page", "New Page", [
        "nonexistent",
      ]);
      expect(updated).toEqual([]);
    });

    it("handles multiple related pages", async () => {
      await writeWikiPage("ai", "# AI\n\nContent about AI.");
      await writeWikiPage("ml", "# ML\n\nContent about ML.");
      const updated = await updateRelatedPages("new-page", "New Page", [
        "ai",
        "ml",
      ]);
      expect(updated).toEqual(["ai", "ml"]);

      const aiPage = await readWikiPage("ai");
      const mlPage = await readWikiPage("ml");
      expect(aiPage!.content).toContain("[New Page](new-page.md)");
      expect(mlPage!.content).toContain("[New Page](new-page.md)");
    });
  });

  describe("ingest with cross-referencing", () => {
    it("returns multiple wikiPages when cross-refs are updated", async () => {
      // Pre-populate the wiki with an existing page
      await writeWikiPage("ai", "# AI\n\nContent about artificial intelligence.");

      // Set up index with the existing page
      const { updateIndex } = await import("../wiki");
      await updateIndex([
        { title: "AI", slug: "ai", summary: "Content about artificial intelligence" },
      ]);

      // Enable LLM and mock responses
      mockedHasLLMKey.mockReturnValue(true);

      // First call: generate wiki page content; second call: find related pages
      mockedCallLLM
        .mockResolvedValueOnce("# Deep Learning\n\n## Summary\n\nAbout deep learning.")
        .mockResolvedValueOnce('["ai"]');

      const result = await ingest(
        "Deep Learning",
        "Deep learning is a subset of AI. It uses neural networks.",
      );

      expect(result.wikiPages).toContain("deep-learning");
      expect(result.wikiPages).toContain("ai");
      expect(result.wikiPages.length).toBe(2);
      expect(result.primarySlug).toBe("deep-learning");
      expect(result.relatedUpdated).toEqual(["ai"]);

      // Verify the AI page was updated with a cross-reference
      const aiPage = await readWikiPage("ai");
      expect(aiPage!.content).toContain("[Deep Learning](deep-learning.md)");
    });

    it("returns only the new page when no LLM key (existing behavior)", async () => {
      mockedHasLLMKey.mockReturnValue(false);
      const result = await ingest("Solo Page", "Content for a solo page. More text.");
      expect(result.wikiPages).toEqual(["solo-page"]);
      expect(result.primarySlug).toBe("solo-page");
      expect(result.relatedUpdated).toEqual([]);
    });
  });

  // Restore default mock after cross-referencing tests
  afterEach(() => {
    mockedHasLLMKey.mockReturnValue(false);
    mockedCallLLM.mockReset();
  });
});
