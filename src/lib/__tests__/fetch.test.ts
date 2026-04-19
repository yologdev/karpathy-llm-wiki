import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isUrl,
  stripHtml,
  extractTitle,
  extractWithReadability,
  validateUrlSafety,
  fetchUrlContent,
} from "../fetch";
import { MAX_RESPONSE_SIZE } from "../constants";

// ---------------------------------------------------------------------------
// Helpers for mocking fetch
// ---------------------------------------------------------------------------

/** Create a minimal Response-like object that triggers the `response.text()` fallback. */
function mockResponse(
  bodyText: string,
  options: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    ok?: boolean;
  } = {},
): Response {
  const {
    status = 200,
    statusText = "OK",
    headers = {},
    ok = status >= 200 && status < 300,
  } = options;

  return {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    body: null, // triggers the text() fallback path
    text: () => Promise.resolve(bodyText),
    // Needed to satisfy Response type checks at runtime
    url: "",
    type: "basic" as ResponseType,
    redirected: false,
    bodyUsed: false,
    clone: () => ({}) as Response,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Build a simple well-formed article HTML page. */
function articleHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
  <article>
    <h1>${title}</h1>
    ${"<p>" + content + "</p>\n".repeat(5)}
  </article>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// isUrl
// ---------------------------------------------------------------------------

describe("isUrl", () => {
  it("accepts http:// URLs", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("accepts https:// URLs", () => {
    expect(isUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects ftp:// scheme", () => {
    expect(isUrl("ftp://files.example.com")).toBe(false);
  });

  it("rejects mailto: scheme", () => {
    expect(isUrl("mailto:a@b.com")).toBe(false);
  });

  it("rejects relative paths", () => {
    expect(isUrl("/some/path")).toBe(false);
    expect(isUrl("some/path")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUrl("")).toBe(false);
  });

  it("trims whitespace before checking", () => {
    expect(isUrl("  https://example.com  ")).toBe(true);
  });

  it("rejects whitespace-only string", () => {
    expect(isUrl("   ")).toBe(false);
  });

  it("rejects bare domain without scheme", () => {
    expect(isUrl("example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe("stripHtml", () => {
  it("removes <script> elements entirely", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(stripHtml(html)).toBe("Hello World");
  });

  it("removes <style> elements entirely", () => {
    const html = "<style>body { color: red; }</style><p>Visible</p>";
    expect(stripHtml(html)).toBe("Visible");
  });

  it("removes <nav>, <header>, <footer> elements", () => {
    const html =
      "<nav>Menu</nav><header>Head</header><main>Content</main><footer>Foot</footer>";
    expect(stripHtml(html)).toBe("Content");
  });

  it("removes <noscript> elements", () => {
    const html = "<noscript>Enable JS</noscript><p>Content</p>";
    expect(stripHtml(html)).toBe("Content");
  });

  it("strips remaining HTML tags", () => {
    const html = "<div><span>Hello</span> <b>World</b></div>";
    expect(stripHtml(html)).toBe("Hello World");
  });

  it("decodes named HTML entities: &amp;, &lt;, &gt;, &quot;", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot;")).toBe('& < > "');
  });

  it("decodes &mdash;, &ndash;, &hellip;", () => {
    const result = stripHtml("A&mdash;B&ndash;C&hellip;");
    expect(result).toBe("A\u2014B\u2013C\u2026");
  });

  it("decodes &rsquo;, &lsquo;, &rdquo;, &ldquo;", () => {
    const result = stripHtml("&lsquo;Hello&rsquo; &ldquo;World&rdquo;");
    expect(result).toBe("\u2018Hello\u2019 \u201CWorld\u201D");
  });

  it("decodes &trade;, &copy;, &reg;, &bull;, &middot;", () => {
    const result = stripHtml("&trade; &copy; &reg; &bull; &middot;");
    expect(result).toBe("\u2122 \u00A9 \u00AE \u2022 \u00B7");
  });

  it("decodes &#39; (numeric apostrophe) and &nbsp;", () => {
    expect(stripHtml("It&#39;s&nbsp;fine")).toBe("It's fine");
  });

  it("decodes decimal numeric entities (&#123;)", () => {
    expect(stripHtml("&#72;&#101;&#108;&#108;&#111;")).toBe("Hello");
  });

  it("decodes hex numeric entities (&#x1F600;)", () => {
    expect(stripHtml("&#x1F600;")).toBe("😀");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("  Hello   \n\t  World  ")).toBe("Hello World");
  });

  it("handles case-insensitive tag removal", () => {
    const html = "<SCRIPT>evil()</SCRIPT><p>Safe</p>";
    expect(stripHtml(html)).toBe("Safe");
  });
});

// ---------------------------------------------------------------------------
// extractTitle
// ---------------------------------------------------------------------------

describe("extractTitle", () => {
  it("extracts title from simple HTML", () => {
    expect(extractTitle("<title>Hello World</title>")).toBe("Hello World");
  });

  it("extracts title case-insensitively", () => {
    expect(extractTitle("<TITLE>Test</TITLE>")).toBe("Test");
  });

  it("strips inner tags from title", () => {
    expect(extractTitle("<title><b>Bold</b> Title</title>")).toBe(
      "Bold Title",
    );
  });

  it("collapses whitespace in title", () => {
    expect(extractTitle("<title>  Hello   World  </title>")).toBe(
      "Hello World",
    );
  });

  it("returns empty string when no title found", () => {
    expect(extractTitle("<html><body>No title here</body></html>")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractTitle("")).toBe("");
  });

  it("handles title with attributes", () => {
    expect(extractTitle('<title lang="en">Page Title</title>')).toBe(
      "Page Title",
    );
  });

  it("handles multiline title content", () => {
    expect(extractTitle("<title>\n  Multi\n  Line\n</title>")).toBe(
      "Multi Line",
    );
  });
});

// ---------------------------------------------------------------------------
// extractWithReadability
// ---------------------------------------------------------------------------

describe("extractWithReadability", () => {
  it("extracts article content from well-formed HTML", () => {
    const html = articleHtml("Test Article", "This is an important paragraph about testing frameworks and methodologies.");
    const result = extractWithReadability(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Article");
    expect(result!.textContent).toBeTruthy();
    expect(result!.textContent.length).toBeGreaterThan(0);
  });

  it("returns null for empty body", () => {
    const html = "<html><head></head><body></body></html>";
    expect(extractWithReadability(html)).toBeNull();
  });

  it("returns null for minimal non-article HTML", () => {
    const html = "<html><head></head><body>  </body></html>";
    expect(extractWithReadability(html)).toBeNull();
  });

  it("returns trimmed textContent", () => {
    const html = articleHtml("Trim Test", "This is meaningful article content that should be preserved by the readability parser.");
    const result = extractWithReadability(html);
    if (result) {
      expect(result.textContent).toBe(result.textContent.trim());
    }
  });

  it("returns empty string for title when article has no title", () => {
    // Article-like content without a title
    const html = `<html><body><article>${"<p>Paragraph of substantial content for readability extraction testing purposes.</p>\n".repeat(10)}</article></body></html>`;
    const result = extractWithReadability(html);
    // If parsed, title should be a string (possibly empty)
    if (result) {
      expect(typeof result.title).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// validateUrlSafety
// ---------------------------------------------------------------------------

describe("validateUrlSafety", () => {
  // -- Blocked hostnames --
  it("blocks localhost", () => {
    expect(() => validateUrlSafety("http://localhost/foo")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 127.0.0.1", () => {
    expect(() => validateUrlSafety("http://127.0.0.1")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks ::1", () => {
    expect(() => validateUrlSafety("http://[::1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 0.0.0.0", () => {
    expect(() => validateUrlSafety("http://0.0.0.0")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Private IPv4 ranges --
  it("blocks 10.x.x.x (10.0.0.0/8)", () => {
    expect(() => validateUrlSafety("http://10.0.0.1")).toThrow(
      /private\/reserved/,
    );
    expect(() => validateUrlSafety("http://10.255.255.255")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 172.16-31.x.x (172.16.0.0/12)", () => {
    expect(() => validateUrlSafety("http://172.16.0.1")).toThrow(
      /private\/reserved/,
    );
    expect(() => validateUrlSafety("http://172.31.255.255")).toThrow(
      /private\/reserved/,
    );
  });

  it("does not block 172.15.x.x or 172.32.x.x", () => {
    expect(() => validateUrlSafety("http://172.15.0.1")).not.toThrow();
    expect(() => validateUrlSafety("http://172.32.0.1")).not.toThrow();
  });

  it("blocks 192.168.x.x (192.168.0.0/16)", () => {
    expect(() => validateUrlSafety("http://192.168.1.1")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 169.254.x.x (link-local)", () => {
    expect(() => validateUrlSafety("http://169.254.169.254")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Private IPv6 --
  it("blocks fd00:: (unique local address)", () => {
    expect(() => validateUrlSafety("http://[fd00::1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks fe80:: (link-local IPv6)", () => {
    expect(() => validateUrlSafety("http://[fe80::1]")).toThrow(
      /private\/reserved/,
    );
  });

  // -- IPv4-mapped IPv6 --
  it("blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)", () => {
    expect(() => validateUrlSafety("http://[::ffff:127.0.0.1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks ::ffff:7f00:1 (hex-form IPv4-mapped loopback)", () => {
    expect(() => validateUrlSafety("http://[::ffff:7f00:1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks ::ffff:192.168.1.1 (IPv4-mapped private)", () => {
    expect(() => validateUrlSafety("http://[::ffff:192.168.1.1]")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Blocked hostname suffixes --
  it("blocks .local suffix", () => {
    expect(() => validateUrlSafety("http://myhost.local")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks .internal suffix", () => {
    expect(() => validateUrlSafety("http://service.internal")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks .localhost suffix", () => {
    expect(() => validateUrlSafety("http://app.localhost")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Non-HTTP schemes --
  it("blocks ftp:// scheme", () => {
    expect(() => validateUrlSafety("ftp://example.com/file")).toThrow(
      /scheme.*not allowed/,
    );
  });

  it("blocks file:// scheme", () => {
    expect(() => validateUrlSafety("file:///etc/passwd")).toThrow(
      /scheme.*not allowed/,
    );
  });

  it("blocks javascript: scheme", () => {
    expect(() => validateUrlSafety("javascript:alert(1)")).toThrow(
      /not allowed|invalid/i,
    );
  });

  // -- Invalid URL --
  it("throws for invalid URL", () => {
    expect(() => validateUrlSafety("not-a-url")).toThrow(/invalid URL/i);
  });

  // -- Allowed URLs --
  it("allows https://example.com", () => {
    expect(() => validateUrlSafety("https://example.com")).not.toThrow();
  });

  it("allows http://93.184.216.34 (public IP)", () => {
    expect(() => validateUrlSafety("http://93.184.216.34")).not.toThrow();
  });

  it("allows https://subdomain.example.com/path", () => {
    expect(() =>
      validateUrlSafety("https://subdomain.example.com/path?q=1"),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fetchUrlContent
// ---------------------------------------------------------------------------

describe("fetchUrlContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts title and content from HTML response (happy path)", async () => {
    const html = articleHtml("My Page", "This is the main body content of the article about important topics.");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const result = await fetchUrlContent("https://example.com/page");
    expect(result.title).toBeTruthy();
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("rejects unsupported Content-Type (application/pdf)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse("binary data", {
          headers: { "content-type": "application/pdf" },
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com/file.pdf")).rejects.toThrow(
      /Unsupported content type.*pdf/i,
    );
  });

  it("rejects Content-Length exceeding MAX_RESPONSE_SIZE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse("small body", {
          headers: {
            "content-type": "text/html",
            "content-length": String(MAX_RESPONSE_SIZE + 1),
          },
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com")).rejects.toThrow(
      /Content too large/,
    );
  });

  it("follows redirects and returns final content", async () => {
    const html = articleHtml("Redirected Page", "Content after redirect was followed successfully by the fetcher.");
    const mockFetch = vi
      .fn()
      // First call: redirect
      .mockResolvedValueOnce(
        mockResponse("", {
          status: 301,
          statusText: "Moved Permanently",
          ok: false,
          headers: { location: "https://example.com/new-page" },
        }),
      )
      // Second call: final response
      .mockResolvedValueOnce(
        mockResponse(html, {
          headers: { "content-type": "text/html" },
        }),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrlContent("https://example.com/old-page");
    expect(result.title).toBeTruthy();
    expect(result.content).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("blocks redirect to private IP (SSRF protection)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse("", {
          status: 301,
          statusText: "Moved Permanently",
          ok: false,
          headers: { location: "http://127.0.0.1/admin" },
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com")).rejects.toThrow(
      /private\/reserved/,
    );
  });

  it("errors after too many redirects", async () => {
    const redirectResponse = mockResponse("", {
      status: 301,
      statusText: "Moved Permanently",
      ok: false,
      headers: { location: "https://example.com/loop" },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(redirectResponse),
    );

    await expect(fetchUrlContent("https://example.com/start")).rejects.toThrow(
      /Too many redirects/,
    );
  });

  it("passes through plain text without HTML parsing", async () => {
    const plainText = "This is raw plain text content, not HTML.";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(plainText, {
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    const result = await fetchUrlContent("https://example.com/file.txt");
    expect(result.content).toBe(plainText);
    expect(result.title).toBe("example.com");
  });

  it("throws on non-ok status (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse("Not Found", {
          status: 404,
          statusText: "Not Found",
          ok: false,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com/missing")).rejects.toThrow(
      /Failed to fetch URL.*404/,
    );
  });

  it("throws when no content can be extracted from empty HTML body", async () => {
    // HTML with only whitespace in body — stripHtml yields empty string after trim
    const emptyHtml = "<html><head><title>  </title></head><body>  \n  </body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(emptyHtml, {
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com/empty")).rejects.toThrow(
      /No text content/,
    );
  });

  it("rejects image content types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse("binary", {
          headers: { "content-type": "image/png" },
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com/image.png")).rejects.toThrow(
      /Unsupported content type/,
    );
  });

  it("handles redirect without Location header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse("", {
          status: 301,
          statusText: "Moved Permanently",
          ok: false,
          headers: {},
        }),
      ),
    );

    await expect(fetchUrlContent("https://example.com")).rejects.toThrow(
      /without Location header/,
    );
  });

  it("uses hostname as title when no <title> in HTML and Readability fails", async () => {
    // Minimal HTML that Readability won't parse as article but has some text
    const html = "<html><body><div>Some text content here</div></body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(html, {
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await fetchUrlContent("https://example.com/page");
    expect(result.title).toBe("example.com");
  });

  it("passes correct headers in the fetch request", async () => {
    const html = articleHtml("Test", "Content for verifying fetch request headers are passed correctly.");
    const mockFetch = vi.fn().mockResolvedValue(
      mockResponse(html, {
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await fetchUrlContent("https://example.com");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "llm-wiki/1.0",
        }),
        redirect: "manual",
      }),
    );
  });

  it("handles streaming body and enforces size limit", async () => {
    const chunk = new TextEncoder().encode("x".repeat(100));

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: chunk })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn(),
    };

    const streamResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
      body: { getReader: () => mockReader },
      text: () => Promise.resolve(""),
      url: "",
      type: "basic" as ResponseType,
      redirected: false,
      bodyUsed: false,
      clone: () => ({}) as Response,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as unknown as Response;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse));

    const result = await fetchUrlContent("https://example.com/stream.txt");
    expect(result.content).toBe("x".repeat(100));
  });

  it("cancels streaming body when it exceeds MAX_RESPONSE_SIZE", async () => {
    // Create a chunk that exceeds MAX_RESPONSE_SIZE
    const bigChunk = new TextEncoder().encode("x".repeat(MAX_RESPONSE_SIZE + 1));

    const mockCancel = vi.fn();
    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: bigChunk }),
      cancel: mockCancel,
    };

    const streamResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain" }),
      body: { getReader: () => mockReader },
      text: () => Promise.resolve(""),
      url: "",
      type: "basic" as ResponseType,
      redirected: false,
      bodyUsed: false,
      clone: () => ({}) as Response,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      bytes: () => Promise.resolve(new Uint8Array()),
    } as unknown as Response;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse));

    await expect(fetchUrlContent("https://example.com/big.txt")).rejects.toThrow(
      /Content too large/,
    );
    expect(mockCancel).toHaveBeenCalled();
  });

  it("handles 302 redirect status", async () => {
    const html = articleHtml("Found Page", "Content after a 302 temporary redirect was followed successfully.");
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse("", {
          status: 302,
          statusText: "Found",
          ok: false,
          headers: { location: "https://example.com/found" },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse(html, {
          headers: { "content-type": "text/html" },
        }),
      );

    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchUrlContent("https://example.com/temp");
    expect(result.title).toBeTruthy();
    expect(result.content).toBeTruthy();
  });

  it("handles text/markdown content type", async () => {
    const markdown = "# Hello\n\nSome **markdown** content here.";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(markdown, {
          headers: { "content-type": "text/markdown" },
        }),
      ),
    );

    const result = await fetchUrlContent("https://example.com/doc.md");
    expect(result.content).toBe(markdown);
    expect(result.title).toBe("example.com");
  });

  it("validates the initial URL against SSRF before fetching", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      fetchUrlContent("http://192.168.1.1/admin"),
    ).rejects.toThrow(/private\/reserved/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles content-type with charset parameter", async () => {
    const html = articleHtml("Charset Test", "Testing that charset parameter in content type header is handled correctly.");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const result = await fetchUrlContent("https://example.com/page");
    expect(result.title).toBeTruthy();
    expect(result.content).toBeTruthy();
  });
});
