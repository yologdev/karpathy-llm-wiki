import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isXPostUrl,
  extractTweetId,
  syndicationToken,
  fetchXPostContent,
} from "../x-post";
import { ClientInputError } from "../errors";

// ---------------------------------------------------------------------------
// isXPostUrl
// ---------------------------------------------------------------------------

describe("isXPostUrl", () => {
  it("matches x.com / twitter.com status URLs (incl. www, mobile)", () => {
    expect(isXPostUrl("https://x.com/jack/status/20")).toBe(true);
    expect(isXPostUrl("https://twitter.com/jack/status/20")).toBe(true);
    expect(isXPostUrl("https://www.x.com/a/status/123?s=46")).toBe(true);
    expect(isXPostUrl("https://mobile.twitter.com/a/status/123")).toBe(true);
    expect(isXPostUrl("https://x.com/i/web/status/456")).toBe(true);
  });

  it("rejects non-status X URLs and other hosts", () => {
    expect(isXPostUrl("https://x.com/jack")).toBe(false); // profile, no status
    expect(isXPostUrl("https://x.com/home")).toBe(false);
    expect(isXPostUrl("https://example.com/jack/status/20")).toBe(false);
    expect(isXPostUrl("not a url")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractTweetId
// ---------------------------------------------------------------------------

describe("extractTweetId", () => {
  it("pulls the numeric id from a status path", () => {
    expect(extractTweetId("https://x.com/jack/status/20")).toBe("20");
    expect(extractTweetId("https://x.com/i/web/status/1789?s=1")).toBe("1789");
  });

  it("returns null for non-status / non-X URLs", () => {
    expect(extractTweetId("https://x.com/jack")).toBeNull();
    expect(extractTweetId("https://example.com/a/status/9")).toBeNull();
    expect(extractTweetId("garbage")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// syndicationToken
// ---------------------------------------------------------------------------

describe("syndicationToken", () => {
  it("is deterministic, non-empty, and contains no '0' or '.'", () => {
    const t = syndicationToken("1788000000000000000");
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toMatch(/[0.]/);
    expect(syndicationToken("1788000000000000000")).toBe(t); // stable
  });
});

// ---------------------------------------------------------------------------
// fetchXPostContent
// ---------------------------------------------------------------------------

describe("fetchXPostContent", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockSyndication(body: unknown, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it("formats text, byline, expanded links, media, and source", async () => {
    mockSyndication({
      text: "Shipping this today https://t.co/abc",
      user: { name: "Ada Lovelace", screen_name: "ada" },
      entities: { urls: [{ url: "https://t.co/abc", expanded_url: "https://example.com/post" }] },
      mediaDetails: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/x.jpg", ext_alt_text: "a chart" }],
    });

    const { title, content } = await fetchXPostContent("https://x.com/ada/status/99");

    expect(title).toContain("Ada Lovelace");
    expect(content).toContain("**Ada Lovelace @ada** · X post");
    // t.co link is expanded to its destination.
    expect(content).toContain("https://example.com/post");
    expect(content).not.toContain("https://t.co/abc");
    // Media is an inline image ref with alt text.
    expect(content).toContain("![a chart](https://pbs.twimg.com/media/x.jpg)");
    // Provenance link back to the original post.
    expect(content).toContain("**Source:** [https://x.com/ada/status/99]");
  });

  it("includes a quoted tweet as a blockquote", async () => {
    mockSyndication({
      text: "look at this",
      user: { name: "A", screen_name: "a" },
      quoted_tweet: { text: "original insight", user: { screen_name: "b" } },
    });

    const { content } = await fetchXPostContent("https://x.com/a/status/1");
    expect(content).toContain("**Quoting @b:**");
    expect(content).toContain("> original insight");
  });

  it("accepts a media-only tweet delivered under `photos` (no text, no mediaDetails)", async () => {
    mockSyndication({
      text: "",
      user: { name: "Pic", screen_name: "pic" },
      photos: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/p.jpg", ext_alt_text: "a photo" }],
    });

    const { content } = await fetchXPostContent("https://x.com/pic/status/7");
    expect(content).toContain("![a photo](https://pbs.twimg.com/media/p.jpg)");
  });

  it("prefers mediaDetails over photos when both are present (no duplicates)", async () => {
    mockSyndication({
      text: "both shapes",
      user: { name: "B", screen_name: "b" },
      mediaDetails: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/detail.jpg" }],
      photos: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/photo.jpg" }],
    });
    const { content } = await fetchXPostContent("https://x.com/b/status/5");
    expect(content).toContain("detail.jpg");
    expect(content).not.toContain("photo.jpg");
  });

  it("keeps a quote-only tweet (empty top-level text/media, non-empty quoted)", async () => {
    mockSyndication({
      text: "",
      user: { name: "Q", screen_name: "q" },
      quoted_tweet: { text: "the quoted substance", user: { screen_name: "orig" } },
    });
    const { content } = await fetchXPostContent("https://x.com/q/status/6");
    expect(content).toContain("> the quoted substance");
  });

  it("truncates a long first line and falls back to author when text is empty", async () => {
    const long = "x".repeat(120);
    mockSyndication({ text: long, user: { name: "Ada", screen_name: "ada" } });
    const a = await fetchXPostContent("https://x.com/ada/status/10");
    expect(a.title.length).toBeLessThan(90);
    expect(a.title.endsWith("…")).toBe(true);

    mockSyndication({
      text: "",
      user: { name: "Ada", screen_name: "ada" },
      mediaDetails: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/x.jpg" }],
    });
    const b = await fetchXPostContent("https://x.com/ada/status/11");
    expect(b.title).toBe("Ada on X");
  });

  it("throws ClientInputError when media entries carry no URL (content-free stub)", async () => {
    mockSyndication({
      text: "",
      user: { name: "X", screen_name: "x" },
      mediaDetails: [{ type: "photo" }], // present but no media_url_https
    });
    await expect(fetchXPostContent("https://x.com/x/status/8")).rejects.toBeInstanceOf(
      ClientInputError,
    );
  });

  it("throws ClientInputError on a 404 (deleted/private)", async () => {
    mockSyndication({}, 404);
    await expect(fetchXPostContent("https://x.com/a/status/1")).rejects.toBeInstanceOf(
      ClientInputError,
    );
  });

  it("throws ClientInputError on an error/tombstone payload", async () => {
    mockSyndication({ tombstone: { text: "This Post was deleted" } });
    await expect(fetchXPostContent("https://x.com/a/status/1")).rejects.toBeInstanceOf(
      ClientInputError,
    );
  });

  it("throws ClientInputError for an unrecognizable URL (no fetch)", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    await expect(fetchXPostContent("https://x.com/jack")).rejects.toBeInstanceOf(
      ClientInputError,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
