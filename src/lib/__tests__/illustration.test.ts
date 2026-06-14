import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  _internal,
  generateYoyoIllustration,
  generateYoyoIllustrationDataUri,
  bakeYoyoIllustrations,
} from "../illustration";
import { getStorage, _resetStorage } from "../storage";
import { rawRelPath } from "../wiki";
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

describe("generateYoyoIllustration (R2 asset cache)", () => {
  let tmpDir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "illustration-"));
    for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR", "XAI_API_KEY"]) {
      saved[k] = process.env[k];
    }
    process.env.DATA_DIR = tmpDir;
    process.env.WIKI_DIR = path.join(tmpDir, "wiki");
    process.env.RAW_DIR = path.join(tmpDir, "raw");
    process.env.XAI_API_KEY = "test-key";
    _resetStorage(); // re-root storage at this test's fresh tmpDir
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks(); // restore any storage spies (write-failure test)
    for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR", "XAI_API_KEY"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    _resetStorage();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // Stub Grok's image-edits endpoint to return a tiny jpeg (base64 "QUJD" =
  // bytes "ABC"). Returns a counter so a test can assert how often Grok was hit.
  function stubGrok(): () => number {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    return () => calls;
  }

  it("generates on a miss, stores the asset in R2, returns its /api/assets URL", async () => {
    const grokCalls = stubGrok();
    const url = await generateYoyoIllustration("yoyo sorting boxes", "English");

    const key = _internal.cacheKeyFor("yoyo sorting boxes", "English");
    expect(url).toBe(`/api/assets/illustrations/${key}.jpg`);
    expect(grokCalls()).toBe(1);

    // The bytes ("ABC") landed at the raw asset path the /api/assets route serves.
    const stored = await getStorage().readAsset(
      rawRelPath(`assets/illustrations/${key}.jpg`),
    );
    expect(new Uint8Array(stored)).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
  });

  it("is a cache hit on a repeat scene — no second Grok call", async () => {
    const grokCalls = stubGrok();
    const a = await generateYoyoIllustration("same scene");
    const b = await generateYoyoIllustration("same scene");
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    // The second call short-circuits on the asset's existence (stat), not Grok.
    expect(grokCalls()).toBe(1);
  });

  it("returns null when XAI_API_KEY is unset and the scene isn't cached", async () => {
    delete process.env.XAI_API_KEY;
    expect(await generateYoyoIllustration("unkeyed scene")).toBeNull();
  });

  it("data-URI variant inlines the stored bytes (for the sandboxed HTML iframe)", async () => {
    stubGrok();
    const dataUri = await generateYoyoIllustrationDataUri("html scene");
    // bytes "ABC" re-encoded back to base64 "QUJD".
    expect(dataUri).toBe("data:image/jpeg;base64,QUJD");
  });

  it("data-URI variant is a cache hit on a repeat scene — no second Grok call", async () => {
    const grokCalls = stubGrok();
    const a = await generateYoyoIllustrationDataUri("repeat html scene");
    const b = await generateYoyoIllustrationDataUri("repeat html scene");
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    // Same stat short-circuit as the URL path — the HTML view never re-hits Grok.
    expect(grokCalls()).toBe(1);
  });

  it("returns null when storing the asset fails (drops it rather than referencing a 404)", async () => {
    stubGrok();
    vi.spyOn(getStorage(), "writeAsset").mockRejectedValueOnce(
      new Error("disk full"),
    );
    expect(await generateYoyoIllustration("write-fail scene")).toBeNull();
  });

  it("bakeYoyoIllustrations pairs each format with the right reference (HTML→data URI, slides→/api/assets URL)", async () => {
    // The load-bearing CSP invariant: HTML (sandboxed, opaque origin) must get a
    // self-contained data: URI, while slides (main document) get the asset URL.
    // A future swap of the two fetchers would ship broken iframe images — lock it.
    stubGrok();

    const html = await bakeYoyoIllustrations(
      '<figure class="yoyo-illustration" data-scene="a robot"></figure>',
      true,
    );
    expect(html).toContain('<img src="data:image/jpeg;base64,QUJD"');
    expect(html).not.toContain("/api/assets");

    const md = await bakeYoyoIllustrations(
      "```yoyo-illustration\na fish\n```",
      false,
    );
    const key = _internal.cacheKeyFor("a fish", "English");
    expect(md).toBe(`![a fish](/api/assets/illustrations/${key}.jpg)`);
    expect(md).not.toContain("data:");
  });
});
