import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// LLM off — ingestImage uses generatedContent so the LLM is skipped anyway.
vi.mock("../llm", () => ({ hasLLMKey: vi.fn(() => false), callLLM: vi.fn() }));
// Vision is mocked (no Workers AI binding in tests).
vi.mock("../vision", () => ({ describeImage: vi.fn() }));
// Keep the real fetch module but stub the network-touching image helpers.
vi.mock("../fetch", async (orig) => {
  const actual = await orig<typeof import("../fetch")>();
  return { ...actual, storeImageAsset: vi.fn(), storeImageBytes: vi.fn() };
});

import { ingest, ingestImage } from "../ingest";
import { hasLLMKey, callLLM } from "../llm";
import { describeImage } from "../vision";
import { storeImageAsset } from "../fetch";
import { readWikiPageWithFrontmatter } from "../wiki";
import { parseSources } from "../sources";
import { resetSourceIndex } from "../source-index";
import { resetAliasIndex } from "../alias-index";

const mockedDescribe = vi.mocked(describeImage);
const mockedStore = vi.mocked(storeImageAsset);
const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-image-"));
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) saved[k] = process.env[k];
  process.env.DATA_DIR = tmpDir;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  resetSourceIndex();
  resetAliasIndex();
  vi.clearAllMocks();
  mockedStore.mockResolvedValue({
    localPath: "assets/photo/photo.png",
    bytes: new Uint8Array([1, 2, 3]).buffer,
    filename: "photo.png",
    contentType: "image/png",
  });
});

afterEach(async () => {
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ingestImage", () => {
  it("creates a page embedding the image + vision description, attributed to the owner with sourceType image", async () => {
    mockedDescribe.mockResolvedValue({ text: "A red square on white." });

    const result = await ingestImage(
      { imageUrl: "https://example.com/photo.png" },
      { author: "alice", owner: "alice", triggeredBy: "alice", title: "My Photo" },
    );

    expect(mockedStore).toHaveBeenCalledWith("https://example.com/photo.png", "my-photo");
    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).toContain("![My Photo](assets/photo/photo.png)");
    expect(page!.content).toContain("A red square on white.");
    expect(page!.frontmatter.owner).toBe("alice");
    expect(page!.frontmatter.source_url).toBe("https://example.com/photo.png");
    const sources = parseSources(page!.frontmatter.sources as string);
    expect(sources[0]?.type).toBe("image");
  });

  it("still creates an image-only page when vision is unavailable (fail-soft)", async () => {
    mockedDescribe.mockResolvedValue(null);

    const result = await ingestImage(
      { imageUrl: "https://example.com/photo.png" },
      { author: "bob", owner: "bob", title: "Diagram" },
    );

    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).toContain("![Diagram](assets/photo/photo.png)");
    // No description paragraph, but the page exists and embeds the image.
    expect(page!.content.trim().endsWith("(assets/photo/photo.png)")).toBe(true);
  });

  it("does not duplicate the embedded image in a ## Images section", async () => {
    mockedDescribe.mockResolvedValue({ text: "desc" });
    const result = await ingestImage(
      { imageUrl: "https://example.com/photo.png" },
      { author: "alice", owner: "alice", title: "Once" },
    );
    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    const occurrences = page!.content.split("assets/photo/photo.png").length - 1;
    expect(occurrences).toBe(1);
    expect(page!.content).not.toContain("## Images");
  });
});

describe("appendSourceImages (via ingest, LLM path)", () => {
  it("appends a ## Images section with source images the LLM distillation dropped", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue("# Doc\n\n## Summary\n\nDistilled text, no images.");

    const result = await ingest(
      "Doc With Pics",
      "Some text.\n\n![a chart](assets/doc/chart.png)\n\nmore text.",
      { author: "alice", owner: "alice" },
    );

    const page = await readWikiPageWithFrontmatter(result.primarySlug);
    expect(page!.content).toContain("## Images");
    expect(page!.content).toContain("![a chart](assets/doc/chart.png)");
  });
});
