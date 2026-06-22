import { describe, it, expect } from "vitest";
import {
  htmlHasMermaid,
  renderMermaidInHtml,
  repairMermaid,
} from "../mermaid";
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

  it("does not corrupt SVG containing $-replacement patterns (the regression)", async () => {
    // A model-authored label can contain $&, $$, $1 — String.replace(str) would
    // expand these; the function-replacement form must keep the SVG byte-for-byte.
    const svg = "<svg><text>cost $5 & $$ and $1 and $& and $`</text></svg>";
    const html = '<pre class="mermaid">graph TD; A--&gt;B</pre>';
    const out = await renderMermaidInHtml(html, async () => svg);
    expect(out).toContain(svg);
    expect(out).not.toContain("class=\"mermaid\""); // the <pre> was replaced
  });

  it("decodes entities before handing the definition to the renderer", async () => {
    let seen = "";
    const html = '<pre class="mermaid">A--&gt;B: &quot;x&amp;amp;y&quot;</pre>';
    await renderMermaidInHtml(html, async (c) => {
      seen = c;
      return "<svg/>";
    });
    // &amp;amp; -> &amp; (decoded once, not to a bare &), &gt; -> >, &quot; -> "
    expect(seen).toBe('A-->B: "x&amp;y"');
  });

  it("leaves a block untouched when its render throws (fail-soft to source)", async () => {
    const html = '<pre class="mermaid">bad</pre><p>after</p>';
    const out = await renderMermaidInHtml(html, async () => {
      throw new Error("syntax");
    });
    expect(out).toBe(html);
  });

  it("partial success: replaces the good block, preserves the failing one", async () => {
    const html =
      '<pre class="mermaid">ok</pre><pre class="mermaid">bad</pre>';
    const out = await renderMermaidInHtml(html, async (c) => {
      if (c === "bad") throw new Error("syntax");
      return "<svg>good</svg>";
    });
    expect(out).toContain("<svg>good</svg>");
    expect(out).toContain('<pre class="mermaid">bad</pre>');
  });
});

describe("repairMermaid", () => {
  it("fixes a subgraph title with spaces + an edge that links subgraphs (the real bug)", () => {
    const bad = [
      "flowchart TB",
      "  subgraph Built-in Harness",
      "    S[System Prompt]",
      "  end",
      "  subgraph Outer Harness",
      "    FG[Feedforward Guides]",
      "  end",
      "  Built-in Harness --> Outer Harness",
    ].join("\n");
    const out = repairMermaid(bad);
    // Headers get an explicit id + quoted title…
    expect(out).toContain('subgraph sg_1["Built-in Harness"]');
    expect(out).toContain('subgraph sg_2["Outer Harness"]');
    // …and the linking edge references the ids, not the space-containing titles.
    expect(out).toContain("sg_1 --> sg_2");
    expect(out).not.toMatch(/Built-in Harness\s*-->/);
  });

  it("leaves a valid graph unchanged (single-token + explicit-id subgraphs)", () => {
    const ok = [
      "flowchart TB",
      "  subgraph backend",
      "    A[API]",
      "  end",
      '  subgraph fe["Front End"]',
      "    B[UI]",
      "  end",
      "  backend --> fe",
    ].join("\n");
    expect(repairMermaid(ok)).toBe(ok);
  });

  it("handles substring-collision: longer title replaced before shorter one", () => {
    const bad = [
      "flowchart TB",
      "  subgraph Data Flow",
      "    A[Input]",
      "  end",
      "  subgraph Extended Data Flow",
      "    B[Output]",
      "  end",
      "  Data Flow --> Extended Data Flow",
    ].join("\n");
    const out = repairMermaid(bad);
    expect(out).toContain('subgraph sg_1["Data Flow"]');
    expect(out).toContain('subgraph sg_2["Extended Data Flow"]');
    // The edge must use synthetic ids for BOTH subgraphs — the shorter title
    // must not corrupt the longer title's occurrence.
    expect(out).toContain("sg_1 --> sg_2");
    expect(out).not.toContain("Extended sg_1");
  });

  it("does not touch a graph with no subgraphs", () => {
    const code = "flowchart LR\n  A[Start] --> B[End]";
    expect(repairMermaid(code)).toBe(code);
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
