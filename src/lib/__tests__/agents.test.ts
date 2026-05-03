import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getAgentsDir,
  ensureAgentsDir,
  listAgents,
  getAgent,
  registerAgent,
  deleteAgent,
} from "../agents";
import { readWikiPage } from "../wiki";
import type { AgentProfile } from "../types";

// ---------------------------------------------------------------------------
// Test setup — temp directory with DATA_DIR override
// ---------------------------------------------------------------------------

let tmpDir: string;
let originalDataDir: string | undefined;
let originalWikiDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-test-"));
  originalDataDir = process.env.DATA_DIR;
  originalWikiDir = process.env.WIKI_DIR;
  process.env.DATA_DIR = tmpDir;
  // Point WIKI_DIR to tmpDir/wiki so readWikiPage finds our test pages
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  await fs.mkdir(path.join(tmpDir, "wiki"), { recursive: true });
});

afterEach(async () => {
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  if (originalWikiDir === undefined) {
    delete process.env.WIKI_DIR;
  } else {
    process.env.WIKI_DIR = originalWikiDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "test-agent",
    name: "Test Agent",
    description: "A test agent for unit tests",
    identityPages: [],
    learningPages: [],
    socialPages: [],
    registered: "2026-05-03T00:00:00.000Z",
    lastUpdated: "2026-05-03T00:00:00.000Z",
    ...overrides,
  };
}

/** Write a wiki page to the test wiki dir. */
async function writeTestWikiPage(slug: string, content: string): Promise<void> {
  const wikiDir = path.join(tmpDir, "wiki");
  await fs.writeFile(path.join(wikiDir, `${slug}.md`), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Data layer tests
// ---------------------------------------------------------------------------

describe("getAgentsDir", () => {
  it("returns <dataDir>/agents", () => {
    expect(getAgentsDir()).toBe(path.join(tmpDir, "agents"));
  });
});

describe("ensureAgentsDir", () => {
  it("creates the agents directory", async () => {
    await ensureAgentsDir();
    const stat = await fs.stat(getAgentsDir());
    expect(stat.isDirectory()).toBe(true);
  });

  it("is idempotent", async () => {
    await ensureAgentsDir();
    await ensureAgentsDir(); // should not throw
    const stat = await fs.stat(getAgentsDir());
    expect(stat.isDirectory()).toBe(true);
  });
});

describe("listAgents", () => {
  it("returns empty array when agents dir does not exist", async () => {
    const agents = await listAgents();
    expect(agents).toEqual([]);
  });

  it("returns empty array when agents dir is empty", async () => {
    await ensureAgentsDir();
    const agents = await listAgents();
    expect(agents).toEqual([]);
  });

  it("returns all registered agents sorted by ID", async () => {
    const profileB = makeProfile({ id: "beta", name: "Beta Agent" });
    const profileA = makeProfile({ id: "alpha", name: "Alpha Agent" });
    await registerAgent(profileB);
    await registerAgent(profileA);

    const agents = await listAgents();
    expect(agents).toHaveLength(2);
    expect(agents[0].id).toBe("alpha");
    expect(agents[1].id).toBe("beta");
  });

  it("skips non-JSON files in agents dir", async () => {
    await ensureAgentsDir();
    await fs.writeFile(path.join(getAgentsDir(), "README.md"), "hello");
    await registerAgent(makeProfile());

    const agents = await listAgents();
    expect(agents).toHaveLength(1);
  });

  it("skips malformed JSON files gracefully", async () => {
    await ensureAgentsDir();
    await fs.writeFile(
      path.join(getAgentsDir(), "bad.json"),
      "not valid json {{{",
    );
    await registerAgent(makeProfile());

    const agents = await listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("test-agent");
  });
});

describe("getAgent", () => {
  it("returns null for non-existent agent", async () => {
    const agent = await getAgent("nope");
    expect(agent).toBeNull();
  });

  it("returns the profile after registration", async () => {
    const profile = makeProfile({ id: "yoyo", name: "Yoyo" });
    await registerAgent(profile);

    const agent = await getAgent("yoyo");
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe("yoyo");
    expect(agent!.name).toBe("Yoyo");
  });

  it("throws on invalid ID", async () => {
    await expect(getAgent("INVALID")).rejects.toThrow(/Invalid agent ID/);
    await expect(getAgent("")).rejects.toThrow(/Invalid agent ID/);
    await expect(getAgent("-bad")).rejects.toThrow(/Invalid agent ID/);
  });
});

describe("registerAgent", () => {
  it("creates a JSON file on disk", async () => {
    const profile = makeProfile({ id: "yoyo" });
    await registerAgent(profile);

    const filePath = path.join(getAgentsDir(), "yoyo.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.id).toBe("yoyo");
    expect(parsed.name).toBe("Test Agent");
  });

  it("overwrites existing profile on re-registration", async () => {
    await registerAgent(makeProfile({ id: "yoyo", name: "V1" }));
    await registerAgent(makeProfile({ id: "yoyo", name: "V2" }));

    const agent = await getAgent("yoyo");
    expect(agent!.name).toBe("V2");
  });

  it("round-trips all fields correctly", async () => {
    const profile = makeProfile({
      id: "yoyo",
      name: "Yoyo",
      description: "A small octopus growing up in public",
      identityPages: ["yoyo-identity", "yoyo-personality"],
      learningPages: ["yoyo-learnings"],
      socialPages: ["yoyo-social-wisdom"],
      registered: "2026-01-01T00:00:00.000Z",
      lastUpdated: "2026-05-03T02:14:00.000Z",
    });
    await registerAgent(profile);

    const agent = await getAgent("yoyo");
    expect(agent).toEqual(profile);
  });

  it("defaults array fields to empty arrays", async () => {
    // Cast to simulate a profile without array fields set
    const sparse = {
      id: "minimal",
      name: "Minimal",
      description: "Bare minimum",
      registered: "2026-05-03T00:00:00.000Z",
      lastUpdated: "2026-05-03T00:00:00.000Z",
    } as AgentProfile;

    await registerAgent(sparse);
    const agent = await getAgent("minimal");
    expect(agent!.identityPages).toEqual([]);
    expect(agent!.learningPages).toEqual([]);
    expect(agent!.socialPages).toEqual([]);
  });
});

describe("registerAgent validation", () => {
  it("rejects empty ID", async () => {
    await expect(registerAgent(makeProfile({ id: "" }))).rejects.toThrow(
      /Invalid agent ID/,
    );
  });

  it("rejects ID starting with hyphen", async () => {
    await expect(registerAgent(makeProfile({ id: "-bad" }))).rejects.toThrow(
      /Invalid agent ID/,
    );
  });

  it("rejects ID with uppercase letters", async () => {
    await expect(registerAgent(makeProfile({ id: "Bad" }))).rejects.toThrow(
      /Invalid agent ID/,
    );
  });

  it("rejects ID with spaces", async () => {
    await expect(
      registerAgent(makeProfile({ id: "bad agent" })),
    ).rejects.toThrow(/Invalid agent ID/);
  });

  it("rejects missing name", async () => {
    await expect(registerAgent(makeProfile({ name: "" }))).rejects.toThrow(
      /non-empty 'name'/,
    );
  });

  it("rejects missing description", async () => {
    await expect(
      registerAgent(makeProfile({ description: "" })),
    ).rejects.toThrow(/non-empty 'description'/);
  });

  it("accepts valid IDs", async () => {
    // All these should succeed without throwing
    await registerAgent(makeProfile({ id: "a" }));
    await registerAgent(makeProfile({ id: "yoyo" }));
    await registerAgent(makeProfile({ id: "agent-1" }));
    await registerAgent(makeProfile({ id: "0day" }));

    const agents = await listAgents();
    expect(agents).toHaveLength(4);
  });
});

describe("deleteAgent", () => {
  it("returns false for non-existent agent", async () => {
    const result = await deleteAgent("nope");
    expect(result).toBe(false);
  });

  it("deletes an existing agent and returns true", async () => {
    await registerAgent(makeProfile({ id: "doomed" }));
    expect(await getAgent("doomed")).not.toBeNull();

    const result = await deleteAgent("doomed");
    expect(result).toBe(true);
    expect(await getAgent("doomed")).toBeNull();
  });

  it("throws on invalid ID", async () => {
    await expect(deleteAgent("INVALID")).rejects.toThrow(/Invalid agent ID/);
  });

  it("does not affect other agents", async () => {
    await registerAgent(makeProfile({ id: "keep" }));
    await registerAgent(makeProfile({ id: "remove" }));

    await deleteAgent("remove");
    const agents = await listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("keep");
  });
});

// ---------------------------------------------------------------------------
// Context aggregation tests — the core logic behind GET /api/agents/:id/context
// ---------------------------------------------------------------------------

describe("agent context aggregation", () => {
  it("reads wiki pages referenced in agent profile", async () => {
    // Create wiki pages on disk
    await writeTestWikiPage("yoyo-identity", "# Identity\n\nI am yoyo.");
    await writeTestWikiPage("yoyo-learnings", "# Learnings\n\nLesson 1.");

    // Register an agent pointing to those pages
    const profile = makeProfile({
      id: "yoyo",
      name: "Yoyo",
      identityPages: ["yoyo-identity"],
      learningPages: ["yoyo-learnings"],
      socialPages: [],
    });
    await registerAgent(profile);

    // Read pages as the context endpoint would
    const agent = await getAgent("yoyo");
    expect(agent).not.toBeNull();

    const identityPage = await readWikiPage("yoyo-identity");
    expect(identityPage).not.toBeNull();
    expect(identityPage!.content).toContain("I am yoyo.");

    const learningsPage = await readWikiPage("yoyo-learnings");
    expect(learningsPage).not.toBeNull();
    expect(learningsPage!.content).toContain("Lesson 1.");
  });

  it("gracefully handles missing wiki pages", async () => {
    // Register agent referencing a page that doesn't exist
    const profile = makeProfile({
      id: "ghost",
      name: "Ghost Agent",
      identityPages: ["nonexistent-page"],
    });
    await registerAgent(profile);

    const page = await readWikiPage("nonexistent-page");
    expect(page).toBeNull(); // Should return null, not throw
  });

  it("concatenates multiple pages with separator", async () => {
    await writeTestWikiPage("page-a", "# Page A\n\nContent A.");
    await writeTestWikiPage("page-b", "# Page B\n\nContent B.");

    const separator = "\n\n---\n\n";
    const slugs = ["page-a", "page-b"];
    const contents: string[] = [];
    for (const slug of slugs) {
      const page = await readWikiPage(slug);
      if (page) contents.push(page.content);
    }
    const concatenated = contents.join(separator);

    expect(concatenated).toContain("Content A.");
    expect(concatenated).toContain("---");
    expect(concatenated).toContain("Content B.");
  });

  it("skips missing pages during concatenation", async () => {
    await writeTestWikiPage("exists", "# Exists\n\nReal content.");

    const slugs = ["exists", "does-not-exist"];
    const contents: string[] = [];
    for (const slug of slugs) {
      const page = await readWikiPage(slug);
      if (page) contents.push(page.content);
    }

    expect(contents).toHaveLength(1);
    expect(contents[0]).toContain("Real content.");
  });

  it("computes correct metadata for context response", async () => {
    await writeTestWikiPage("id-page", "# Identity\n\nWho I am.");
    await writeTestWikiPage("learn-page", "# Learnings\n\nWhat I learned.");
    await writeTestWikiPage("social-page", "# Social\n\nWhat I know about people.");

    const profile = makeProfile({
      id: "meta-test",
      name: "Meta Test",
      identityPages: ["id-page"],
      learningPages: ["learn-page"],
      socialPages: ["social-page"],
    });
    await registerAgent(profile);

    // Simulate the context endpoint logic
    const separator = "\n\n---\n\n";
    const sections = [
      profile.identityPages,
      profile.learningPages,
      profile.socialPages,
    ];

    let totalChars = 0;
    let pageCount = 0;
    const contextParts: string[] = [];

    for (const slugs of sections) {
      const contents: string[] = [];
      for (const slug of slugs) {
        const page = await readWikiPage(slug);
        if (page) {
          contents.push(page.content);
          pageCount++;
        }
      }
      const sectionContent = contents.join(separator);
      totalChars += sectionContent.length;
      contextParts.push(sectionContent);
    }

    expect(pageCount).toBe(3);
    expect(totalChars).toBeGreaterThan(0);
    expect(contextParts[0]).toContain("Who I am.");
    expect(contextParts[1]).toContain("What I learned.");
    expect(contextParts[2]).toContain("What I know about people.");
  });

  it("returns empty strings for sections with no pages", async () => {
    const profile = makeProfile({
      id: "empty",
      name: "Empty Agent",
      identityPages: [],
      learningPages: [],
      socialPages: [],
    });
    await registerAgent(profile);

    // With no slugs, each section should be empty
    for (const slugs of [profile.identityPages, profile.learningPages, profile.socialPages]) {
      const contents: string[] = [];
      for (const slug of slugs) {
        const page = await readWikiPage(slug);
        if (page) contents.push(page.content);
      }
      expect(contents.join("\n\n---\n\n")).toBe("");
    }
  });

  it("POST + GET round-trip preserves all fields", async () => {
    // Simulate the full POST → GET round trip as the API routes do it
    const profile: AgentProfile = {
      id: "roundtrip",
      name: "Round Trip Agent",
      description: "Testing the full lifecycle",
      identityPages: ["rt-identity"],
      learningPages: ["rt-learn-1", "rt-learn-2"],
      socialPages: ["rt-social"],
      registered: "2026-05-03T00:00:00.000Z",
      lastUpdated: "2026-05-03T02:14:00.000Z",
    };

    await registerAgent(profile);
    const agents = await listAgents();
    expect(agents.some((a) => a.id === "roundtrip")).toBe(true);

    const fetched = await getAgent("roundtrip");
    expect(fetched).toEqual(profile);
  });
});
