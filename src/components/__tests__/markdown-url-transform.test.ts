import { describe, it, expect } from "vitest";
import { urlTransform } from "@/components/MarkdownRenderer";

// react-markdown's default urlTransform strips `data:` URIs (XSS guard). We
// allow RASTER image data URIs through so baked yoyo-illustrations render, while
// still blocking script-capable ones (svg, text/html) and other schemes.
describe("urlTransform", () => {
  it("passes raster image data URIs through unchanged", () => {
    for (const mime of ["jpeg", "jpg", "png", "gif", "webp"]) {
      const url = `data:image/${mime};base64,AAAA`;
      expect(urlTransform(url)).toBe(url);
    }
  });

  it("allows the `data:image/jpeg,...` form (comma without params)", () => {
    const url = "data:image/png,AAAA";
    expect(urlTransform(url)).toBe(url);
  });

  it("strips a script-capable data:image/svg+xml URI", () => {
    // svg can carry <script>; must NOT be allowed through.
    expect(urlTransform("data:image/svg+xml;base64,PHN2Zz4=")).toBe("");
  });

  it("strips a data:text/html URI", () => {
    expect(urlTransform("data:text/html;base64,PHNjcmlwdD4=")).toBe("");
  });

  it("leaves normal http(s)/relative URLs intact (default behavior)", () => {
    expect(urlTransform("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(urlTransform("/api/assets/x/y.png")).toBe("/api/assets/x/y.png");
  });

  it("strips a javascript: URL (default sanitizer still applies)", () => {
    expect(urlTransform("javascript:alert(1)")).toBe("");
  });
});
