import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Mock the LLM so reconcile never calls a real API.
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => true),
  callLLM: vi.fn(),
}));

import {
  ensureDirectories,
  writeWikiPage,
  serializeFrontmatter,
  readWikiPageWithFrontmatter,
  type Frontmatter,
} from "../wiki";
import { createThread, getThread } from "../talk";
import { reconcileFromTalk } from "../reconcile";
import { hasLLMKey, callLLM } from "../llm";
import { _resetStorage } from "../storage";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reconcile-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
  await ensureDirectories();
  mockedHasLLMKey.mockReturnValue(true);
});

afterEach(async () => {
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetStorage();
  mockedCallLLM.mockReset();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function seedPage(slug: string, body: string, over: Partial<Frontmatter> = {}) {
  const fm: Frontmatter = {
    created: "2026-01-01",
    updated: "2026-01-01",
    owner: "alice",
    visibility: "public",
    authors: ["alice"],
    contributors: [],
    confidence: 0.7,
    expiry: "2099-01-01",
    tags: [],
    disputed: false,
    ...over,
  };
  await writeWikiPage(slug, serializeFrontmatter(fm, `# ${slug}\n\n${body}`));
}

describe("reconcileFromTalk", () => {
  it("revises the page to address a thread, posts a yoyo reply, and resolves it", async () => {
    await seedPage("transformers", "Transformers were invented in 2017.");
    await createThread(
      "transformers",
      "Wrong date",
      "bob",
      "The invention date is wrong — it was 2015, not 2017.",
    );
    mockedCallLLM.mockResolvedValue(
      "# transformers\n\nTransformers were invented in 2015.",
    );

    const result = await reconcileFromTalk("transformers", 0, {
      author: "bob--yoyo",
    });

    expect(result.changed).toBe(true);
    expect(result.disputed).toBe(false);

    const page = await readWikiPageWithFrontmatter("transformers");
    expect(page!.body).toContain("invented in 2015");
    expect(page!.frontmatter.disputed).toBe(false);

    const thread = await getThread("transformers", 0);
    expect(thread!.status).toBe("resolved");
    // yoyo posted a reply as the acting agent.
    const last = thread!.comments[thread!.comments.length - 1];
    expect(last.author).toBe("bob--yoyo");
    expect(last.body.toLowerCase()).toContain("updated");
  });

  it("flags disputed and leaves the thread open on an unresolved contradiction", async () => {
    await seedPage("ai", "AI was coined in 1956.");
    await createThread("ai", "Disagree", "carol", "Some say it was 1955.");
    mockedCallLLM.mockResolvedValue(
      "DISPUTED: yes\n\n# ai\n\nSources disagree: 1956 (McCarthy) vs 1955 (others).",
    );

    const result = await reconcileFromTalk("ai", 0);

    expect(result.disputed).toBe(true);
    const page = await readWikiPageWithFrontmatter("ai");
    expect(page!.frontmatter.disputed).toBe(true);
    expect(page!.body).not.toContain("DISPUTED:");
    // Left open for a human to settle.
    expect((await getThread("ai", 0))!.status).toBe("open");
  });

  it("makes no change and does not blank the page on an empty LLM response", async () => {
    await seedPage("stable", "Original content that must survive.");
    await createThread("stable", "Vague", "dan", "idk something feels off");
    mockedCallLLM.mockResolvedValue("");

    const result = await reconcileFromTalk("stable", 0);

    expect(result.changed).toBe(false);
    expect((await readWikiPageWithFrontmatter("stable"))!.body).toContain(
      "Original content that must survive.",
    );
  });

  it("no-ops when no LLM is configured", async () => {
    await seedPage("topic", "Body.");
    await createThread("topic", "t", "ed", "issue");
    mockedHasLLMKey.mockReturnValue(false);

    const result = await reconcileFromTalk("topic", 0);
    expect(result.changed).toBe(false);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("CLEARS disputed when the reconcile resolves the contradiction (closes the loop)", async () => {
    await seedPage("settled", "Older text with a contradiction.", {
      disputed: true,
    });
    await createThread("settled", "Sources disagree", "frank", "please reconcile");
    // An explicit "DISPUTED: no" verdict → contradiction resolved, flag cleared.
    mockedCallLLM.mockResolvedValue(
      "DISPUTED: no\n\n# settled\n\nReconciled: the dates agree once normalized.",
    );

    const result = await reconcileFromTalk("settled", 0, { author: "frank--yoyo" });

    expect(result.disputed).toBe(false);
    const page = await readWikiPageWithFrontmatter("settled");
    expect(page!.frontmatter.disputed).toBe(false); // CLEARED (was true)
    expect(page!.body).not.toContain("DISPUTED:"); // verdict line stripped
    const thread = await getThread("settled", 0);
    expect(thread!.status).toBe("resolved");
    expect(
      thread!.comments[thread!.comments.length - 1].body.toLowerCase(),
    ).toContain("cleared");
  });

  it("clears disputed even when the body needs no change (write-gate covers the flag flip)", async () => {
    const body = "Already consistent prose, nothing to edit.";
    await seedPage("flagonly", body, { disputed: true });
    await createThread("flagonly", "Sources disagree", "gina", "reconcile pls");
    // The LLM returns the SAME body with an explicit "DISPUTED: no" → no content
    // change, verdict resolved → the flag must still flip to false.
    mockedCallLLM.mockResolvedValue(`DISPUTED: no\n\n# flagonly\n\n${body}`);

    const result = await reconcileFromTalk("flagonly", 0, { author: "gina--yoyo" });

    expect(result.changed).toBe(false);
    expect(result.disputed).toBe(false);
    const page = await readWikiPageWithFrontmatter("flagonly");
    expect(page!.frontmatter.disputed).toBe(false); // cleared despite no body change
  });

  it("PRESERVES disputed when the LLM omits the verdict line (no silent downgrade)", async () => {
    // Tri-state safety: a malformed/forgotten marker must NOT clear a genuine
    // dispute — only an explicit "DISPUTED: no" does.
    await seedPage("kept", "Contested prose with a real contradiction.", {
      disputed: true,
    });
    await createThread("kept", "Sources disagree", "hank", "reconcile pls");
    // A revision with NO DISPUTED line at all → leave the flag unchanged.
    mockedCallLLM.mockResolvedValue(
      "# kept\n\nReworded prose, but the verdict line was forgotten.",
    );

    const result = await reconcileFromTalk("kept", 0, { author: "hank--yoyo" });

    expect(result.changed).toBe(true); // body did change…
    expect(result.disputed).toBe(true); // …but the dispute is preserved
    const page = await readWikiPageWithFrontmatter("kept");
    expect(page!.frontmatter.disputed).toBe(true);
    // Still unresolved → thread stays open for a human.
    expect((await getThread("kept", 0))!.status).toBe("open");
  });

  it("KEEPS disputed on an already-disputed page when the verdict is still 'yes'", async () => {
    await seedPage("stuck", "1956 (McCarthy) vs 1955 (others).", {
      disputed: true,
    });
    await createThread("stuck", "Sources disagree", "ivy", "reconcile pls");
    mockedCallLLM.mockResolvedValue(
      "DISPUTED: yes\n\n# stuck\n\nStill unresolved: 1956 vs 1955, both attributed.",
    );

    const result = await reconcileFromTalk("stuck", 0, { author: "ivy--yoyo" });

    expect(result.disputed).toBe(true);
    expect(
      (await readWikiPageWithFrontmatter("stuck"))!.frontmatter.disputed,
    ).toBe(true);
    expect((await getThread("stuck", 0))!.status).toBe("open");
  });

  it("throws on a missing page (→ poison/422 at the route)", async () => {
    await expect(reconcileFromTalk("nope", 0)).rejects.toThrow(/not found/i);
  });
});
