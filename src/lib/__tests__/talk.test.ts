import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  getDiscussDir,
  ensureDiscussDir,
  listThreads,
  getThread,
  createThread,
  addComment,
  resolveThread,
  deleteDiscussions,
  getDiscussionStats,
  getDiscussionStatsForSlugs,
  _resetTimestamp,
} from "../talk";
import { _resetLocks } from "../lock";

let tmpDir: string;
let originalDataDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "talk-test-"));
  originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tmpDir;
  _resetTimestamp();
  _resetLocks();
});

afterEach(async () => {
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("talk page data layer", () => {
  describe("ensureDiscussDir", () => {
    it("creates the discuss directory", async () => {
      await ensureDiscussDir();
      const dir = getDiscussDir();
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("createThread", () => {
    it("creates a thread with one comment, status open, correct pageSlug", async () => {
      const thread = await createThread("test-page", "My Question", "alice", "What is this?");

      expect(thread.pageSlug).toBe("test-page");
      expect(thread.title).toBe("My Question");
      expect(thread.status).toBe("open");
      expect(thread.comments).toHaveLength(1);
      expect(thread.comments[0].author).toBe("alice");
      expect(thread.comments[0].body).toBe("What is this?");
      expect(thread.comments[0].parentId).toBeNull();
      expect(thread.created).toBe(thread.updated);
    });

    it("persists thread to disk", async () => {
      await createThread("persist-page", "Thread", "bob", "Hello");
      const threads = await listThreads("persist-page");
      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe("Thread");
    });
  });

  describe("addComment", () => {
    it("adds a comment and updates the thread timestamp", async () => {
      await createThread("comment-page", "Topic", "alice", "First comment");

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));

      const comment = await addComment("comment-page", 0, "bob", "Second comment");
      expect(comment.author).toBe("bob");
      expect(comment.body).toBe("Second comment");
      expect(comment.parentId).toBeNull();

      const thread = await getThread("comment-page", 0);
      expect(thread).not.toBeNull();
      expect(thread!.comments).toHaveLength(2);
      // updated should be different from created (new activity)
      expect(thread!.updated).not.toBe(thread!.created);
    });

    it("adds a threaded reply with parentId", async () => {
      const thread = await createThread("thread-page", "Topic", "alice", "Root");
      const parentId = thread.comments[0].id;

      const reply = await addComment("thread-page", 0, "bob", "Reply", parentId);
      expect(reply.parentId).toBe(parentId);

      const updated = await getThread("thread-page", 0);
      expect(updated!.comments[1].parentId).toBe(parentId);
    });

    it("supports multi-level nested replies", async () => {
      const thread = await createThread("nested-page", "Deep Thread", "alice", "Root comment");
      const rootId = thread.comments[0].id;

      // Level 1 reply
      const level1 = await addComment("nested-page", 0, "bob", "Reply to root", rootId);
      expect(level1.parentId).toBe(rootId);

      // Level 2 reply (reply to the reply)
      const level2 = await addComment("nested-page", 0, "carol", "Reply to bob", level1.id);
      expect(level2.parentId).toBe(level1.id);

      // Verify the full thread preserves the nesting chain
      const updated = await getThread("nested-page", 0);
      expect(updated!.comments).toHaveLength(3);
      expect(updated!.comments[0].parentId).toBeNull();       // root
      expect(updated!.comments[1].parentId).toBe(rootId);     // reply to root
      expect(updated!.comments[2].parentId).toBe(level1.id);  // reply to reply
    });

    it("throws for invalid thread index", async () => {
      await ensureDiscussDir();
      await expect(
        addComment("no-threads", 0, "alice", "oops"),
      ).rejects.toThrow(/thread index 0 not found/);
    });
  });

  describe("resolveThread", () => {
    it("changes thread status to resolved", async () => {
      await createThread("resolve-page", "Bug", "alice", "Something is wrong");

      const resolved = await resolveThread("resolve-page", 0, "resolved");
      expect(resolved.status).toBe("resolved");

      // Persisted
      const thread = await getThread("resolve-page", 0);
      expect(thread!.status).toBe("resolved");
    });

    it("changes thread status to wontfix", async () => {
      await createThread("wontfix-page", "Feature", "alice", "Add X");

      const fixed = await resolveThread("wontfix-page", 0, "wontfix");
      expect(fixed.status).toBe("wontfix");
    });

    it("throws for invalid thread index", async () => {
      await createThread("resolve-err", "Topic", "alice", "body");
      await expect(
        resolveThread("resolve-err", 99, "resolved"),
      ).rejects.toThrow(/thread index 99 not found/);
    });
  });

  describe("listThreads", () => {
    it("returns empty array for page with no discussions", async () => {
      const threads = await listThreads("nonexistent-page");
      expect(threads).toEqual([]);
    });

    it("returns all threads for a page with multiple threads", async () => {
      await createThread("multi-page", "Thread 1", "alice", "First");
      await createThread("multi-page", "Thread 2", "bob", "Second");
      await createThread("multi-page", "Thread 3", "carol", "Third");

      const threads = await listThreads("multi-page");
      expect(threads).toHaveLength(3);
      expect(threads[0].title).toBe("Thread 1");
      expect(threads[1].title).toBe("Thread 2");
      expect(threads[2].title).toBe("Thread 3");
    });
  });

  describe("getThread", () => {
    it("returns null for out-of-bounds index", async () => {
      await createThread("get-page", "Thread", "alice", "Hi");
      const result = await getThread("get-page", 5);
      expect(result).toBeNull();
    });

    it("returns null for nonexistent page", async () => {
      const result = await getThread("nope", 0);
      expect(result).toBeNull();
    });
  });

  describe("deleteDiscussions", () => {
    it("removes all discussions for a page", async () => {
      await createThread("delete-page", "Thread", "alice", "Hi");
      // Verify file exists
      const filePath = path.join(getDiscussDir(), "delete-page.json");
      await expect(fs.stat(filePath)).resolves.toBeDefined();

      await deleteDiscussions("delete-page");

      // File should be gone
      await expect(fs.stat(filePath)).rejects.toThrow();
      // Listing should return empty
      const threads = await listThreads("delete-page");
      expect(threads).toEqual([]);
    });

    it("does not throw for nonexistent page", async () => {
      await expect(deleteDiscussions("no-such-page")).resolves.toBeUndefined();
    });
  });

  describe("concurrent writes", () => {
    it("withFileLock prevents data corruption on parallel writes", async () => {
      await createThread("concurrent-page", "Initial", "alice", "start");

      // Fire off multiple comments in parallel
      const promises = Array.from({ length: 10 }, (_, i) =>
        addComment("concurrent-page", 0, `user-${i}`, `comment ${i}`),
      );
      await Promise.all(promises);

      const thread = await getThread("concurrent-page", 0);
      expect(thread).not.toBeNull();
      // 1 initial + 10 concurrent = 11 total
      expect(thread!.comments).toHaveLength(11);

      // All comment IDs should be unique
      const ids = thread!.comments.map((c) => c.id);
      expect(new Set(ids).size).toBe(11);
    });
  });

  describe("getDiscussionStats", () => {
    it("returns { total: 0, open: 0 } when no discuss file exists", async () => {
      const stats = await getDiscussionStats("nonexistent-page");
      expect(stats).toEqual({ total: 0, open: 0 });
    });

    it("returns correct counts with a mix of open/resolved/wontfix threads", async () => {
      // Create 3 threads: 2 open, 1 resolved, then resolve one more as wontfix
      await createThread("stats-page", "Thread 1", "alice", "Open");
      await createThread("stats-page", "Thread 2", "bob", "Will resolve");
      await createThread("stats-page", "Thread 3", "carol", "Will wontfix");

      await resolveThread("stats-page", 1, "resolved");
      await resolveThread("stats-page", 2, "wontfix");

      const stats = await getDiscussionStats("stats-page");
      expect(stats.total).toBe(3);
      expect(stats.open).toBe(1); // only Thread 1 is still open
    });

    it("counts all threads as open when none are resolved", async () => {
      await createThread("all-open", "A", "alice", "body");
      await createThread("all-open", "B", "bob", "body");

      const stats = await getDiscussionStats("all-open");
      expect(stats).toEqual({ total: 2, open: 2 });
    });
  });

  describe("getDiscussionStatsForSlugs", () => {
    it("returns a map with correct per-slug stats", async () => {
      // Page A: 2 threads, 1 open
      await createThread("page-a", "A1", "alice", "open");
      await createThread("page-a", "A2", "alice", "resolved");
      await resolveThread("page-a", 1, "resolved");

      // Page B: 1 thread, all open
      await createThread("page-b", "B1", "bob", "open");

      // Page C: no threads (doesn't exist)

      const stats = await getDiscussionStatsForSlugs([
        "page-a",
        "page-b",
        "page-c",
      ]);

      expect(stats.get("page-a")).toEqual({ total: 2, open: 1 });
      expect(stats.get("page-b")).toEqual({ total: 1, open: 1 });
      expect(stats.get("page-c")).toEqual({ total: 0, open: 0 });
    });

    it("returns all zeros when discuss directory does not exist", async () => {
      // Don't create any discussions — the discuss/ dir shouldn't exist
      const stats = await getDiscussionStatsForSlugs(["x", "y"]);
      expect(stats.get("x")).toEqual({ total: 0, open: 0 });
      expect(stats.get("y")).toEqual({ total: 0, open: 0 });
    });

    it("ignores discuss files for slugs not in the requested list", async () => {
      await createThread("included", "T", "alice", "body");
      await createThread("excluded", "T", "bob", "body");

      const stats = await getDiscussionStatsForSlugs(["included"]);
      expect(stats.has("included")).toBe(true);
      expect(stats.has("excluded")).toBe(false);
      expect(stats.get("included")).toEqual({ total: 1, open: 1 });
    });
  });
});
