import { describe, it, expect } from "vitest";
import {
  htmlHasYoyoIllustration,
  markdownHasYoyoIllustration,
  renderYoyoIllustrationsInHtml,
  renderYoyoIllustrationsInMarkdown,
  MAX_ILLUSTRATIONS,
} from "../illustration-render";

const fig = (attrs = 'data-scene="s"') =>
  `<figure class="yoyo-illustration" ${attrs}></figure>`;

describe("htmlHasYoyoIllustration", () => {
  it("detects a yoyo-illustration figure", () => {
    expect(htmlHasYoyoIllustration(fig())).toBe(true);
    expect(htmlHasYoyoIllustration('<figure class="x yoyo-illustration y">')).toBe(true);
  });
  it("is false otherwise", () => {
    expect(htmlHasYoyoIllustration("<figure><img></figure>")).toBe(false);
    expect(htmlHasYoyoIllustration("<p>yoyo-illustration</p>")).toBe(false);
  });
});

describe("renderYoyoIllustrationsInHtml", () => {
  it("returns html unchanged and never fetches when there's no directive", async () => {
    let calls = 0;
    const html = "<p>nothing</p>";
    const out = await renderYoyoIllustrationsInHtml(html, async () => {
      calls++;
      return "data:x";
    });
    expect(out).toBe(html);
    expect(calls).toBe(0);
  });

  it("replaces the figure with the generated image", async () => {
    const out = await renderYoyoIllustrationsInHtml(
      fig('data-scene="yoyo carrying a box"'),
      async () => "data:image/jpeg;base64,AAAA",
    );
    expect(out).toContain('<img src="data:image/jpeg;base64,AAAA"');
    expect(out).toContain('alt="yoyo carrying a box"');
    expect(out).not.toContain("data-scene");
  });

  it("passes the entity-decoded scene + lang from attributes to the fetcher", async () => {
    let got = { scene: "", lang: "" };
    await renderYoyoIllustrationsInHtml(
      fig('data-scene="a &amp; b" data-lang="中文"'),
      async (scene, lang) => {
        got = { scene, lang };
        return "data:x";
      },
    );
    expect(got.scene).toBe("a & b");
    expect(got.lang).toBe("中文");
  });

  it("drops a figure whose generation fails (no broken placeholder)", async () => {
    const html = `<p>x</p>${fig()}<p>y</p>`;
    const out = await renderYoyoIllustrationsInHtml(html, async () => null);
    expect(out).toBe("<p>x</p><p>y</p>");
  });

  it(`caps generation at MAX_ILLUSTRATIONS (${MAX_ILLUSTRATIONS})`, async () => {
    let calls = 0;
    const out = await renderYoyoIllustrationsInHtml(fig().repeat(5), async () => {
      calls++;
      return "data:img";
    });
    expect(calls).toBe(MAX_ILLUSTRATIONS);
    // The leftover (un-filled) figures keep their directive.
    expect((out.match(/data-scene/g) ?? []).length).toBe(5 - MAX_ILLUSTRATIONS);
  });

  it("does not corrupt $-patterns in the generated image (function replacement)", async () => {
    const out = await renderYoyoIllustrationsInHtml(
      fig(),
      async () => "data:image/jpeg;base64,A$$B$&C",
    );
    expect(out).toContain('src="data:image/jpeg;base64,A$$B$&C"');
  });

  it("keeps the directive in place when generation fails and onMissing=keep", async () => {
    const html = fig('data-scene="x"');
    const out = await renderYoyoIllustrationsInHtml(html, async () => null, {
      onMissing: "keep",
    });
    expect(out).toBe(html);
  });
});

const mdFence = (scene = "yoyo carrying a box") =>
  "```yoyo-illustration\n" + scene + "\n```";

describe("markdownHasYoyoIllustration", () => {
  it("detects a yoyo-illustration fence", () => {
    expect(markdownHasYoyoIllustration(mdFence())).toBe(true);
  });
  it("is false otherwise", () => {
    expect(markdownHasYoyoIllustration("```mermaid\ngraph TD\n```")).toBe(false);
    expect(markdownHasYoyoIllustration("a yoyo-illustration in prose")).toBe(false);
  });
});

describe("renderYoyoIllustrationsInMarkdown", () => {
  it("returns markdown unchanged and never fetches with no directive", async () => {
    let calls = 0;
    const md = "# Slide\n\nbody";
    const out = await renderYoyoIllustrationsInMarkdown(md, async () => {
      calls++;
      return "data:x";
    });
    expect(out).toBe(md);
    expect(calls).toBe(0);
  });

  it("bakes the fence into a markdown image", async () => {
    const out = await renderYoyoIllustrationsInMarkdown(
      mdFence("yoyo holding a map"),
      async () => "data:image/jpeg;base64,AAAA",
    );
    expect(out).toBe("![yoyo holding a map](data:image/jpeg;base64,AAAA)");
  });

  it("passes the trimmed scene to the fetcher", async () => {
    let got = "";
    await renderYoyoIllustrationsInMarkdown(
      "```yoyo-illustration\n  spaced scene  \n```",
      async (scene) => {
        got = scene;
        return "data:x";
      },
    );
    expect(got).toBe("spaced scene");
  });

  it("sanitizes brackets/newlines out of the alt text", async () => {
    const out = await renderYoyoIllustrationsInMarkdown(
      "```yoyo-illustration\na [boxed] idea\n```",
      async () => "data:x",
    );
    expect(out).toBe("![a boxed idea](data:x)");
  });

  it("drops a fence whose generation fails by default", async () => {
    const out = await renderYoyoIllustrationsInMarkdown(mdFence(), async () => null);
    expect(out).toBe("");
  });

  it("keeps the fence in place when generation fails and onMissing=keep", async () => {
    const md = mdFence("x");
    const out = await renderYoyoIllustrationsInMarkdown(md, async () => null, {
      onMissing: "keep",
    });
    expect(out).toBe(md);
  });

  it(`caps generation at MAX_ILLUSTRATIONS (${MAX_ILLUSTRATIONS})`, async () => {
    let calls = 0;
    const md = Array.from({ length: 5 }, (_, i) => mdFence("s" + i)).join("\n\n");
    await renderYoyoIllustrationsInMarkdown(md, async () => {
      calls++;
      return "data:img";
    });
    expect(calls).toBe(MAX_ILLUSTRATIONS);
  });

  it("does not corrupt $-patterns in the baked image (function replacement)", async () => {
    const out = await renderYoyoIllustrationsInMarkdown(
      mdFence("s"),
      async () => "data:image/jpeg;base64,A$$B$&C",
    );
    expect(out).toBe("![s](data:image/jpeg;base64,A$$B$&C)");
  });
});
