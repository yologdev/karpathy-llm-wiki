import { describe, it, expect } from "vitest";
import {
  composeSrcDoc,
  htmlToPlainText,
  stripHtmlFence,
  usesChartLib,
  usesViewportUnits,
  isHtmlDeck,
  HTML_SANDBOX,
  HTML_MAX_HEIGHT,
} from "../html";
import { CHARTJS_VERSION, CHARTJS_SOURCE } from "../vendor/chartjs.generated";

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
    // The reporter must observe document.body (not just documentElement, whose
    // box is pinned to the iframe height) so late reflow grows the frame.
    expect(out).toContain("document.body");
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

  it("hides the document scrollbar only when hideScrollbar is set (full-screen share)", () => {
    const bare = composeSrcDoc("<p>x</p>", undefined, true);
    const normal = composeSrcDoc("<p>x</p>");
    expect(bare).toContain("scrollbar-width:none");
    expect(bare).toContain("::-webkit-scrollbar");
    expect(normal).not.toContain("scrollbar-width:none");
  });

  it("injects the editorial baseline style + tab controller", () => {
    const out = composeSrcDoc("<p>plain answer</p>");
    // A predefined component class and the brand accent token are present.
    expect(out).toContain(".callout");
    expect(out).toContain("--accent");
    // The delegated tab controller ships so `.tabs` markup works.
    expect(out).toContain("data-tab");
  });

  it("centers document-style content in a column of the shared --measure", () => {
    const out = composeSrcDoc("<p>a blog-post style answer</p>");
    // The shared measure token is defined, and the body is capped + centered to
    // it — so even un-wrapped content (no <main>/.doc) sits in a column whose
    // edges match the full-width yoyo illustrations.
    expect(out).toContain("--measure:50rem");
    // The cap is plain `body{}` (overridable); the centering is `html body{}`
    // (0,0,2) so a model `margin:0` reset can't cancel it.
    expect(out).toContain("body{max-width:var(--measure)}");
    expect(out).toContain("html body{margin-inline:auto}");
    // All three consumers share the token: the body column, the wrapper, and
    // the illustration figure — so they align whether or not content is wrapped.
    expect(out).toContain(".doc,main,article{max-width:var(--measure)");
    expect(out).toContain("figure.yoyo-illustration{max-width:var(--measure)");
  });

  it("keeps the body-column CAP overridable by the model (plain `body` specificity)", () => {
    const out = composeSrcDoc(
      "<html><head><style>body{max-width:1200px}</style></head><body><p>x</p></body></html>",
    );
    // The injected `body{max-width}` is plain `body{}` and precedes the model's
    // style, so the model's later `body{max-width:1200px}` wins (last on equal
    // specificity) — a model can still widen its column.
    expect(
      out.indexOf("body{max-width:var(--measure)}"),
    ).toBeLessThan(out.indexOf("body{max-width:1200px}"));
  });

  it("centering survives a model `body{margin:0}` reset (the bug that pinned content left)", () => {
    const out = composeSrcDoc(
      "<html><head><style>body{margin:0}</style></head><body><div class='container'><p>x</p></div></body></html>",
    );
    // `html body{margin-inline:auto}` (0,0,2) beats the model's `body{margin:0}`
    // (0,0,1) regardless of source order, so the column still centers.
    expect(out).toContain("html body{margin-inline:auto}");
  });

  it("deck mode injects the slide runtime and skips the centered article column", () => {
    const out = composeSrcDoc(
      '<section class="slide"><h1>X</h1></section>',
      undefined,
      true,
      undefined,
      true,
    );
    expect(out).toContain(".slide.active{display:flex!important}"); // deck CSS
    expect(out).toContain("ArrowRight"); // deck nav script
    expect(out).not.toContain("body{max-width:var(--measure)}"); // no article column
    // Non-deck doc gets neither the deck runtime.
    const plain = composeSrcDoc("<p>x</p>");
    expect(plain).not.toContain(".slide.active");
  });

  it("deck layout uses !important so a model's own .slide CSS can't stack slides", () => {
    // A model that redefines `.slide{display:flex}` would otherwise win at equal
    // specificity (its <style> is injected after ours), showing every slide at once.
    const modelSlide = ".slide{display:flex;min-height:80vh}";
    const out = composeSrcDoc(
      `<head><style>${modelSlide}</style></head>` +
        '<section class="slide"><h1>A</h1></section>',
      undefined,
      false,
      undefined,
      true,
    );
    // The make-or-break props are !important ON the .slide selector itself
    // (not just present somewhere — `display:none!important` also appears on the
    // yoyo ::before/::after rule).
    expect(out).toMatch(
      /\.slide\{position:absolute!important;inset:0!important;display:none!important;/,
    );
    expect(out).toContain(".slide.active{display:flex!important}");
    // The whole premise: our baseline .slide rule must precede the model's, so
    // !important (not source order) is what wins. Assert the source ordering the
    // fix depends on.
    expect(out.indexOf(".slide{position:absolute!important")).toBeLessThan(
      out.indexOf(modelSlide),
    );
  });

  it("neutralizes model-authored ::before/::after art on the yoyo figure", () => {
    // The yoyo illustration is a baked <img>; some models layer emoji/CSS art via
    // pseudo-elements. The baseline kills those (with !important) on both decks and
    // articles, so only the real generated image shows.
    for (const deck of [true, false]) {
      const out = composeSrcDoc("<p>x</p>", undefined, false, undefined, deck);
      expect(out).toContain(
        "figure.yoyo-illustration::before,figure.yoyo-illustration::after{content:none!important",
      );
    }
  });

  it("forces the resolved app theme (overrides the OS prefers-color-scheme default)", () => {
    const dark = composeSrcDoc("<p>x</p>", undefined, false, "dark");
    expect(dark).toContain(`:root{color-scheme:dark;--paper:#14130f`);
    const light = composeSrcDoc("<p>x</p>", undefined, false, "light");
    expect(light).toContain(`:root{color-scheme:light;--paper:#fbfaf6`);
    // No theme → no override (the media-query default governs).
    const none = composeSrcDoc("<p>x</p>");
    expect(none).not.toContain("color-scheme:dark;--paper");
    expect(none).not.toContain("color-scheme:light;--paper");
  });

  it("applies the theme override to app-style (viewport) docs too — not just the centered column", () => {
    // themeOverride is independent of usesViewportUnits: a full-screen (100vh)
    // dark artifact must still get dark paper, even though it gets NO body cap.
    // Also exercises the real share path: hideScrollbar=true + a resolved theme.
    const out = composeSrcDoc("<div style='height:100vh'>app</div>", undefined, true, "dark");
    expect(out).toContain(`:root{color-scheme:dark;--paper:#14130f`);
    expect(out).not.toContain("body{max-width:var(--measure)"); // no column for app-style
    expect(out).toContain("scrollbar-width:none"); // hideScrollbar still applied
  });

  it("injects the theme override AFTER BASE_STYLE so its :root wins the source-order tie", () => {
    const out = composeSrcDoc("<p>x</p>", undefined, false, "dark");
    // Both :root rules have equal specificity (media queries add none), so the
    // override only wins by coming later. Guards a refactor that reorders them.
    expect(out.indexOf(":root{color-scheme:dark;--paper")).toBeGreaterThan(
      out.indexOf(":root{color-scheme:light dark"),
    );
  });

  it("leaves app-style (viewport-unit) layouts full-bleed — no body column cap", () => {
    const out = composeSrcDoc("<div style='height:100vh'>full-screen app</div>");
    // App-style docs define their own full-screen width; don't impose a column.
    expect(out).not.toContain("body{max-width:var(--measure)");
    // The shared token + illustration cap still ship (harmless, and bound any
    // illustration an app-style doc happens to use).
    expect(out).toContain("--measure:50rem");
  });

  it("still centers a document that inlines base64 illustrations (data: URI isn't app-style)", () => {
    // Regression: a baked illustration's base64 payload contains vh-like runs
    // that must NOT flip the doc to app-style and skip the centered column.
    const out = composeSrcDoc(
      '<main><p>article</p><figure class="yoyo-illustration">' +
        '<img src="data:image/jpeg;base64,/9j/4AAQ/100vh/SkZJRg=="></figure></main>',
    );
    expect(out).toContain("body{max-width:var(--measure)}");
    expect(out).toContain("html body{margin-inline:auto}");
  });
});

