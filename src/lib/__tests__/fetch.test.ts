import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isUrl,
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

// ---------------------------------------------------------------------------
// downloadImages
// ---------------------------------------------------------------------------

import { downloadImages } from "../fetch";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("downloadImages", () => {
  let tmpDir: string;

  async function setup(): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fetch-test-"));
    return tmpDir;
  }

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rewrites absolute image URLs to local paths", async () => {
    const rawDir = await setup();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const md = "Some text\n![Photo](https://example.com/photo.png)\nMore text";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toContain("![Photo](assets/test-page/photo.png)");
    expect(result).not.toContain("https://example.com/photo.png");

    // Verify file was written
    const filePath = path.join(rawDir, "assets", "test-page", "photo.png");
    const stat = await fs.stat(filePath);
    expect(stat.size).toBe(pngBytes.length);
  });

  it("skips data URIs", async () => {
    const rawDir = await setup();

    const md = "![Icon](data:image/png;base64,iVBOR...)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toBe(md); // unchanged
  });

  it("skips relative paths", async () => {
    const rawDir = await setup();

    const md = "![Local](images/photo.png)\n![Root](/assets/img.jpg)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toBe(md); // unchanged
  });

  it("handles download failures gracefully (keeps original URL)", async () => {
    const rawDir = await setup();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const md = "![Broken](https://example.com/broken.png)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toBe(md); // original URL preserved
  });

  it("keeps original URL on non-200 status", async () => {
    const rawDir = await setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/html" },
      }),
    );

    const md = "![Missing](https://example.com/missing.png)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toBe(md);
  });

  it("keeps original URL for non-image content-type", async () => {
    const rawDir = await setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html>page</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const md = "![Page](https://example.com/page.png)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toBe(md);
  });

  it("limits to 20 images max", async () => {
    const rawDir = await setup();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    // Create markdown with 25 images
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) {
      lines.push(`![img${i}](https://example.com/img${i}.png)`);
    }
    const md = lines.join("\n");

    const mockFetch = vi.spyOn(globalThis, "fetch");
    // Each call returns a valid image
    for (let i = 0; i < 20; i++) {
      mockFetch.mockResolvedValueOnce(
        new Response(pngBytes, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    }

    const result = await downloadImages(md, "test-page", rawDir);

    // Only 20 fetch calls should have been made
    expect(mockFetch).toHaveBeenCalledTimes(20);

    // First 20 should be rewritten, last 5 should still be original URLs
    for (let i = 0; i < 20; i++) {
      expect(result).toContain(`assets/test-page/img${i}.png`);
    }
    for (let i = 20; i < 25; i++) {
      expect(result).toContain(`https://example.com/img${i}.png`);
    }
  });

  it("sanitizes filenames — strips query params", async () => {
    const rawDir = await setup();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const md = "![Q](https://example.com/photo.png?width=200&format=webp)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toContain("assets/test-page/photo.png");
    expect(result).not.toContain("?");
  });

  it("sanitizes filenames — prevents path traversal", async () => {
    const rawDir = await setup();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const md = "![Evil](https://example.com/../../etc/passwd.png)";
    const result = await downloadImages(md, "test-page", rawDir);

    // Should not contain path traversal
    expect(result).not.toContain("..");
    expect(result).toContain("assets/test-page/");
  });

  it("deduplicates filenames with counter suffix", async () => {
    const rawDir = await setup();
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const mockFetch = vi.spyOn(globalThis, "fetch");
    mockFetch.mockResolvedValueOnce(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(pngBytes, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const md = "![A](https://example.com/photo.png)\n![B](https://cdn.example.com/photo.png)";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toContain("assets/test-page/photo.png");
    expect(result).toContain("assets/test-page/photo-1.png");
  });

  it("returns markdown unchanged when no images present", async () => {
    const rawDir = await setup();

    const md = "Just some text with [a link](https://example.com) but no images.";
    const result = await downloadImages(md, "test-page", rawDir);

    expect(result).toBe(md);
  });
});
