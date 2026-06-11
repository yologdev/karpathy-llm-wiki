import { describe, it, expect } from "vitest";
import { htmlHasMermaid, renderMermaidInHtml } from "../mermaid";
import { SLIDES_FORMAT_INSTRUCTION, HTML_FORMAT_INSTRUCTION } from "../query";

// Actual Mermaid rendering needs a browser DOM and is exercised in the app, not
// here. These cover the pure pieces: detection, the no-op fast path (which must
// NOT load the ~3MB library), and that the model is told to emit Mermaid.

describe("htmlHasMermaid", () => {
  it("detects a mermaid pre block (incl. extra classes and single quotes)", () => {
    expect(htmlHasMermaid('<pre class="mermaid">graph TD</pre>')).toBe(true);
    expect(htmlHasMermaid('<pre class="lang mermaid foo">x</pre>')).toBe(true);
    expect(htmlHasMermaid("<pre class='mermaid'>x</pre>")).toBe(true);
  });

  it("is false without a mermaid pre block", () => {
    expect(htmlHasMermaid("<pre><code>graph TD</code></pre>")).toBe(false);
    expect(htmlHasMermaid("<p>I love mermaid diagrams</p>")).toBe(false);
    expect(htmlHasMermaid("<pre class=\"mermaidish\">x</pre>")).toBe(false);
  });
});

describe("renderMermaidInHtml", () => {
  it("returns the html unchanged when there are no mermaid blocks (no library load)", async () => {
    const html = "<!doctype html><html><body><p>hi</p></body></html>";
    expect(await renderMermaidInHtml(html)).toBe(html);
  });
});

describe("format instructions", () => {
  it("both slides and html tell the model to use Mermaid for structure", () => {
    expect(SLIDES_FORMAT_INSTRUCTION.toLowerCase()).toContain("mermaid");
    expect(HTML_FORMAT_INSTRUCTION.toLowerCase()).toContain("mermaid");
    // HTML uses the pre-block convention the renderer keys on.
    expect(HTML_FORMAT_INSTRUCTION).toContain('class="mermaid"');
  });
});
