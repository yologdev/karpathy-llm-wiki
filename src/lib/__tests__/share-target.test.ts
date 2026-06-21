import { describe, it, expect } from "vitest";
import { resolveSharedUrl, buildBookmarklet } from "../share-target";
import manifest from "@/app/manifest";

describe("resolveSharedUrl", () => {
  it("prefers an explicit url param", () => {
    expect(resolveSharedUrl("https://example.com/a", "ignored")).toBe(
      "https://example.com/a",
    );
  });

  it("trims surrounding whitespace on the url param", () => {
    expect(resolveSharedUrl("  https://example.com/a  ")).toBe("https://example.com/a");
  });

  it("falls back to the first http(s) link in text (Web Share Target quirk)", () => {
    expect(
      resolveSharedUrl(undefined, "Great read: https://example.com/post via @x"),
    ).toBe("https://example.com/post");
  });

  it("ignores a non-http url param and recovers from text", () => {
    expect(resolveSharedUrl("not-a-url", "see https://example.com/x")).toBe(
      "https://example.com/x",
    );
  });

  it("returns null when neither carries a url", () => {
    expect(resolveSharedUrl("", "no link here")).toBeNull();
    expect(resolveSharedUrl(null, null)).toBeNull();
  });
});

describe("buildBookmarklet", () => {
  it("opens the given origin's /save with the encoded current url + title", () => {
    const bm = buildBookmarklet("https://yopedia.yolog.dev");
    expect(bm.startsWith("javascript:")).toBe(true);
    expect(bm).toContain("https://yopedia.yolog.dev/save?url=");
    expect(bm).toContain("encodeURIComponent(location.href)");
    expect(bm).toContain("encodeURIComponent(document.title)");
    expect(bm).toContain("window.open(");
  });

  it("strips a trailing slash from the origin (no double slash before /save)", () => {
    expect(buildBookmarklet("https://yopedia.yolog.dev/")).toContain(
      "https://yopedia.yolog.dev/save?url=",
    );
  });
});

describe("PWA manifest share target", () => {
  it("registers /save as a GET share target so the OS share sheet sends links there", () => {
    // share_target isn't in Next's Manifest TS type yet, but it IS emitted at
    // runtime — assert the shape so a refactor can't silently drop the surface.
    const m = manifest() as unknown as {
      share_target?: { action: string; method: string; params: Record<string, string> };
    };
    expect(m.share_target?.action).toBe("/save");
    expect(m.share_target?.method).toBe("GET");
    expect(m.share_target?.params.url).toBe("url");
    expect(m.share_target?.params.text).toBe("text");
  });
});
