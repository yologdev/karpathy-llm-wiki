import { describe, it, expect } from "vitest";
import {
  composeSrcDoc,
  htmlToPlainText,
  HTML_SANDBOX,
  HTML_MAX_HEIGHT,
} from "../html";

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
