import { describe, it, expect } from "vitest";
import {
  composeSrcDoc,
  htmlToPlainText,
  stripHtmlFence,
  HTML_SANDBOX,
  HTML_MAX_HEIGHT,
} from "../html";

describe("stripHtmlFence", () => {
  it("strips a wrapping ```html fence", () => {
    expect(stripHtmlFence("```html\n<!doctype html><body>x</body>\n```")).toBe(
      "<!doctype html><body>x</body>",
    );
  });

  it("strips a bare ``` fence", () => {
    expect(stripHtmlFence("```\n<p>x</p>\n```")).toBe("<p>x</p>");
  });

  it("strips an unterminated leading fence (mid-stream)", () => {
    expect(stripHtmlFence("```html\n<!doctype html><body>partial")).toBe(
      "<!doctype html><body>partial",
    );
  });

  it("leaves un-fenced HTML untouched", () => {
    expect(stripHtmlFence("<!doctype html><body>x</body>")).toBe(
      "<!doctype html><body>x</body>",
    );
  });

  it("does NOT strip a trailing ``` when there is no leading fence", () => {
    // Real HTML that happens to end in a fence-like line must survive intact —
    // the trailing strip only fires when the answer is actually fence-wrapped.
    expect(stripHtmlFence("<p>x</p>\n```")).toBe("<p>x</p>\n```");
  });

  it("strips a CRLF-delimited wrapping fence", () => {
    expect(stripHtmlFence("```html\r\n<p>x</p>\r\n```")).toBe("<p>x</p>");
  });

  it("returns empty string for null/empty input", () => {
    expect(stripHtmlFence("")).toBe("");
    expect(stripHtmlFence(null as unknown as string)).toBe("");
  });

  it("composeSrcDoc renders fenced HTML without the fence markers", () => {
    const out = composeSrcDoc("```html\n<html><head></head><body>hi</body></html>\n```");
    expect(out).not.toContain("```");
    expect(out).toContain("hi");
    expect(out).toContain("default-src 'none'");
  });
});

describe("composeSrcDoc", () => {
  it("injects a locked-down CSP (default-src 'none', no connect-src)", () => {
    const out = composeSrcDoc("<!doctype html><html><head></head><body>hi</body></html>");
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(out).toContain("default-src 'none'");
    expect(out).toContain("img-src data:");
    // No network egress is permitted.
    expect(out).not.toContain("connect-src");
  });

  it("adds <base target=\"_blank\"> and a resize reporter", () => {
    const out = composeSrcDoc("<html><head></head><body>x</body></html>");
    expect(out).toContain('<base target="_blank">');
    expect(out).toContain("__wikiHtmlHeight");
    expect(out).toContain("postMessage");
  });

  it("inserts into an existing <head> (full document)", () => {
    const out = composeSrcDoc("<!doctype html><html><head><title>T</title></head><body>b</body></html>");
    // The CSP comes right after <head>, before the existing <title>.
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<title>"));
    expect(out).toContain("<title>T</title>");
  });

  it("adds a <head> when <html> has none", () => {
    const out = composeSrcDoc("<html><body>only body</body></html>");
    expect(out).toContain("<head>");
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("only body");
  });

  it("wraps a bare fragment in a full document", () => {
    const out = composeSrcDoc("<p>just a fragment</p>");
    expect(out.toLowerCase()).toContain("<!doctype html>");
    expect(out).toContain("Content-Security-Policy");
    expect(out).toContain("<p>just a fragment</p>");
  });

  it("injects our restrictive CSP BEFORE a model-supplied relaxing one", () => {
    // A model that emits its own relaxing <meta CSP> can't replace ours: ours is
    // injected first, and per the CSP spec multiple policies combine to the most
    // restrictive (intersection), so `default-src 'none'` still wins.
    const out = composeSrcDoc(
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body>x</body></html>',
    );
    expect(out.indexOf("default-src 'none'")).toBeLessThan(
      out.indexOf("default-src *"),
    );
    // Our <base target="_blank"> is also injected ahead of any model <base>.
    expect(out).toContain('<base target="_blank">');
  });

  it("handles empty / whitespace input (wraps into a valid CSP'd document)", () => {
    for (const input of ["", "   ", "\n"]) {
      const out = composeSrcDoc(input);
      expect(out.toLowerCase()).toContain("<!doctype html>");
      expect(out).toContain("default-src 'none'");
    }
  });

  it("inserts after a <head> with attributes", () => {
    const out = composeSrcDoc("<html><head lang=\"en\"><title>T</title></head><body>b</body></html>");
    expect(out).toContain('<head lang="en">');
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<title>"));
  });

  it("the sandbox never grants same-origin (isolation invariant)", () => {
    // The escape footgun is allow-scripts + allow-same-origin together.
    expect(HTML_SANDBOX).toContain("allow-scripts");
    expect(HTML_SANDBOX).not.toContain("allow-same-origin");
    expect(HTML_MAX_HEIGHT).toBeGreaterThan(0);
  });
});

describe("htmlToPlainText", () => {
  it("drops script/style bodies and tags, decoding entities", () => {
    const html =
      "<style>.x{color:red}</style><h1>Title</h1><script>steal()</script><p>Body &amp; more &lt;tag&gt;</p>";
    const text = htmlToPlainText(html);
    expect(text).toContain("Title");
    expect(text).toContain("Body & more <tag>");
    expect(text).not.toContain("steal()");
    expect(text).not.toContain("color:red");
    expect(text).not.toMatch(/<\/?(h1|p|style|script)/i);
  });

  it("collapses whitespace and trims", () => {
    expect(htmlToPlainText("<div>  a\n\n  b  </div>")).toBe("a b");
  });
});
