import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FilesystemStorageProvider } from "../storage/filesystem";

describe("FilesystemStorageProvider", () => {
  let tmpDir: string;
  let provider: FilesystemStorageProvider;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "yopedia-storage-test-"));
    provider = new FilesystemStorageProvider(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Text files
  // -------------------------------------------------------------------------

  describe("readFile / writeFile", () => {
    it("round-trips text content", async () => {
      await provider.writeFile("hello.txt", "world");
      const content = await provider.readFile("hello.txt");
      expect(content).toBe("world");
    });

    it("creates parent directories automatically", async () => {
      await provider.writeFile("a/b/c/deep.md", "nested");
      const content = await provider.readFile("a/b/c/deep.md");
      expect(content).toBe("nested");
    });

    it("overwrites existing files", async () => {
      await provider.writeFile("file.txt", "v1");
      await provider.writeFile("file.txt", "v2");
      expect(await provider.readFile("file.txt")).toBe("v2");
    });

    it("throws on reading non-existent file", async () => {
      await expect(provider.readFile("nope.txt")).rejects.toThrow();
    });
  });

  describe("deleteFile", () => {
    it("removes an existing file", async () => {
      await provider.writeFile("del.txt", "bye");
      await provider.deleteFile("del.txt");
      expect(await provider.fileExists("del.txt")).toBe(false);
    });

    it("throws on deleting a non-existent file", async () => {
      await expect(provider.deleteFile("nope.txt")).rejects.toThrow();
    });
  });

  describe("listFiles", () => {
    it("returns files and directories", async () => {
      await provider.writeFile("dir/a.md", "a");
      await provider.writeFile("dir/b.md", "b");
      await provider.writeFile("dir/sub/c.md", "c");

      const entries = await provider.listFiles("dir");
      const names = entries.map((e) => e.name).sort();
      expect(names).toEqual(["a.md", "b.md", "sub"]);

      const subDir = entries.find((e) => e.name === "sub");
      expect(subDir?.isDirectory).toBe(true);

      const file = entries.find((e) => e.name === "a.md");
      expect(file?.isDirectory).toBe(false);
    });

    it("returns empty array for non-existent directory", async () => {
      const entries = await provider.listFiles("nope");
      expect(entries).toEqual([]);
    });
  });

  describe("fileExists", () => {
    it("returns true for existing files", async () => {
      await provider.writeFile("exists.txt", "yes");
      expect(await provider.fileExists("exists.txt")).toBe(true);
    });

    it("returns false for non-existent files", async () => {
      expect(await provider.fileExists("nope.txt")).toBe(false);
    });
  });

  describe("appendFile", () => {
    it("creates a new file if it does not exist", async () => {
      await provider.appendFile("log.md", "line1\n");
      expect(await provider.readFile("log.md")).toBe("line1\n");
    });

    it("appends to an existing file", async () => {
      await provider.writeFile("log.md", "line1\n");
      await provider.appendFile("log.md", "line2\n");
      expect(await provider.readFile("log.md")).toBe("line1\nline2\n");
    });

    it("creates parent directories", async () => {
      await provider.appendFile("deep/nested/log.md", "content");
      expect(await provider.readFile("deep/nested/log.md")).toBe("content");
    });
  });

  describe("stat", () => {
    it("returns correct size and lastModified", async () => {
      const content = "hello world";
      await provider.writeFile("stat.txt", content);
      const info = await provider.stat("stat.txt");
      expect(info.size).toBe(Buffer.byteLength(content, "utf-8"));
      expect(info.lastModified).toBeInstanceOf(Date);
      // Should be recent
      expect(Date.now() - info.lastModified.getTime()).toBeLessThan(5000);
    });

    it("throws on non-existent file", async () => {
      await expect(provider.stat("nope.txt")).rejects.toThrow();
    });
  });

  describe("deleteDirectory", () => {
    it("removes a directory recursively", async () => {
      await provider.writeFile("rm-dir/a.md", "a");
      await provider.writeFile("rm-dir/sub/b.md", "b");
      await provider.deleteDirectory("rm-dir");
      expect(await provider.fileExists("rm-dir/a.md")).toBe(false);
      expect(await provider.fileExists("rm-dir")).toBe(false);
    });

    it("is a no-op for non-existent directory", async () => {
      // Should not throw
      await provider.deleteDirectory("nope-dir");
    });
  });

  // -------------------------------------------------------------------------
  // Assets (binary)
  // -------------------------------------------------------------------------

  describe("writeAsset / readAsset", () => {
    it("round-trips binary data", async () => {
      const data = new Uint8Array([0, 1, 2, 255, 128, 64]);
      await provider.writeAsset("img.bin", data.buffer as ArrayBuffer);
      const result = await provider.readAsset("img.bin");
      const resultArr = new Uint8Array(result);
      expect(resultArr).toEqual(data);
    });

    it("creates parent directories for assets", async () => {
      const data = new Uint8Array([42]).buffer as ArrayBuffer;
      await provider.writeAsset("assets/deep/pic.png", data);
      const result = await provider.readAsset("assets/deep/pic.png");
      expect(new Uint8Array(result)[0]).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // Optimistic concurrency
  // -------------------------------------------------------------------------

  describe("readFileWithEtag", () => {
    it("returns content and a consistent etag", async () => {
      await provider.writeFile("etag.txt", "v1");
      const result = await provider.readFileWithEtag("etag.txt");
      expect(result.content).toBe("v1");
      expect(typeof result.etag).toBe("string");
      expect(result.etag.length).toBeGreaterThan(0);

      // Same content, same etag (no modifications)
      const result2 = await provider.readFileWithEtag("etag.txt");
      expect(result2.etag).toBe(result.etag);
    });
  });

  describe("writeFileIfMatch", () => {
    it("succeeds when etag matches", async () => {
      await provider.writeFile("cas.txt", "v1");
      const { etag } = await provider.readFileWithEtag("cas.txt");
      const ok = await provider.writeFileIfMatch("cas.txt", "v2", etag);
      expect(ok).toBe(true);
      expect(await provider.readFile("cas.txt")).toBe("v2");
    });

    it("fails when etag does not match", async () => {
      await provider.writeFile("cas.txt", "v1");
      const ok = await provider.writeFileIfMatch("cas.txt", "v2", "bogus-etag");
      expect(ok).toBe(false);
      // Original content unchanged
      expect(await provider.readFile("cas.txt")).toBe("v1");
    });

    it("fails for non-existent file", async () => {
      const ok = await provider.writeFileIfMatch("nope.txt", "v1", "any");
      expect(ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Derived indexes
  // -------------------------------------------------------------------------

  describe("getIndex / putIndex", () => {
    it("round-trips a JSON object", async () => {
      const data = { name: "test", items: [1, 2, 3] };
      await provider.putIndex("mykey", data);
      const result = await provider.getIndex("mykey");
      expect(result).toEqual(data);
    });

    it("returns null for non-existent key", async () => {
      const result = await provider.getIndex("nope");
      expect(result).toBeNull();
    });

    it("overwrites existing index", async () => {
      await provider.putIndex("k", { v: 1 });
      await provider.putIndex("k", { v: 2 });
      expect(await provider.getIndex("k")).toEqual({ v: 2 });
    });

    it("stores indexes in .indexes directory", async () => {
      await provider.putIndex("config", { ok: true });
      const abs = path.join(tmpDir, ".indexes", "config.json");
      const raw = await fs.readFile(abs, "utf-8");
      expect(JSON.parse(raw)).toEqual({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  // Embeddings
  // -------------------------------------------------------------------------

  describe("upsertEmbedding + queryEmbeddings", () => {
    it("returns nearest neighbors sorted by score", async () => {
      // Simple 2D vectors for easy reasoning
      await provider.upsertEmbedding("a", [1, 0], { label: "right" });
      await provider.upsertEmbedding("b", [0, 1], { label: "up" });
      await provider.upsertEmbedding("c", [1, 1], { label: "diagonal" });

      // Query with [1, 0] — should match "a" best, then "c", then "b"
      const results = await provider.queryEmbeddings([1, 0], 3);
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe("a");
      expect(results[0].score).toBeCloseTo(1.0);
      expect(results[0].metadata.label).toBe("right");

      expect(results[1].id).toBe("c");
      // cos([1,0], [1,1]) = 1/sqrt(2) ≈ 0.707
      expect(results[1].score).toBeCloseTo(1 / Math.sqrt(2));

      expect(results[2].id).toBe("b");
      expect(results[2].score).toBeCloseTo(0);
    });

    it("respects topK limit", async () => {
      await provider.upsertEmbedding("a", [1, 0], {});
      await provider.upsertEmbedding("b", [0, 1], {});
      await provider.upsertEmbedding("c", [1, 1], {});

      const results = await provider.queryEmbeddings([1, 0], 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("a");
    });

    it("updates existing embedding on upsert", async () => {
      await provider.upsertEmbedding("a", [1, 0], { v: "1" });
      await provider.upsertEmbedding("a", [0, 1], { v: "2" });

      const results = await provider.queryEmbeddings([0, 1], 1);
      expect(results[0].id).toBe("a");
      expect(results[0].metadata.v).toBe("2");
      expect(results[0].score).toBeCloseTo(1.0);
    });

    it("returns empty array when no embeddings exist", async () => {
      const results = await provider.queryEmbeddings([1, 0], 5);
      expect(results).toEqual([]);
    });
  });

  describe("removeEmbedding", () => {
    it("removes an embedding by id", async () => {
      await provider.upsertEmbedding("a", [1, 0], {});
      await provider.upsertEmbedding("b", [0, 1], {});

      await provider.removeEmbedding("a");
      const results = await provider.queryEmbeddings([1, 0], 10);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("b");
    });

    it("is a no-op for non-existent id", async () => {
      await provider.upsertEmbedding("a", [1, 0], {});
      await provider.removeEmbedding("nonexistent");
      const results = await provider.queryEmbeddings([1, 0], 10);
      expect(results).toHaveLength(1);
    });
  });
});
