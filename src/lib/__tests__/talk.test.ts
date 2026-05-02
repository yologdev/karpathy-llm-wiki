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
});
