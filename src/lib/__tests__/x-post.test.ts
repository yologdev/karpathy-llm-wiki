import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isXPostUrl,
  extractTweetId,
  syndicationToken,
  fetchXPostContent,
} from "../x-post";
import { ClientInputError } from "../errors";
import { logger } from "../logger";

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

// ---------------------------------------------------------------------------
// fetchXPostContent — long-form X Articles (X API v2, X_BEARER_TOKEN)
// ---------------------------------------------------------------------------

describe("fetchXPostContent — X Articles", () => {
  const originalFetch = globalThis.fetch;
  const savedToken = process.env.X_BEARER_TOKEN;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = savedToken;
    vi.restoreAllMocks();
  });

  /** Route fetches: api.twitter.com → `apiBody`/`apiStatus`; syndication → `synBody`. */
  function mockApi(opts: {
    apiBody?: unknown;
    apiStatus?: number;
    synBody?: unknown;
  }) {
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const u = String(input);
      if (u.includes("api.twitter.com")) {
        const status = opts.apiStatus ?? 200;
        return { ok: status >= 200 && status < 300, status, json: async () => opts.apiBody ?? {} };
      }
      return { ok: true, status: 200, json: async () => opts.synBody ?? {} };
    }) as unknown as typeof fetch;
  }

  it("reads a long-form Article body via the X API (token set), with cover + byline", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      // Recent-search returns an array; the article tweet is the conversation root.
      apiBody: { data: [{ id: "123", article: { title: "My Long Essay", text: "## Section\n\nThe full article body." } }] },
      // syndication is hit only for the cover image here
      synBody: { article: { cover_media: { media_info: { original_img_url: "https://pbs.twimg.com/cover.jpg" } } } },
    });

    const { title, content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(title).toBe("My Long Essay");
    expect(content).toContain("# My Long Essay");
    expect(content).toContain("**@ada** · X Article");
    expect(content).toContain("![My Long Essay](https://pbs.twimg.com/cover.jpg)");
    expect(content).toContain("The full article body.");
    expect(content).toContain("**Source:** [https://x.com/ada/status/123]");
  });

  it("reads the body from `article.plain_text`, preferring it over the legacy `text`", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      // X serves the full body under `plain_text`; `text` is a legacy alias it
      // now returns empty. Reading the wrong one is what produced bodyless pages.
      apiBody: {
        data: [{ id: "123", article: { title: "Essay", text: "LEGACY", plain_text: "The full body via plain_text." } }],
      },
      synBody: {},
    });
    const { content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(content).toContain("The full body via plain_text.");
    expect(content).not.toContain("LEGACY");
  });

  it("falls back to the syndication teaser when the API returns a title but NO body (and warns)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    mockApi({
      // The regression case: article present with a title but empty body fields —
      // must NOT build a bodyless page; fall back to the syndication preview.
      apiBody: { data: [{ id: "123", article: { title: "18 lessons", text: "" } }] },
      synBody: { article: { title: "18 lessons", preview_text: "the 197-char gist" } },
    });
    const { content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(content).toContain("the 197-char gist");
    expect(content).toContain("Article preview only");
    // The degradation must be VISIBLE — a title-with-empty-body article logs at
    // the decision point (not a silent fall-through).
    expect(warn.mock.calls.some(([, msg]) => /EMPTY body/.test(String(msg)))).toBe(true);
  });

  it("prefers plain_text even when whitespace-only, falling back to syndication (not to legacy text)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      // `plain_text` present but whitespace: `??` selects it (it's non-null), so
      // a populated legacy `text` is NOT used — the page degrades to the teaser.
      // Pins the operator choice: a future `??`→`||` or reorder would change this.
      apiBody: { data: [{ id: "123", article: { title: "T", plain_text: "   ", text: "real legacy body" } }] },
      synBody: { article: { title: "T", preview_text: "the gist" } },
    });
    const { content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(content).not.toContain("real legacy body");
    expect(content).toContain("the gist");
    expect(content).toContain("Article preview only");
  });

  it("queries recent-search by conversation_id (the proven request, not GET /:id)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: unknown) => {
      const u = String(input);
      calls.push(u);
      if (u.includes("api.twitter.com")) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: "123", article: { title: "E", text: "Body." } }] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await fetchXPostContent("https://x.com/ada/status/123");
    const apiCall = calls.find((u) => u.includes("api.twitter.com"));
    expect(apiCall).toContain("/2/tweets/search/recent");
    expect(decodeURIComponent(apiCall!)).toContain("conversation_id:123");
    expect(decodeURIComponent(apiCall!)).toContain("from:ada");
    expect(apiCall).toContain("tweet.fields=article");
  });

  it("selects the conversation ROOT (matching id), not a reply in the results", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      // recent-search returns the root PLUS a reply that itself carries an article.
      apiBody: {
        data: [
          { id: "999", article: { title: "A REPLY", text: "reply body" } },
          { id: "123", article: { title: "Root Essay", text: "the real body" } },
        ],
      },
      synBody: {},
    });
    const { title, content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(title).toBe("Root Essay");
    expect(content).toContain("the real body");
    expect(content).not.toContain("reply body");
  });

  it("falls back to the first result with an article when no id matches (handle-less URL)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [{ id: "other", text: "no article" }, { id: "x", article: { title: "Found", text: "via fallback" } }] },
      synBody: {},
    });
    const { content } = await fetchXPostContent("https://x.com/i/web/status/123");
    expect(content).toContain("via fallback");
  });

  it("logs LOUD (error) on a 401/403 bad-token, but only warns on a transient 429", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    const err = vi.spyOn(logger, "error").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    mockApi({ apiStatus: 403, synBody: { text: "t", user: { name: "A", screen_name: "a" } } });
    await fetchXPostContent("https://x.com/a/status/1");
    expect(err).toHaveBeenCalledTimes(1); // config defect is loud
    expect(warn).not.toHaveBeenCalled();

    err.mockClear();
    warn.mockClear();
    mockApi({ apiStatus: 429, synBody: { text: "t", user: { name: "A", screen_name: "a" } } });
    await fetchXPostContent("https://x.com/a/status/1");
    expect(warn).toHaveBeenCalledTimes(1); // transient is a warn
    expect(err).not.toHaveBeenCalled();
  });

  it("prefers the full API body over the syndication preview when both exist", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [{ id: "123", article: { title: "Essay", text: "REAL API BODY" } }] },
      synBody: { article: { title: "Essay", preview_text: "STALE TEASER" } },
    });
    const { content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(content).toContain("REAL API BODY");
    expect(content).not.toContain("STALE TEASER");
  });

  it("uses the syndication preview when recent-search returns no results (article older than the window)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [] }, // outside the ~7-day search window
      synBody: { text: "https://t.co/x", user: { name: "A", screen_name: "ada" }, article: { title: "Old Essay", preview_text: "the gist" } },
    });
    const { title, content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(title).toBe("Old Essay");
    expect(content).toContain("the gist");
    expect(content).toContain("preview only"); // honestly labeled as partial
  });

  it("logs WHY an article degraded to the teaser — missing token vs out-of-window", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const article = {
      text: "https://t.co/x",
      user: { name: "A", screen_name: "ada" },
      article: { title: "Essay", preview_text: "the gist" },
    };

    // (a) No token → the actionable missing-token message.
    delete process.env.X_BEARER_TOKEN;
    mockApi({ synBody: article });
    await fetchXPostContent("https://x.com/ada/status/123");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toContain("X_BEARER_TOKEN is not set");

    // (b) Token set but recent-search finds nothing (older than the window) →
    // the window message, NOT the missing-token one.
    warn.mockClear();
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({ apiBody: { data: [] }, synBody: article });
    await fetchXPostContent("https://x.com/ada/status/123");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toContain("recent-search window");
    expect(warn.mock.calls[0][1]).not.toContain("X_BEARER_TOKEN is not set");
  });

  it("rejects a deleted/tombstoned post even if a stale article object lingers (no stub)", async () => {
    delete process.env.X_BEARER_TOKEN; // syndication-only path
    mockApi({
      synBody: {
        tombstone: { text: "This Post was deleted" },
        article: { title: "Ghost", preview_text: "stale cached teaser" },
      },
    });
    await expect(fetchXPostContent("https://x.com/ada/status/123")).rejects.toBeInstanceOf(
      ClientInputError,
    );
  });

  it("falls back to syndication when the post is not an article", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [{ id: "123", text: "no article here" }] }, // no `article` field
      synBody: { text: "just a normal tweet", user: { name: "Ada", screen_name: "ada" } },
    });

    const { content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(content).toContain("just a normal tweet");
    expect(content).not.toContain("X Article");
  });

  it("falls back to syndication on an X API error (e.g. rate limit)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiStatus: 429,
      synBody: { text: "fallback tweet", user: { name: "Ada", screen_name: "ada" } },
    });

    const { content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(content).toContain("fallback tweet");
  });

  it("never calls the X API when no token is configured", async () => {
    delete process.env.X_BEARER_TOKEN;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return { ok: true, status: 200, json: async () => ({ text: "tweet", user: { name: "Ada", screen_name: "ada" } }) };
    }) as unknown as typeof fetch;

    await fetchXPostContent("https://x.com/ada/status/123");
    expect(calls.some((u) => u.includes("api.twitter.com"))).toBe(false);
  });

  it("ingests an article from the syndication preview + cover when the API can't serve it (no token)", async () => {
    delete process.env.X_BEARER_TOKEN; // no API → syndication only
    mockApi({
      synBody: {
        text: "https://t.co/teaser", // the teaser tweet's bare link
        user: { name: "Ada", screen_name: "ada" },
        article: {
          title: "Every Agentic Engineering Hack I Know",
          preview_text: "Three months ago I posted Every Claude Code Hack I Know.",
          cover_media: { media_info: { original_img_url: "https://pbs.twimg.com/cover.jpg" } },
        },
      },
    });

    const { title, content } = await fetchXPostContent("https://x.com/ada/status/123");
    expect(title).toBe("Every Agentic Engineering Hack I Know");
    expect(content).toContain("# Every Agentic Engineering Hack I Know");
    expect(content).toContain("![Every Agentic Engineering Hack I Know](https://pbs.twimg.com/cover.jpg)");
    expect(content).toContain("Three months ago I posted"); // the preview body, not just the link
    expect(content).not.toContain("https://t.co/teaser"); // not the bare-link tweet formatter
  });

  it("omits the byline for an /i/web/status/ article URL (no @handle)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [{ article: { title: "Anon Essay", text: "Body." } }] },
      synBody: {},
    });
    const { content } = await fetchXPostContent("https://x.com/i/web/status/123");
    expect(content).toContain("# Anon Essay");
    expect(content).toContain("Body.");
    expect(content).not.toContain("· X Article"); // no byline line for /i/
  });

  it("renders an article with no image line when there's no cover", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [{ article: { title: "No Cover", text: "Just text." } }] },
      synBody: {}, // no article.cover_media
    });
    const { content } = await fetchXPostContent("https://x.com/ada/status/9");
    expect(content).toContain("# No Cover");
    expect(content).toContain("Just text.");
    expect(content).not.toContain("!["); // no image markdown
  });

  it("falls back to syndication when the article has a title but empty body (no bodyless page)", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      // Title present, body fields empty — the exact shape X now returns. This
      // must NOT build a bodyless title-only page; fall back to syndication
      // content (here a plain tweet) so the page has real content.
      apiBody: { data: [{ article: { title: "Title Only", text: "  " } }] },
      synBody: { text: "SYNDICATION TWEET", user: { name: "Ada", screen_name: "ada" } },
    });
    const { content } = await fetchXPostContent("https://x.com/ada/status/9");
    expect(content).toContain("SYNDICATION TWEET");
    expect(content).not.toContain("# Title Only");
  });

  it("defaults the heading to 'X Article' when the article has body but no title", async () => {
    process.env.X_BEARER_TOKEN = "test-bearer";
    mockApi({
      apiBody: { data: [{ article: { text: "Body without a title." } }] },
      synBody: {},
    });
    const { title, content } = await fetchXPostContent("https://x.com/ada/status/9");
    expect(title).toBe("X Article");
    expect(content).toContain("# X Article");
    expect(content).toContain("Body without a title.");
  });
});
