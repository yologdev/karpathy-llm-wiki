import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercise the hybrid ROUTING in node (no DOM): mock beautiful-mermaid so we can
// make it throw / return junk, and stub mermaid with a sentinel SVG (the real
// mermaid needs a browser DOM). Isolated in its own file so the real-renderer
// tests in mermaid.test.ts keep using the actual beautiful-mermaid.
vi.mock("beautiful-mermaid", () => ({ renderMermaidSVG: vi.fn() }));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: "<svg>MERMAID-FALLBACK</svg>" })),
  },
}));

import { renderMermaid } from "../mermaid";
import { renderMermaidSVG } from "beautiful-mermaid";

const mockBm = vi.mocked(renderMermaidSVG);

describe("renderMermaid hybrid routing → mermaid fallback", () => {
  beforeEach(() => mockBm.mockReset());

  it("falls back to mermaid when beautiful-mermaid returns a non-SVG string", async () => {
    mockBm.mockReturnValue("oops not an svg");
    const svg = await renderMermaid("flowchart LR\n A-->B");
    expect(svg).toBe("<svg>MERMAID-FALLBACK</svg>");
  });

  it("uses beautiful-mermaid's output when it returns a valid SVG (no fallback)", async () => {
    mockBm.mockReturnValue("<svg>BEAUTIFUL</svg>");
    const svg = await renderMermaid("flowchart LR\n A-->B");
    expect(svg).toBe("<svg>BEAUTIFUL</svg>");
  });
});