describe("Chart.js injection", () => {
  it("usesViewportUnits detects 100vh/dvh app-style layouts", () => {
    expect(usesViewportUnits("<div style='height:100vh'></div>")).toBe(true);
    expect(usesViewportUnits("<style>.h{min-height:100dvh}</style>")).toBe(true);
    expect(usesViewportUnits("<p>just prose, padding: 12px</p>")).toBe(false);
  });

  it("usesViewportUnits ignores vh-like runs inside inlined data: URIs", () => {
    // A baked illustration's base64 contains digit-led vh runs at /,+ bounds
    // (e.g. the real payload fragment "/7VH/"); those must NOT read as app-style.
    expect(
      usesViewportUnits(
        '<img src="data:image/jpeg;base64,/9j/4AAQ/100vh/SkZJRg==">',
      ),
    ).toBe(false);
    // The url(data:…) background form is stripped at its ")" terminator too.
    expect(
      usesViewportUnits(
        '<div style="background:url(data:image/svg+xml;base64,Zm9v/100vh)"></div>',
      ),
    ).toBe(false);
    // …but a genuine viewport unit in CSS still counts, even alongside an image.
    expect(
      usesViewportUnits(
        '<style>.hero{height:100vh}</style><img src="data:image/png;base64,iVBOR100vh">',
      ),
    ).toBe(true);
  });

  it("drops cross-reference markdown leaked after </html>", () => {
    const leaked =
      "<!doctype html><html><body><h1>Art</h1></body></html>\n\n## Related\n\n- [Other](other.md)\n";
    const out = composeSrcDoc(leaked);
    expect(out).not.toContain("## Related");
    expect(out).not.toContain("other.md");
    expect(out).toContain("<h1>Art</h1>");
  });

  it("truncates at the LAST </html> so a doc quoting </html> as text survives", () => {
    const doc =
      "<!doctype html><html><body><pre>close with &lt;/html&gt; then</pre><p>tail content</p></body></html>\n\n## Related\n\n- [x](x.md)";
    const out = composeSrcDoc(doc);
    expect(out).not.toContain("## Related");
    // The real document (including the part after a text-mentioned tag) is kept.
    expect(out).toContain("tail content");
  });

  it("usesChartLib detects a new Chart(...) call", () => {
    expect(usesChartLib("<canvas></canvas><script>new Chart(el,{})</script>")).toBe(true);
    expect(usesChartLib("<script>const x = new  Chart( a )</script>")).toBe(true);
    expect(usesChartLib("<p>no charts here</p>")).toBe(false);
  });

  it("usesChartLib also detects Chart.register / Chart.defaults usage", () => {
    // Plugin registration / global config without a literal `new Chart(` must
    // still pull the library, or the chart silently fails to render.
    expect(usesChartLib("<script>Chart.register(BarController)</script>")).toBe(true);
    expect(usesChartLib("<script>Chart.defaults.font.size=14</script>")).toBe(true);
    // A near-miss that should NOT trip detection.
    expect(usesChartLib("<p>The Chart.io product is unrelated.</p>")).toBe(false);
  });

  it("never trips detection on its own injected runtime (no self-injection)", () => {
    // composeSrcDoc always injects BASE_SCRIPT (resize + tabs); even with a
    // source supplied, a chartless doc must not pull the library.
    const out = composeSrcDoc("<p>prose only</p>", CHARTJS_SOURCE);
    expect(out).not.toContain("Chart.js v");
  });

  it("inlines the supplied Chart.js source ONLY when the document uses it", () => {
    const chartDoc =
      "<body><canvas id='c'></canvas><script>new Chart(document.getElementById('c'),{type:'bar',data:{}})</script></body>";
    const withChart = composeSrcDoc(chartDoc, CHARTJS_SOURCE);
    const without = composeSrcDoc("<body><p>just prose, no chart</p></body>", CHARTJS_SOURCE);
    // The library (identified by its version banner) is present only when used.
    expect(withChart).toContain(`Chart.js v${CHARTJS_VERSION}`);
    expect(without).not.toContain("Chart.js v");
    // ...and its absence keeps the chartless document dramatically smaller.
    expect(without.length).toBeLessThan(withChart.length - 100_000);
  });

  it("never injects Chart.js when no source is supplied (lazy-load contract)", () => {
    // HtmlPreview composes immediately (no lib) and re-composes once the lazy
    // import resolves; without a source, a chart doc must compose lib-free.
    const out = composeSrcDoc(
      "<body><canvas id='c'></canvas><script>new Chart(c,{})</script></body>",
    );
    expect(out).not.toContain("Chart.js v");
  });

  it("injects the library into an existing <head>, exactly once, before </head>", () => {
    const doc =
      "<!doctype html><html><head><title>T</title></head><body><canvas id='c'></canvas><script>new Chart(c,{})</script></body></html>";
    const out = composeSrcDoc(doc, CHARTJS_SOURCE);
    const banner = `Chart.js v${CHARTJS_VERSION}`;
    const first = out.indexOf(banner);
    expect(first).toBeGreaterThanOrEqual(0);
    // The library lands inside <head> (before the head closes), and only once.
    expect(first).toBeLessThan(out.indexOf("</head>"));
    expect(out.indexOf(banner, first + 1)).toBe(-1);
  });

  it("keeps the locked-down CSP even with the library inlined (no network for charts)", () => {
    const out = composeSrcDoc(
      "<body><canvas id='c'></canvas><script>new Chart(c,{})</script></body>",
      CHARTJS_SOURCE,
    );
    expect(out).toContain("default-src 'none'");
    expect(out).not.toContain("connect-src");
    // The library is inline (no external script tag / CDN).
    expect(out).not.toMatch(/<script[^>]+src=/i);
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

describe("isHtmlDeck", () => {
  it("detects an HTML deck by its slide section marker", () => {
    expect(
      isHtmlDeck('<!doctype html><html><body><section class="slide"><h1>A</h1></section></body></html>'),
    ).toBe(true);
  });

  it("matches regardless of attribute order, quoting, or extra classes", () => {
    expect(isHtmlDeck("<section data-i='1' class='intro slide active'>")).toBe(true);
    expect(isHtmlDeck('<SECTION CLASS="slide">')).toBe(true);
  });

  it("does not match a substring class like 'slides' or 'slider'", () => {
    expect(isHtmlDeck('<section class="slides">')).toBe(false);
    expect(isHtmlDeck('<section class="slider-track">')).toBe(false);
  });

  it("does not match a legacy Marp deck (frontmatter, no slide section)", () => {
    expect(isHtmlDeck("---\nmarp: true\n---\n\n# Title\n\n---\n\n## Next")).toBe(false);
  });

  it("does not match a plain HTML artifact (no slide section)", () => {
    expect(
      isHtmlDeck("<!doctype html><html><body><h1>Article</h1><p>Prose.</p></body></html>"),
    ).toBe(false);
  });

  it("does not match plain markdown prose or empty input", () => {
    expect(isHtmlDeck("# Heading\n\nSome **markdown** body.")).toBe(false);
    expect(isHtmlDeck("")).toBe(false);
  });
});
