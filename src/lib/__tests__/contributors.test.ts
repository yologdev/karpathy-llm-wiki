import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildContributorProfile, listContributors } from "../contributors";
import { ensureDirectories, writeWikiPage } from "../wiki";
import { saveRevision } from "../revisions";
import { createThread, addComment, _resetTimestamp } from "../talk";
import { _resetLocks } from "../lock";

let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;
let originalDataDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "contributors-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  originalDataDir = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetTimestamp();
  _resetLocks();
});

afterEach(async () => {
  if (originalWikiDir === undefined) {
    delete process.env.WIKI_DIR;
  } else {
    process.env.WIKI_DIR = originalWikiDir;
  }
  if (originalRawDir === undefined) {
    delete process.env.RAW_DIR;
  } else {
    process.env.RAW_DIR = originalRawDir;
  }
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Helper: create a wiki page and register it in the index. */
async function createPage(slug: string, title: string, content: string) {
  await ensureDirectories();
  await writeWikiPage(slug, content);
  // updateIndex replaces the whole index, so we need to read existing entries first.
  // For tests, just write a single-entry index — tests create pages sequentially.
  const indexPath = path.join(process.env.WIKI_DIR!, "index.md");
  let existing = "";
  try {
    existing = await fs.readFile(indexPath, "utf-8");
  } catch { /* doesn't exist yet */ }
  const line = `- [${title}](${slug}.md) — Summary of ${title}`;
  if (!existing.includes(line)) {
    const newContent = existing
      ? `${existing.trimEnd()}\n${line}\n`
      : `# Wiki Index\n\n${line}\n`;
    await fs.writeFile(indexPath, newContent, "utf-8");
  }
}

describe("contributors data layer", () => {
  describe("listContributors", () => {
    it("returns empty array when no revisions exist", async () => {
      await ensureDirectories();
      const result = await listContributors();
      expect(result).toEqual([]);
    });

    it("aggregates multiple authors correctly", async () => {
      await createPage("page-a", "Page A", "# Page A\n\nContent.");
      await createPage("page-b", "Page B", "# Page B\n\nContent.");

      // Alice edits page-a twice, bob edits page-b once
      await saveRevision("page-a", "# Page A\n\nv1", "alice");
      await saveRevision("page-a", "# Page A\n\nv2", "alice");
      await saveRevision("page-b", "# Page B\n\nv1", "bob");

      const contributors = await listContributors();
      expect(contributors).toHaveLength(2);
      // Alice first (2 edits > 1)
      expect(contributors[0].handle).toBe("alice");
      expect(contributors[0].editCount).toBe(2);
      expect(contributors[1].handle).toBe("bob");
      expect(contributors[1].editCount).toBe(1);
    });
  });

  describe("buildContributorProfile", () => {
    it("counts edits correctly across multiple pages", async () => {
      await createPage("page-x", "Page X", "# Page X\n\nContent.");
      await createPage("page-y", "Page Y", "# Page Y\n\nContent.");

      // Alice edits both pages
      await saveRevision("page-x", "# Page X\n\nv1", "alice");
      await saveRevision("page-x", "# Page X\n\nv2", "alice");
      await saveRevision("page-y", "# Page Y\n\nv1", "alice");

      const profile = await buildContributorProfile("alice");
      expect(profile.handle).toBe("alice");
      expect(profile.editCount).toBe(3);
      expect(profile.pagesEdited).toBe(2);
    });

    it("counts talk comments and threads", async () => {
      await ensureDirectories();

      // Create a thread (alice creates it — 1 thread, 1 comment)
      await createThread("some-page", "Discussion", "alice", "Initial post");

      // Bob adds a comment (1 comment, 0 threads)
      await addComment("some-page", 0, "bob", "Reply to alice");

      // Alice adds another comment (now 2 comments total)
      await addComment("some-page", 0, "alice", "Follow-up");

      const aliceProfile = await buildContributorProfile("alice");
      expect(aliceProfile.commentCount).toBe(2);
      expect(aliceProfile.threadsCreated).toBe(1);

      const bobProfile = await buildContributorProfile("bob");
      expect(bobProfile.commentCount).toBe(1);
      expect(bobProfile.threadsCreated).toBe(0);
    });

    it("returns a zeroed-out profile for unknown handle", async () => {
      await ensureDirectories();
      const profile = await buildContributorProfile("nobody");
      expect(profile.handle).toBe("nobody");
      expect(profile.editCount).toBe(0);
      expect(profile.pagesEdited).toBe(0);
      expect(profile.commentCount).toBe(0);
      expect(profile.threadsCreated).toBe(0);
      expect(profile.revertCount).toBe(0);
      expect(profile.trustScore).toBe(0);
    });
  });

  describe("trust score", () => {
    it("caps at 1.0 for prolific contributors", async () => {
      await createPage("page-trust", "Trust Page", "# Trust\n\nContent.");

      // Create 60 revisions by "prolific" (well above the /50 threshold)
      for (let i = 0; i < 60; i++) {
        await saveRevision("page-trust", `# Trust\n\nv${i}`, "prolific");
      }

      const profile = await buildContributorProfile("prolific");
      expect(profile.editCount).toBe(60);
      expect(profile.trustScore).toBe(1);
    });

    it("computes trust proportionally for low activity", async () => {
      await createPage("page-low", "Low Page", "# Low\n\nContent.");

      // 10 edits → trust = min(1, 10/50) = 0.2
      for (let i = 0; i < 10; i++) {
        await saveRevision("page-low", `# Low\n\nv${i}`, "newcomer");
      }

      const profile = await buildContributorProfile("newcomer");
      expect(profile.editCount).toBe(10);
      expect(profile.trustScore).toBeCloseTo(0.2);
    });

    it("includes comment count in trust calculation", async () => {
      await ensureDirectories();

      // 5 comments, 0 edits → trust = min(1, 5/50) = 0.1
      await createThread("discuss-page", "Thread 1", "commenter", "post 1");
      await addComment("discuss-page", 0, "commenter", "post 2");
      await addComment("discuss-page", 0, "commenter", "post 3");
      await addComment("discuss-page", 0, "commenter", "post 4");
      await addComment("discuss-page", 0, "commenter", "post 5");

      const profile = await buildContributorProfile("commenter");
      expect(profile.commentCount).toBe(5);
      expect(profile.editCount).toBe(0);
      expect(profile.trustScore).toBeCloseTo(0.1);
    });
  });

  describe("firstSeen and lastSeen", () => {
    it("reflects actual date range from revisions", async () => {
      await createPage("page-dates", "Dates", "# Dates\n\nContent.");

      // Create revisions with known timestamps by writing files directly
      const revisionsDir = path.join(process.env.WIKI_DIR!, ".revisions", "page-dates");
      await fs.mkdir(revisionsDir, { recursive: true });

      const earlyTs = 1700000000000; // 2023-11-14
      const lateTs  = 1800000000000; // 2027-01-15

      await fs.writeFile(path.join(revisionsDir, `${earlyTs}.md`), "v1", "utf-8");
      await fs.writeFile(
        path.join(revisionsDir, `${earlyTs}.meta.json`),
        JSON.stringify({ author: "timekeeper" }),
        "utf-8",
      );

      await fs.writeFile(path.join(revisionsDir, `${lateTs}.md`), "v2", "utf-8");
      await fs.writeFile(
        path.join(revisionsDir, `${lateTs}.meta.json`),
        JSON.stringify({ author: "timekeeper" }),
        "utf-8",
      );

      const profile = await buildContributorProfile("timekeeper");
      expect(profile.firstSeen).toBe(new Date(earlyTs).toISOString());
      expect(profile.lastSeen).toBe(new Date(lateTs).toISOString());
    });

    it("uses epoch for unknown handle with no activity", async () => {
      await ensureDirectories();
      const profile = await buildContributorProfile("ghost");
      expect(profile.firstSeen).toBe(new Date(0).toISOString());
      expect(profile.lastSeen).toBe(new Date(0).toISOString());
    });
  });

  describe("revert detection", () => {
    it("contributor with no reverts gets full trust score", async () => {
      await createPage("page-norevert", "No Revert", "# No Revert\n\nContent.");

      // Alice makes several edits, no one reverts
      for (let i = 0; i < 10; i++) {
        await saveRevision("page-norevert", `# No Revert\n\nv${i} ${"x".repeat(100)}`, "alice");
      }

      const profile = await buildContributorProfile("alice");
      expect(profile.revertCount).toBe(0);
      // trust = min(1, 10/50) * (1 - min(0.5, 0*0.1)) = 0.2 * 1 = 0.2
      expect(profile.trustScore).toBeCloseTo(0.2);
    });

    it("contributor whose content was reverted gets reduced trust score", async () => {
      await createPage("page-reverted", "Reverted", "# Reverted\n\nContent.");

      // Alice writes a long revision
      await saveRevision("page-reverted", "# Reverted\n\n" + "x".repeat(1000), "alice");
      // Bob substantially reduces it (>50% reduction = revert of alice)
      await saveRevision("page-reverted", "# Reverted\n\nShort.", "bob");

      const aliceProfile = await buildContributorProfile("alice");
      expect(aliceProfile.revertCount).toBe(1);
      // trust = min(1, 1/50) * (1 - min(0.5, 1*0.1)) = 0.02 * 0.9 = 0.018
      expect(aliceProfile.trustScore).toBeCloseTo(0.018);

      // Bob should have 0 reverts (his content wasn't reverted)
      const bobProfile = await buildContributorProfile("bob");
      expect(bobProfile.revertCount).toBe(0);
    });

    it("revert detection only triggers when different author reverts", async () => {
      await createPage("page-self", "Self Edit", "# Self\n\nContent.");

      // Alice writes a long revision then shortens it herself
      await saveRevision("page-self", "# Self\n\n" + "x".repeat(1000), "alice");
      await saveRevision("page-self", "# Self\n\nShort.", "alice");

      const profile = await buildContributorProfile("alice");
      // Same author reducing own content is NOT a revert
      expect(profile.revertCount).toBe(0);
    });

    it("revert detection requires >50% size reduction", async () => {
      await createPage("page-small-edit", "Small Edit", "# Small\n\nContent.");

      // Alice writes 100 chars
      await saveRevision("page-small-edit", "# Small\n\n" + "x".repeat(100), "alice");
      // Bob trims only 30% (not enough to count as revert)
      await saveRevision("page-small-edit", "# Small\n\n" + "x".repeat(77), "bob");

      const profile = await buildContributorProfile("alice");
      expect(profile.revertCount).toBe(0);
    });

    it("multiple reverts accumulate and cap trust penalty at 50%", async () => {
      await createPage("page-multi", "Multi Revert", "# Multi\n\nContent.");

      // Alice writes and bob reverts 6 times (above the 5-revert cap)
      for (let i = 0; i < 6; i++) {
        await saveRevision("page-multi", `# Multi\n\n${"x".repeat(1000)} round ${i}`, "alice");
        await saveRevision("page-multi", "# Multi\n\nReverted.", "bob");
      }

      const aliceProfile = await buildContributorProfile("alice");
      expect(aliceProfile.revertCount).toBe(6);
      // trust = min(1, 6/50) * (1 - min(0.5, 6*0.1)) = 0.12 * 0.5 = 0.06
      // (penalty capped at 0.5 even though 6*0.1 = 0.6)
      expect(aliceProfile.trustScore).toBeCloseTo(0.06);
    });

    it("revert counts show up in listContributors", async () => {
      await createPage("page-list", "List Test", "# List\n\nContent.");

      // Alice writes, bob reverts
      await saveRevision("page-list", "# List\n\n" + "x".repeat(500), "alice");
      await saveRevision("page-list", "# List\n\nShort.", "bob");

      const contributors = await listContributors();
      const alice = contributors.find(c => c.handle === "alice");
      const bob = contributors.find(c => c.handle === "bob");

      expect(alice).toBeDefined();
      expect(alice!.revertCount).toBe(1);
      expect(bob).toBeDefined();
      expect(bob!.revertCount).toBe(0);
    });
  });
});
