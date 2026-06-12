import { describe, it, expect, vi, afterEach } from "vitest";
import { _internal } from "../illustration";
import { SLIDES_FORMAT_INSTRUCTION, HTML_FORMAT_INSTRUCTION } from "../query";

describe("buildIllustrationPrompt", () => {
  it("embeds the brand DNA and the scene/language", () => {
    const p = _internal.buildIllustrationPrompt("yoyo sorting boxes", "中文");
    expect(p).toContain("yoyo");
    expect(p).toContain("#B3A7F0"); // the brand purple
    expect(p).toContain("16:9");
    expect(p).toContain("yoyo sorting boxes");
    expect(p).toContain("中文");
  });
});

describe("cacheKeyFor", () => {
  it("is stable and sensitive to scene + language", () => {
    const a = _internal.cacheKeyFor("scene", "English");
    expect(_internal.cacheKeyFor("scene", "English")).toBe(a);
    expect(_internal.cacheKeyFor("other", "English")).not.toBe(a);
    expect(_internal.cacheKeyFor("scene", "中文")).not.toBe(a);
  });
});

describe("format instructions", () => {
  it("slides + html offer the yoyo-illustration directive", () => {
    expect(SLIDES_FORMAT_INSTRUCTION).toContain("yoyo-illustration");
    expect(HTML_FORMAT_INSTRUCTION).toContain("yoyo-illustration");
    // HTML uses the figure convention the renderer keys on.
    expect(HTML_FORMAT_INSTRUCTION).toContain('class="yoyo-illustration"');
  });

  it("reliably requests an illustration (not just 'sparingly/may')", () => {
    // Regression: the old phrasing ("you MAY ... most slides need none") made the
    // model emit zero illustrations, so the feature never appeared.
    expect(SLIDES_FORMAT_INSTRUCTION).toMatch(/exactly one|at least one/i);
    expect(HTML_FORMAT_INSTRUCTION).toMatch(/at least one|exactly one|include one/i);
  });
});

describe("callGrok request format", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts JSON (not multipart) with the reference image as a data-URI image_url", async () => {
    // Regression: xAI's /v1/images/edits rejects multipart FormData (the
    // OpenAI-SDK shape) — it must be application/json with image:{type,url}.
    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({ data: [{ b64_json: "QUJD" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const out = await _internal.callGrok("draw yoyo", "test-key");

    expect(out).toBe("data:image/jpeg;base64,QUJD");
    expect(captured).not.toBeNull();
    const { url, init } = captured!;
    expect(url).toBe("https://api.x.ai/v1/images/edits");
    expect(init.method).toBe("POST");
    // JSON, not FormData.
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(init.body).toBeTypeOf("string");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("grok-imagine-image-quality");
    expect(body.prompt).toBe("draw yoyo");
    expect(body.image.type).toBe("image_url");
    expect(body.image.url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null and does not throw on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("bad request", { status: 400 }),
    );
    await expect(_internal.callGrok("x", "k")).resolves.toBeNull();
  });
});
