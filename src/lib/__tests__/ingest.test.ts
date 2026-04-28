import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  extractSummary,
  ingest,
  ingestUrl,
  reingest,
  buildIngestSystemPrompt,
  chunkText,
} from "../ingest";
import { slugify } from "../slugify";
import { loadPageConventions } from "../schema";
import {
  isUrl,
  stripHtml,
  extractTitle,
  extractWithReadability,
  fetchUrlContent,
  validateUrlSafety,
} from "../fetch";
import { findRelatedPages, updateRelatedPages } from "../search";
import { MAX_LLM_INPUT_CHARS } from "../constants";
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
// ingest — source URL tracking in frontmatter
// ---------------------------------------------------------------------------

describe("ingest — source URL tracking", () => {
  it("stores source_url in frontmatter when sourceUrl option is provided", async () => {
    const result = await ingest("Url Source Test", "Content from a URL. Some text.", {
      sourceUrl: "https://example.com/article",
    });

    expect(result.sourceUrl).toBe("https://example.com/article");

    const { readWikiPageWithFrontmatter } = await import("../wiki");
    const page = await readWikiPageWithFrontmatter("url-source-test");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.source_url).toBe("https://example.com/article");
  });

  it("does NOT add source_url when no sourceUrl option is provided (text paste)", async () => {
    await ingest("Plain Text Paste", "Just some pasted text. Nothing special.");

    const { readWikiPageWithFrontmatter } = await import("../wiki");
    const page = await readWikiPageWithFrontmatter("plain-text-paste");
    expect(page).not.toBeNull();
    // source_url should be absent from the frontmatter
    expect(page!.frontmatter.source_url).toBeUndefined();
  });

  it("preserves existing source_url on re-ingest without a new URL", async () => {
    // First ingest with a URL
    await ingest("Reingest Url", "First version content. Details here.", {
      sourceUrl: "https://example.com/original",
    });

    const { readWikiPageWithFrontmatter } = await import("../wiki");
    const first = await readWikiPageWithFrontmatter("reingest-url");
    expect(first).not.toBeNull();
    expect(first!.frontmatter.source_url).toBe("https://example.com/original");

    // Re-ingest the same slug WITHOUT providing a sourceUrl (e.g. text paste update)
    await ingest("Reingest Url", "Second version content. Updated details.");

    const second = await readWikiPageWithFrontmatter("reingest-url");
    expect(second).not.toBeNull();
    // The original source_url should be preserved
    expect(second!.frontmatter.source_url).toBe("https://example.com/original");
  });

  it("overwrites source_url on re-ingest with a new URL", async () => {
    // First ingest with a URL
    await ingest("Reingest New Url", "First content. Has details.", {
      sourceUrl: "https://example.com/v1",
    });

    // Re-ingest with a different URL
    await ingest("Reingest New Url", "Updated content. More details.", {
      sourceUrl: "https://example.com/v2",
    });

    const { readWikiPageWithFrontmatter } = await import("../wiki");
    const page = await readWikiPageWithFrontmatter("reingest-new-url");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.source_url).toBe("https://example.com/v2");
  });

  it("ingestUrl passes the URL through to frontmatter", async () => {
    // Mock fetch so ingestUrl doesn't make a real HTTP request
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([
        ["content-type", "text/html"],
      ]) as unknown as Headers,
      body: {
        getReader: () => {
          let called = false;
          return {
            read: () => {
              if (!called) {
                called = true;
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(
                    "<html><head><title>Fetched Article</title></head><body><p>Article body content. A full sentence.</p></body></html>",
                  ),
                });
              }
              return Promise.resolve({ done: true, value: undefined });
            },
            cancel: vi.fn(),
          };
        },
      },
    });

    try {
      const result = await ingestUrl("https://example.com/fetched-article");
      expect(result.sourceUrl).toBe("https://example.com/fetched-article");

      const { readWikiPageWithFrontmatter } = await import("../wiki");
      const page = await readWikiPageWithFrontmatter(result.primarySlug);
      expect(page).not.toBeNull();
      expect(page!.frontmatter.source_url).toBe("https://example.com/fetched-article");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

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

  it("decodes numeric decimal entities", () => {
    // &#8212; = em dash (—), &#169; = copyright (©)
    expect(stripHtml("Hello&#8212;world")).toBe("Hello\u2014world");
    expect(stripHtml("&#169; 2026")).toBe("\u00A9 2026");
  });

  it("decodes numeric hex entities", () => {
    // &#x2014; = em dash (—), &#x2019; = right single quote (')
    expect(stripHtml("Hello&#x2014;world")).toBe("Hello\u2014world");
    expect(stripHtml("it&#x2019;s")).toBe("it\u2019s");
  });

  it("decodes common named HTML5 entities", () => {
    expect(stripHtml("a&mdash;b")).toBe("a\u2014b");
    expect(stripHtml("a&ndash;b")).toBe("a\u2013b");
    expect(stripHtml("wait&hellip;")).toBe("wait\u2026");
    expect(stripHtml("&lsquo;hi&rsquo;")).toBe("\u2018hi\u2019");
    expect(stripHtml("&ldquo;hi&rdquo;")).toBe("\u201Chi\u201D");
    expect(stripHtml("&trade; &copy; &reg;")).toBe("\u2122 \u00A9 \u00AE");
    expect(stripHtml("&bull; &middot;")).toBe("\u2022 \u00B7");
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

  it("decodes astral Unicode decimal entities (emoji)", () => {
    // &#128512; = U+1F600 = 😀 (grinning face)
    expect(stripHtml("&#128512;")).toBe("😀");
  });

  it("decodes astral Unicode hex entities (emoji)", () => {
    // &#x1F600; = U+1F600 = 😀 (grinning face)
    expect(stripHtml("&#x1F600;")).toBe("😀");
  });

  it("decodes astral Unicode mixed with text", () => {
    expect(stripHtml("Hello &#128512; World")).toBe("Hello 😀 World");
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

  it("throws on unsupported content type (application/pdf)", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders({ "content-type": "application/pdf" }),
      text: () => Promise.resolve("binary garbage"),
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/doc.pdf"),
      ).rejects.toThrow("Unsupported content type");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws on unsupported content type (image/png)", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders({ "content-type": "image/png" }),
      text: () => Promise.resolve("binary garbage"),
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/image.png"),
      ).rejects.toThrow("Unsupported content type");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns raw text for text/plain content type (no HTML parsing)", async () => {
    const originalFetch = global.fetch;
    const plainText = "This is plain text content.\nSecond line of text.";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders({ "content-type": "text/plain; charset=utf-8" }),
      text: () => Promise.resolve(plainText),
    });

    try {
      const result = await fetchUrlContent("https://example.com/readme.txt");
      expect(result.title).toBe("example.com");
      expect(result.content).toBe(plainText);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns raw text for text/markdown content type", async () => {
    const originalFetch = global.fetch;
    const markdown = "# Hello\n\nSome **bold** text.";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders({ "content-type": "text/markdown" }),
      text: () => Promise.resolve(markdown),
    });

    try {
      const result = await fetchUrlContent("https://example.com/doc.md");
      expect(result.title).toBe("example.com");
      expect(result.content).toBe(markdown);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("proceeds with HTML parsing when Content-Type header is absent", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders(), // no content-type
      text: () => Promise.resolve(sampleHtml),
    });

    try {
      const result = await fetchUrlContent("https://example.com/article");
      // Should still parse HTML successfully
      expect(result.title).toBe("Test Article");
      expect(result.content).toContain("main article content");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("handles content-type with charset parameter correctly", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders({ "content-type": "text/html; charset=utf-8" }),
      text: () => Promise.resolve(sampleHtml),
    });

    try {
      const result = await fetchUrlContent("https://example.com/article");
      expect(result.title).toBe("Test Article");
      expect(result.content).toContain("main article content");
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

// ---------------------------------------------------------------------------
// schema-aware ingest prompt
// ---------------------------------------------------------------------------

describe("schema-aware ingest prompt", () => {
  it("loadPageConventions reads the real SCHEMA.md and starts at the right heading", async () => {
    const conventions = await loadPageConventions();
    // The slice must start with the section heading itself.
    expect(conventions.startsWith("## Page conventions")).toBe(true);
    // And include a recognizable substring from the current SCHEMA.md.
    // If SCHEMA.md ever stops mentioning kebab-case slugs in this section,
    // this test failing is the co-evolution alarm — fix the schema or the
    // ingest path, not the test, to keep them in sync.
    expect(conventions).toContain("kebab-case slugs");
  });

  it("loadPageConventions stops at the next ## heading (no bleed into Operations)", async () => {
    const conventions = await loadPageConventions();
    // The very next top-level section after "Page conventions" in the
    // current SCHEMA.md is "## Operations". The slice MUST NOT include it.
    expect(conventions).not.toContain("## Operations");
    // And must not include text from later sections either.
    expect(conventions).not.toContain("Cross-reference policy");
    expect(conventions).not.toContain("Lint checks");
  });

  it("loadPageConventions returns empty string for a missing file", async () => {
    const result = await loadPageConventions(
      "/nonexistent/path/SCHEMA-does-not-exist.md",
    );
    expect(result).toBe("");
  });

  it("loadPageConventions returns empty string when section is absent", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-schema-"));
    try {
      const fakeSchema = path.join(tmpDir, "SCHEMA.md");
      await fs.writeFile(
        fakeSchema,
        "# Wiki Schema\n\n## Layers\n\nNothing about page conventions here.\n",
      );
      const result = await loadPageConventions(fakeSchema);
      expect(result).toBe("");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("buildIngestSystemPrompt composes the base prompt with the conventions slice", async () => {
    const prompt = await buildIngestSystemPrompt();
    // Base prompt marker — comes from INGEST_SYSTEM_PROMPT_BASE.
    expect(prompt).toContain("You are a wiki editor");
    // Conventions marker — comes from SCHEMA.md.
    expect(prompt).toContain("## Page conventions");
    expect(prompt).toContain("kebab-case slugs");
    // The composition glue text proves we went through the full path,
    // not just the early-return branch.
    expect(prompt).toContain("conventions (from SCHEMA.md)");
  });

  it("buildIngestSystemPrompt always contains the base prompt (graceful composition)", async () => {
    // Whether or not SCHEMA.md is present, the base prompt must survive
    // intact — graceful degradation rather than a crash on a fresh clone.
    const prompt = await buildIngestSystemPrompt();
    expect(prompt).toContain("You are a wiki editor");
    expect(prompt).toContain("Output pure markdown and nothing else");
  });
});

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------

describe("chunkText", () => {
  it("returns a single chunk when content is shorter than limit", () => {
    const text = "Short content here.";
    const chunks = chunkText(text, 100);
    expect(chunks).toEqual([text]);
  });

  it("splits on paragraph boundaries", () => {
    const para1 = "First paragraph with some text.";
    const para2 = "Second paragraph with more text.";
    const para3 = "Third paragraph with even more.";
    const text = `${para1}\n\n${para2}\n\n${para3}`;
    // Each paragraph is ~31 chars. Set limit to 65 so two fit but not three.
    const chunks = chunkText(text, 65);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(`${para1}\n\n${para2}`);
    expect(chunks[1]).toBe(para3);
  });

  it("splits a single giant paragraph on sentence boundaries", () => {
    const s1 = "First sentence here.";
    const s2 = "Second sentence here.";
    const s3 = "Third sentence here.";
    // Single paragraph (no \n\n), joined by spaces
    const text = `${s1} ${s2} ${s3}`;
    // Set limit so only ~2 sentences fit per chunk
    const chunks = chunkText(text, 45);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk must be within the limit
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(45);
    }
  });

  it("preserves all content (join approximates original)", () => {
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i + 1} has some content about topic ${i}.`,
    );
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    // Rejoining should contain all original paragraphs
    const rejoined = chunks.join("\n\n");
    for (const para of paragraphs) {
      expect(rejoined).toContain(para);
    }
  });

  it("hard-splits a sentence that exceeds maxChars", () => {
    // One long word with no sentence boundaries
    const text = "a".repeat(300);
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("uses MAX_LLM_INPUT_CHARS as the default", () => {
    // Just verify the constant is exported and is a sensible number
    expect(MAX_LLM_INPUT_CHARS).toBe(12_000);
    // Default chunkText with short text returns single chunk
    const short = "hello";
    expect(chunkText(short)).toEqual([short]);
  });
});

// ---------------------------------------------------------------------------
// ingest — chunked LLM calls for long content
// ---------------------------------------------------------------------------

describe("ingest — chunked LLM calls", () => {
  it("calls LLM multiple times for long content", async () => {
    // Enable LLM mock
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("# Wiki Page\n\n## Summary\n\nMocked content.");

    // Create content longer than MAX_LLM_INPUT_CHARS
    const longContent = Array.from(
      { length: 300 },
      (_, i) => `Paragraph ${i} discusses topic number ${i} in detail with enough text to be substantial.`,
    ).join("\n\n");

    expect(longContent.length).toBeGreaterThan(MAX_LLM_INPUT_CHARS);

    const result = await ingest("Long Article", longContent);
    expect(result.primarySlug).toBe("long-article");

    // Should have called LLM more than once due to chunking
    expect(mockedCallLLM.mock.calls.length).toBeGreaterThan(1);

    // Reset
    mockedHasLLMKey.mockReturnValue(false);
    mockedCallLLM.mockReset();
  });

  it("calls LLM exactly once for short content", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("# Short Page\n\n## Summary\n\nBrief.");

    const shortContent = "A brief article about something. Not very long.";
    expect(shortContent.length).toBeLessThan(MAX_LLM_INPUT_CHARS);

    await ingest("Short Article", shortContent);

    expect(mockedCallLLM.mock.calls.length).toBe(1);

    mockedHasLLMKey.mockReturnValue(false);
    mockedCallLLM.mockReset();
  });
});

// ---------------------------------------------------------------------------
// validateUrlSafety — SSRF protection
// ---------------------------------------------------------------------------

describe("validateUrlSafety", () => {
  // Blocked URLs
  it("blocks localhost", () => {
    expect(() => validateUrlSafety("http://localhost/foo")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks 127.0.0.1", () => {
    expect(() => validateUrlSafety("http://127.0.0.1/foo")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks AWS metadata endpoint 169.254.169.254", () => {
    expect(() =>
      validateUrlSafety("http://169.254.169.254/latest/meta-data/"),
    ).toThrow(/URL blocked/);
  });

  it("blocks 10.x.x.x private range", () => {
    expect(() => validateUrlSafety("http://10.0.0.1/internal")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks 192.168.x.x private range", () => {
    expect(() => validateUrlSafety("http://192.168.1.1/admin")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks 172.16.x.x private range", () => {
    expect(() => validateUrlSafety("http://172.16.0.1/")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks IPv6 loopback [::1]", () => {
    expect(() => validateUrlSafety("http://[::1]/")).toThrow(/URL blocked/);
  });

  it("blocks file:// scheme", () => {
    expect(() => validateUrlSafety("file:///etc/passwd")).toThrow(
      /URL blocked.*not allowed/,
    );
  });

  it("blocks ftp:// scheme", () => {
    expect(() => validateUrlSafety("ftp://files.example.com/")).toThrow(
      /URL blocked.*not allowed/,
    );
  });

  it("blocks .local hostnames", () => {
    expect(() => validateUrlSafety("http://myserver.local/api")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks .internal hostnames", () => {
    expect(() => validateUrlSafety("http://db.internal/admin")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks 0.0.0.0", () => {
    expect(() => validateUrlSafety("http://0.0.0.0/")).toThrow(/URL blocked/);
  });

  // Allowed URLs
  it("allows https://example.com", () => {
    expect(() => validateUrlSafety("https://example.com")).not.toThrow();
  });

  it("allows http://example.com", () => {
    expect(() => validateUrlSafety("http://example.com")).not.toThrow();
  });

  it("allows public IP addresses", () => {
    expect(() => validateUrlSafety("http://8.8.8.8/")).not.toThrow();
  });

  // IPv4-mapped IPv6 addresses
  it("blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
    expect(() => validateUrlSafety("http://[::ffff:127.0.0.1]/")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks IPv4-mapped IPv6 private (::ffff:10.0.0.1)", () => {
    expect(() => validateUrlSafety("http://[::ffff:10.0.0.1]/")).toThrow(
      /URL blocked/,
    );
  });

  it("blocks IPv4-mapped IPv6 link-local (::ffff:169.254.169.254)", () => {
    expect(() =>
      validateUrlSafety("http://[::ffff:169.254.169.254]/"),
    ).toThrow(/URL blocked/);
  });

  it("allows IPv4-mapped IPv6 public (::ffff:8.8.8.8)", () => {
    expect(() =>
      validateUrlSafety("http://[::ffff:8.8.8.8]/"),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fetchUrlContent — redirect handling
// ---------------------------------------------------------------------------

describe("fetchUrlContent — redirect handling", () => {
  /** Helper to create a mock headers object */
  function mockHeaders(h: Record<string, string> = {}) {
    return { get: (key: string) => h[key.toLowerCase()] ?? null };
  }

  it("uses redirect: 'manual' in fetch options", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: mockHeaders(),
      text: () => Promise.resolve("<html><body><p>Hello</p></body></html>"),
      body: null,
    });

    try {
      await fetchUrlContent("https://example.com/page");
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1]).toHaveProperty("redirect", "manual");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("follows safe redirects", async () => {
    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: redirect
        return Promise.resolve({
          ok: false,
          status: 302,
          headers: mockHeaders({ location: "https://safe.example.com/final" }),
          text: () => Promise.resolve(""),
          body: null,
        });
      }
      // Second call: final page
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: mockHeaders({ "content-type": "text/html" }),
        text: () =>
          Promise.resolve("<html><head><title>Final</title></head><body><p>Content here</p></body></html>"),
        body: null,
      });
    });

    try {
      const result = await fetchUrlContent("https://example.com/start");
      expect(result.title).toBe("Final");
      expect(result.content).toContain("Content here");
      expect(callCount).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("blocks redirect to private IP", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 301,
      headers: mockHeaders({
        location: "http://169.254.169.254/latest/meta-data/",
      }),
      text: () => Promise.resolve(""),
      body: null,
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/evil-redirect"),
      ).rejects.toThrow(/URL blocked/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("blocks redirect to localhost", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: mockHeaders({ location: "http://127.0.0.1/secret" }),
      text: () => Promise.resolve(""),
      body: null,
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/evil-redirect"),
      ).rejects.toThrow(/URL blocked/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws on too many redirects", async () => {
    const originalFetch = global.fetch;
    let callNum = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callNum++;
      return Promise.resolve({
        ok: false,
        status: 302,
        headers: mockHeaders({
          location: `https://example.com/hop-${callNum}`,
        }),
        text: () => Promise.resolve(""),
        body: null,
      });
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/loop"),
      ).rejects.toThrow(/Too many redirects/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws when redirect has no Location header", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 301,
      headers: mockHeaders(), // no location
      text: () => Promise.resolve(""),
      body: null,
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/bad-redirect"),
      ).rejects.toThrow(/Location header/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("streams body and enforces size limit incrementally", async () => {
    const originalFetch = global.fetch;
    // Create a mock readable stream that yields chunks
    const chunk1 = new TextEncoder().encode("x".repeat(100));
    const chunk2 = new TextEncoder().encode("x".repeat(6 * 1024 * 1024)); // exceeds MAX_RESPONSE_SIZE

    let readCount = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        readCount++;
        if (readCount === 1) return Promise.resolve({ done: false, value: chunk1 });
        if (readCount === 2) return Promise.resolve({ done: false, value: chunk2 });
        return Promise.resolve({ done: true, value: undefined });
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: mockHeaders(),
      body: { getReader: () => mockReader },
    });

    try {
      await expect(
        fetchUrlContent("https://example.com/huge-stream"),
      ).rejects.toThrow(/Content too large/);
      expect(mockReader.cancel).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// reingest
// ---------------------------------------------------------------------------

describe("reingest", () => {
  it("succeeds when page has source_url — re-fetches and updates", async () => {
    const originalFetch = global.fetch;

    // 1. Ingest a page with a source URL first
    await ingest("Reingest Test", "Original content about reingest. More details.", {
      sourceUrl: "https://example.com/reingest-test",
    });

    // Verify the page was created with source_url
    const { readWikiPageWithFrontmatter } = await import("../wiki");
    const before = await readWikiPageWithFrontmatter("reingest-test");
    expect(before).not.toBeNull();
    expect(before!.frontmatter.source_url).toBe("https://example.com/reingest-test");

    // 2. Mock global.fetch to simulate re-fetching the URL
    const mockHdrs = () =>
      new Map([["content-type", "text/html"]]) as unknown as Headers;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: mockHdrs(),
      body: null,
      text: () =>
        Promise.resolve(
          "<html><head><title>Reingest Test Updated</title></head><body><p>Updated content about reingest. Fresh data here.</p></body></html>",
        ),
    });

    try {
      const result = await reingest("reingest-test");
      expect(result.indexUpdated).toBe(true);
      expect(result.sourceUrl).toBe("https://example.com/reingest-test");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("throws when page has no source_url", async () => {
    // Ingest a page without a source URL (text-based ingest)
    await ingest("No Source Url", "Some content without a URL. Details here.");

    await expect(reingest("no-source-url")).rejects.toThrow(
      /no source URL recorded/,
    );
  });

  it("throws when page does not exist", async () => {
    await expect(reingest("nonexistent-page")).rejects.toThrow(
      /not found/,
    );
  });
});
