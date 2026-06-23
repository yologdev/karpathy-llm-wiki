import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { publishToCommons, PublishError } from "../publish";
import {
  ensureDirectories,
  readWikiPageWithFrontmatter,
  writeWikiPage,
} from "../wiki";
import { serializeFrontmatter } from "../frontmatter";
import { registerAgent, getAgent } from "../agents";
import { belongsInCommons } from "../commons";
import { _resetStorage } from "../storage";
import type { AgentProfile } from "../types";

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "publish-test-"));
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) saved[k] = process.env[k];
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
  await ensureDirectories();
});

afterEach(async () => {
  for (const k of ["WIKI_DIR", "RAW_DIR", "DATA_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "alice--yoyo",
    name: "Yoyo",
    description: "Alice's agent",
    owner: "alice",
    identityPages: [],
    learningPages: [],
    socialPages: [],
    registered: "2026-06-01T00:00:00.000Z",
    lastUpdated: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Write an agent-knowledge page to the test wiki dir. */
async function writeAgentPage(
  slug: string,
  agentId: string,
  extraFm: Record<string, unknown> = {},
): Promise<void> {
  const fm = {
    title: `Page ${slug}`,
    type: "agent-knowledge",
    owner: agentId,
    summary: "Test agent page",
    ...extraFm,
  };
  const content = serializeFrontmatter(
    fm as Record<string, string | string[] | number | boolean>,
    `# Page ${slug}\n\nAgent knowledge content.\n`,
  );
  await writeWikiPage(slug, content);
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("publishToCommons", () => {
  it("promotes an agent-knowledge page to commons", async () => {
    // Setup: register agent and create an agent-knowledge page
    const agent = makeAgent({ learningPages: ["my-topic"] });
    await registerAgent(agent);
    await writeAgentPage("my-topic", "alice--yoyo");

    // Act
    const result = await publishToCommons("my-topic", "alice--yoyo");

    // Assert result
    expect(result).toEqual({
      slug: "my-topic",
      previousType: "agent-knowledge",
      owner: "alice",
      agent: "alice--yoyo",
    });

    // Assert frontmatter changes
    const page = await readWikiPageWithFrontmatter("my-topic");
    expect(page).not.toBeNull();
    expect(page!.frontmatter.type).toBeUndefined();
    expect(page!.frontmatter.owner).toBe("alice");
    expect(page!.frontmatter.contributors).toContain("alice--yoyo");

    // Assert the page now belongs in commons
    expect(
      belongsInCommons({
        visibility: page!.frontmatter.visibility as string | undefined,
        type: page!.frontmatter.type as string | undefined,
      }),
    ).toBe(true);
  });

  it("removes slug from agent's learningPages", async () => {
    const agent = makeAgent({
      learningPages: ["keep-this", "my-topic", "also-keep"],
    });
    await registerAgent(agent);
    await writeAgentPage("my-topic", "alice--yoyo");

    await publishToCommons("my-topic", "alice--yoyo");

    const updated = await getAgent("alice--yoyo");
    expect(updated).not.toBeNull();
    expect(updated!.learningPages).toEqual(["keep-this", "also-keep"]);
  });

  it("does not error when slug is not in learningPages", async () => {
    const agent = makeAgent({ learningPages: ["other-page"] });
    await registerAgent(agent);
    await writeAgentPage("my-topic", "alice--yoyo");

    // Should not throw even though "my-topic" isn't in learningPages
    const result = await publishToCommons("my-topic", "alice--yoyo");
    expect(result.slug).toBe("my-topic");

    // learningPages unchanged
    const updated = await getAgent("alice--yoyo");
    expect(updated!.learningPages).toEqual(["other-page"]);
  });

  it("does not duplicate agent id in contributors", async () => {
    const agent = makeAgent({ learningPages: ["my-topic"] });
    await registerAgent(agent);
    await writeAgentPage("my-topic", "alice--yoyo", {
      contributors: ["alice--yoyo", "bob"],
    });

    await publishToCommons("my-topic", "alice--yoyo");

    const page = await readWikiPageWithFrontmatter("my-topic");
    const contribs = page!.frontmatter.contributors as string[];
    const agentCount = contribs.filter((c) => c === "alice--yoyo").length;
    expect(agentCount).toBe(1);
    expect(contribs).toContain("bob");
  });

  it("works with agent-identity type pages too", async () => {
    const agent = makeAgent({ identityPages: ["agent-bio"] });
    await registerAgent(agent);

    const fm = {
      title: "Agent Bio",
      type: "agent-identity",
      owner: "alice--yoyo",
      summary: "Bio page",
    };
    const content = serializeFrontmatter(
      fm as Record<string, string | string[] | number | boolean>,
      "# Agent Bio\n\nIdentity content.\n",
    );
    await writeWikiPage("agent-bio", content);

    const result = await publishToCommons("agent-bio", "alice--yoyo");
    expect(result.previousType).toBe("agent-identity");

    const page = await readWikiPageWithFrontmatter("agent-bio");
    expect(page!.frontmatter.type).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it("throws PublishError when page not found", async () => {
    const agent = makeAgent();
    await registerAgent(agent);

    await expect(
      publishToCommons("nonexistent", "alice--yoyo"),
    ).rejects.toThrow(PublishError);
    await expect(
      publishToCommons("nonexistent", "alice--yoyo"),
    ).rejects.toThrow("Page not found: nonexistent");
  });

  it("throws PublishError when page is not agent-scoped", async () => {
    const agent = makeAgent();
    await registerAgent(agent);

    // Write a normal page (no agent type)
    const fm = {
      title: "Normal Page",
      owner: "alice--yoyo",
      summary: "A normal page",
    };
    const content = serializeFrontmatter(
      fm as Record<string, string | string[] | number | boolean>,
      "# Normal Page\n\nRegular content.\n",
    );
    await writeWikiPage("normal-page", content);

    await expect(
      publishToCommons("normal-page", "alice--yoyo"),
    ).rejects.toThrow(PublishError);
    await expect(
      publishToCommons("normal-page", "alice--yoyo"),
    ).rejects.toThrow("not agent-scoped");
  });

  it("throws PublishError when agent not found", async () => {
    await writeAgentPage("my-topic", "ghost--agent");

    await expect(
      publishToCommons("my-topic", "ghost--agent"),
    ).rejects.toThrow(PublishError);
    await expect(
      publishToCommons("my-topic", "ghost--agent"),
    ).rejects.toThrow("Agent not found: ghost--agent");
  });

  it("throws PublishError when agent doesn't own the page", async () => {
    // Register agent but page is owned by a different agent
    const agent = makeAgent();
    await registerAgent(agent);
    await writeAgentPage("my-topic", "bob--yoyo"); // owned by bob--yoyo

    await expect(
      publishToCommons("my-topic", "alice--yoyo"),
    ).rejects.toThrow(PublishError);
    await expect(
      publishToCommons("my-topic", "alice--yoyo"),
    ).rejects.toThrow("does not own page");
  });

  it("throws PublishError when agent has no human owner", async () => {
    // Register agent without an owner field
    const agent = makeAgent({ id: "legacy-agent", owner: undefined });
    await registerAgent(agent);
    await writeAgentPage("my-topic", "legacy-agent");

    await expect(
      publishToCommons("my-topic", "legacy-agent"),
    ).rejects.toThrow(PublishError);
    await expect(
      publishToCommons("my-topic", "legacy-agent"),
    ).rejects.toThrow("has no human owner");
  });
});
