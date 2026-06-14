import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Mock the LLM so reconcilePage is deterministic (overridable per test).
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => true),
  callLLM: vi.fn(async () => "# Merged\n\nFolded body covering both sources."),
}));

import { mergePages } from "../merge";
import { commonsRedirectForMissing } from "../page-redirect";
import { writeWikiPageWithSideEffects } from "../lifecycle";
import {
  ensureDirectories,
  readWikiPage,
  readWikiPageWithFrontmatter,
  serializeFrontmatter,
} from "../wiki";
import { serializeSources } from "../sources";
import { extractSummary } from "../ingest";
import { commonsPath } from "../links";
import { resetSourceIndex } from "../source-index";
import { resetAliasIndex, resolveAlias } from "../alias-index";
import { rebuildBacklinkIndex } from "../backlink-index";
import { listThreads, RECONCILE_THREAD_TITLE } from "../talk";
import { _resetStorage } from "../storage";
import { hasLLMKey, callLLM } from "../llm";
import type { SourceEntry } from "../types";

const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallLLM = vi.mocked(callLLM);

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

function src(url: string): SourceEntry {
  return { type: "url", url, fetched: "2026-01-01", triggered_by: "alice" };
}

async function seedPage(
  slug: string,
  opts: {
    title: string;
    owner?: string;
    visibility?: string;
    type?: string;
    created?: string;
    sources?: SourceEntry[];
    body?: string;
  },
): Promise<void> {
  const owner = opts.owner ?? "alice";
  const created = opts.created ?? "2026-01-01";
  const fm: Record<string, string | string[] | number | boolean> = {
    created,
    updated: created,
    owner,
    authors: [owner],
    contributors: [owner],
  };
  if (opts.visibility) fm.visibility = opts.visibility;
  if (opts.type) fm.type = opts.type;
  if (opts.sources) {
    fm.sources = serializeSources(opts.sources);
    fm.source_count = opts.sources.length;
  }
  const body = opts.body ?? `# ${opts.title}\n\nContent about ${opts.title}.`;
  // Seed through the side-effecting write path so the wiki/alias/backlink
  // indexes populate exactly as a real write would.
  await writeWikiPageWithSideEffects({
    slug,
    title: opts.title,
    content: serializeFrontmatter(fm, body),
    summary: extractSummary(body.replace(/^#\s+.+$/m, "").trim()) || opts.title,
    logOp: "ingest",
    crossRefSource: null,
    author: owner,
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-test-"));
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) saved[k] = process.env[k];
  process.env.DATA_DIR = tmpDir;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  _resetStorage();
  resetSourceIndex();
  resetAliasIndex();
  vi.clearAllMocks();
  mockedHasLLMKey.mockReturnValue(true);
  mockedCallLLM.mockResolvedValue("# Merged\n\nFolded body covering both sources.");
  await ensureDirectories();
});

afterEach(async () => {
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetSourceIndex();
  resetAliasIndex();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("mergePages", () => {
  it("folds bodies, unions provenance + aliases, and deletes the absorbed page", async () => {
    await seedPage("agent-harness", {
      title: "Agent Harness",
      created: "2026-02-01",
      sources: [src("https://x.com/i/status/1")],
    });
    await seedPage("harness-ai-agents", {
      title: "Harness (AI agents)",
      created: "2026-01-15", // earlier
      sources: [src("https://example.com/article")],
    });

    const result = await mergePages({
      from: "harness-ai-agents",
      into: "agent-harness",
      actor: "alice",
    });

    expect(result).toMatchObject({
      fromSlug: "harness-ai-agents",
      intoSlug: "agent-harness",
      disputed: false,
    });

    // Absorbed page is gone; survivor remains with the folded body.
    expect(await readWikiPage("harness-ai-agents")).toBeNull();
    const into = await readWikiPageWithFrontmatter("agent-harness");
    expect(into).not.toBeNull();
    expect(into!.body).toContain("Folded body covering both sources.");

    // Provenance unioned; from's title + slug recorded as aliases of the survivor.
    const aliases = into!.frontmatter.aliases as string[];
    expect(aliases).toContain("Harness (AI agents)");
    expect(aliases).toContain("harness-ai-agents"); // slug alias powers the redirect
    expect(into!.frontmatter.source_count).toBe(2);
    // Earlier created date wins; two distinct sources raise confidence above a lone 0.6.
    expect(into!.frontmatter.created).toBe("2026-01-15");
    expect(into!.frontmatter.confidence as number).toBeGreaterThan(0.6);

    // The absorbed slug now resolves to the survivor (alias + redirect).
    resetAliasIndex();
    expect(await resolveAlias("harness-ai-agents")).toBe("agent-harness");
    expect(await commonsRedirectForMissing("harness-ai-agents")).toBe(
      commonsPath("agent-harness"),
    );
  });

  it("re-points internal backlinks from the absorbed slug to the survivor BEFORE deleting", async () => {
    await seedPage("agent-harness", { title: "Agent Harness" });
    await seedPage("harness-ai-agents", { title: "Harness (AI agents)" });
    await seedPage("other", {
      title: "Other",
      body: "# Other\n\nSee the [harness](harness-ai-agents.md) page.",
    });

    const result = await mergePages({
      from: "harness-ai-agents",
      into: "agent-harness",
      actor: "alice",
    });

    expect(result.repointedBacklinksFrom).toContain("other");
    const other = await readWikiPage("other");
    expect(other!.content).toContain("](agent-harness.md)");
    expect(other!.content).not.toContain("](harness-ai-agents.md)");
  });

  it("re-points via the precomputed backlink index when it's present (the production fast path)", async () => {
    await seedPage("agent-harness", { title: "Agent Harness" });
    await seedPage("harness-ai-agents", { title: "Harness (AI agents)" });
    await seedPage("other", {
      title: "Other",
      body: "# Other\n\nSee the [harness](harness-ai-agents.md) page.",
    });
    // Build the index so getBacklinkIndex() is non-null → exercises the
    // `index[fromSlug]` fast path rather than the full-scan fallback.
    await rebuildBacklinkIndex();

    const result = await mergePages({
      from: "harness-ai-agents",
      into: "agent-harness",
      actor: "alice",
    });

    expect(result.repointedBacklinksFrom).toContain("other");
    const other = await readWikiPage("other");
    expect(other!.content).toContain("](agent-harness.md)");
    expect(other!.content).not.toContain("](harness-ai-agents.md)");
  });

  it("escalates `disputed` (and caps confidence) when the fold finds a contradiction", async () => {
    await seedPage("agent-harness", {
      title: "Agent Harness",
      sources: [src("https://x.com/i/status/1")],
    });
    await seedPage("harness-ai-agents", {
      title: "Harness (AI agents)",
      sources: [src("https://example.com/article")],
    });
    mockedCallLLM.mockResolvedValue(
      "DISPUTED: yes\n\n# Agent Harness\n\nSources disagree on the definition.",
    );

    const result = await mergePages({
      from: "harness-ai-agents",
      into: "agent-harness",
      actor: "alice",
    });

    expect(result.disputed).toBe(true);
    const into = await readWikiPageWithFrontmatter("agent-harness");
    expect(into!.frontmatter.disputed).toBe(true);
    expect(into!.frontmatter.confidence as number).toBeLessThanOrEqual(0.5);

    // A disputed fold must open a reconciliation thread on the survivor so the
    // contradiction is actionable (same loop as a disputed ingest).
    const threads = await listThreads("agent-harness");
    const recon = threads.find((t) => t.title === RECONCILE_THREAD_TITLE);
    expect(recon).toBeDefined();
    expect(recon!.status).toBe("open");
    // Authored by the human actor (not the agent) → scan-actionable; references
    // the absorbed slug.
    expect(recon!.comments[0].author).toBe("alice");
    expect(recon!.comments[0].body).toContain('merged in "harness-ai-agents"');
  });

  it("appends both bodies (no reconcile) when there's no LLM key", async () => {
    mockedHasLLMKey.mockReturnValue(false);
    await seedPage("agent-harness", {
      title: "Agent Harness",
      body: "# Agent Harness\n\nThe harness loop.",
    });
    await seedPage("harness-ai-agents", {
      title: "Harness (AI agents)",
      body: "# Harness (AI agents)\n\nContext window management.",
    });

    await mergePages({ from: "harness-ai-agents", into: "agent-harness", actor: "alice" });

    const into = await readWikiPageWithFrontmatter("agent-harness");
    expect(into!.body).toContain("The harness loop.");
    expect(into!.body).toContain("Context window management.");
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("rejects merging a page into itself and a missing page", async () => {
    await seedPage("agent-harness", { title: "Agent Harness" });
    await expect(mergePages({ from: "agent-harness", into: "agent-harness" })).rejects.toThrow(
      /into itself/,
    );
    await expect(
      mergePages({ from: "ghost", into: "agent-harness", actor: "alice" }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects an artifact survivor and a public→private merge", async () => {
    await seedPage("deck", { title: "Deck", type: "slides" });
    await seedPage("note", { title: "Note" });
    await expect(
      mergePages({ from: "note", into: "deck", actor: "alice" }),
    ).rejects.toThrow(/artifact/);

    await seedPage("public-pg", { title: "Public Pg" });
    await seedPage("private-pg", { title: "Private Pg", visibility: "private" });
    await expect(
      mergePages({ from: "public-pg", into: "private-pg", actor: "alice" }),
    ).rejects.toThrow(/private/);
  });

  it("rejects a cross-owner merge without an admin caller", async () => {
    await seedPage("alice-pg", { title: "Alice Pg", owner: "alice" });
    await seedPage("bob-pg", { title: "Bob Pg", owner: "bob" });
    await expect(
      mergePages({ from: "bob-pg", into: "alice-pg", actor: "alice" }),
    ).rejects.toThrow(/same owner/);
    // An admin caller bypasses the owner guard AND unions both pages'
    // contributors/authors (deduped) onto the survivor.
    const result = await mergePages({ from: "bob-pg", into: "alice-pg", bypassOwnerCheck: true });
    expect(result.intoSlug).toBe("alice-pg");
    const into = await readWikiPageWithFrontmatter("alice-pg");
    expect(into!.frontmatter.contributors as string[]).toEqual(
      expect.arrayContaining(["alice", "bob"]),
    );
    expect((into!.frontmatter.contributors as string[]).length).toBe(2); // deduped
    expect(into!.frontmatter.authors as string[]).toEqual(
      expect.arrayContaining(["alice", "bob"]),
    );
  });
});

describe("commonsRedirectForMissing (alias redirect safety)", () => {
  it("never forwards to a private page (no existence oracle)", async () => {
    // A private page that happens to carry an alias must not be reachable via a
    // public /wiki/<alias> redirect.
    const fm = serializeFrontmatter(
      {
        created: "2026-01-01",
        updated: "2026-01-01",
        owner: "alice",
        visibility: "private",
        aliases: ["ghost-alias"],
      },
      "# Secret\n\nPrivate body.",
    );
    await writeWikiPageWithSideEffects({
      slug: "secret",
      title: "Secret",
      content: fm,
      summary: "secret",
      logOp: "ingest",
      crossRefSource: null,
      author: "alice",
    });
    resetAliasIndex();
    expect(await commonsRedirectForMissing("ghost-alias")).toBeNull();
  });

  it("returns null for a slug with no alias", async () => {
    await seedPage("real", { title: "Real" });
    resetAliasIndex();
    expect(await commonsRedirectForMissing("nonexistent")).toBeNull();
  });
});
