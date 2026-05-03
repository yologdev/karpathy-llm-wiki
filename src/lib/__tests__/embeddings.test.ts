import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Mock the `ai` module so we never hit real API endpoints
vi.mock("ai", () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));

// Mock `loadConfigSync` from config so we can control config values per test.
// The actual module does fs reads — we need a controllable mock.
vi.mock("../config", async () => {
  const actual = await vi.importActual<typeof import("../config")>("../config");
  return {
    ...actual,
    loadConfigSync: vi.fn(() => ({})),
  };
});

// Mock wiki module for rebuildVectorStore tests
vi.mock("../wiki", async () => {
  const actual = await vi.importActual<typeof import("../wiki")>("../wiki");
  return {
    ...actual,
    listWikiPages: vi.fn(actual.listWikiPages),
    readWikiPage: vi.fn(actual.readWikiPage),
  };
});

import { embed, embedMany } from "ai";
import {
  cosineSimilarity,
  contentHash,
  hasEmbeddingSupport,
  getEmbeddingModelName,
  getEmbeddingModel,
  loadVectorStore,
  saveVectorStore,
  upsertEmbedding,
  removeEmbedding,
  searchByVector,
  embedText,
  embedTexts,
  rebuildVectorStore,
  type VectorStore,
} from "../embeddings";
import { loadConfigSync } from "../config";
import { listWikiPages, readWikiPage } from "../wiki";

// Cast for convenience
const mockLoadConfigSync = loadConfigSync as ReturnType<typeof vi.fn>;
const mockListWikiPages = listWikiPages as ReturnType<typeof vi.fn>;
const mockReadWikiPage = readWikiPage as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Env var save/restore — keep tests isolated
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "EMBEDDING_MODEL",
  "WIKI_DIR",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  vi.clearAllMocks();
  // Default: config returns empty (no config file)
  mockLoadConfigSync.mockReturnValue({});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// Cast for convenience
const mockEmbed = embed as ReturnType<typeof vi.fn>;
const mockEmbedMany = embedMany as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// cosineSimilarity — pure math
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
  });

  it("returns -1.0 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10);
  });

  it("handles zero vectors gracefully", () => {
    const zero = [0, 0, 0];
    const v = [1, 2, 3];
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(v, zero)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
      /dimension mismatch/i,
    );
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("computes correctly for non-unit vectors", () => {
    // cos(45°) ≈ 0.7071
    const a = [1, 0];
    const b = [1, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 5);
  });
});

// ---------------------------------------------------------------------------
// hasEmbeddingSupport / getEmbeddingModelName
// ---------------------------------------------------------------------------

describe("hasEmbeddingSupport", () => {
  it("returns false when no keys configured", () => {
    expect(hasEmbeddingSupport()).toBe(false);
  });

  it("returns false when only Anthropic key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(hasEmbeddingSupport()).toBe(false);
  });

  it("returns true when OpenAI key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(hasEmbeddingSupport()).toBe(true);
  });

  it("returns true when Google key is set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test";
    expect(hasEmbeddingSupport()).toBe(true);
  });

  it("returns true when Ollama is configured", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/api";
    expect(hasEmbeddingSupport()).toBe(true);
  });

  it("returns true when OLLAMA_MODEL is set", () => {
    process.env.OLLAMA_MODEL = "llama3.2";
    expect(hasEmbeddingSupport()).toBe(true);
  });
});

describe("getEmbeddingModelName", () => {
  it("returns null when no provider configured", () => {
    expect(getEmbeddingModelName()).toBeNull();
  });

  it("returns null when only Anthropic is configured", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(getEmbeddingModelName()).toBeNull();
  });

  it("returns OpenAI default model", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getEmbeddingModelName()).toBe("text-embedding-3-small");
  });

  it("returns Google default model", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test";
    expect(getEmbeddingModelName()).toBe("gemini-embedding-001");
  });

  it("returns Ollama default model", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/api";
    expect(getEmbeddingModelName()).toBe("nomic-embed-text");
  });

  it("respects EMBEDDING_MODEL override", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.EMBEDDING_MODEL = "text-embedding-3-large";
    expect(getEmbeddingModelName()).toBe("text-embedding-3-large");
  });

  it("prefers OpenAI over Google when both present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test";
    expect(getEmbeddingModelName()).toBe("text-embedding-3-small");
  });

  it("uses config embeddingModel when env provider is set but EMBEDDING_MODEL env var is not", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockLoadConfigSync.mockReturnValue({ embeddingModel: "text-embedding-3-large" });
    expect(getEmbeddingModelName()).toBe("text-embedding-3-large");
  });

  it("EMBEDDING_MODEL env var still beats config embeddingModel with env provider", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.EMBEDDING_MODEL = "custom-env-model";
    mockLoadConfigSync.mockReturnValue({ embeddingModel: "text-embedding-3-large" });
    expect(getEmbeddingModelName()).toBe("custom-env-model");
  });
});

// ---------------------------------------------------------------------------
// embedText / embedTexts — return null when no provider
// ---------------------------------------------------------------------------

describe("embedText / embedTexts without provider", () => {
  it("embedText returns null when no provider is configured", async () => {
    expect(await embedText("hello")).toBeNull();
  });

  it("embedTexts returns null when no provider is configured", async () => {
    expect(await embedTexts(["hello", "world"])).toBeNull();
  });
});

describe("embedText / embedTexts with mocked provider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
  });

  it("embedText returns the embedding from the AI SDK", async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    const result = await embedText("hello");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockEmbed).toHaveBeenCalledOnce();
  });

  it("embedTexts returns embeddings from the AI SDK", async () => {
    mockEmbedMany.mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    });

    const result = await embedTexts(["hello", "world"]);
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(mockEmbedMany).toHaveBeenCalledOnce();
  });

  it("embedText truncates text longer than MAX_EMBED_CHARS", async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    // Create a string longer than MAX_EMBED_CHARS (24_000)
    const longText = "a".repeat(30_000);
    await embedText(longText);

    expect(mockEmbed).toHaveBeenCalledOnce();
    // Inspect the `value` arg passed to embed()
    const callArgs = mockEmbed.mock.calls[0][0];
    expect(callArgs.value.length).toBe(24_000);
  });

  it("embedText does not truncate text shorter than MAX_EMBED_CHARS", async () => {
    mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    const shortText = "hello world";
    await embedText(shortText);

    const callArgs = mockEmbed.mock.calls[0][0];
    expect(callArgs.value).toBe(shortText);
  });

  it("embedTexts truncates each text longer than MAX_EMBED_CHARS", async () => {
    mockEmbedMany.mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
    });

    const longText = "b".repeat(30_000);
    const shortText = "short";
    await embedTexts([longText, shortText]);

    expect(mockEmbedMany).toHaveBeenCalledOnce();
    const callArgs = mockEmbedMany.mock.calls[0][0];
    expect(callArgs.values[0].length).toBe(24_000);
    expect(callArgs.values[1]).toBe(shortText);
  });
});

// ---------------------------------------------------------------------------
// Vector store persistence — round-trip to tmp dir
// ---------------------------------------------------------------------------

describe("vector store persistence", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
    process.env.WIKI_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loadVectorStore returns null when no file exists", async () => {
    expect(await loadVectorStore()).toBeNull();
  });

  it("round-trips a vector store to disk", async () => {
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [
        {
          slug: "test-page",
          embedding: [0.1, 0.2, 0.3],
          contentHash: "abc123",
        },
        {
          slug: "another-page",
          embedding: [0.4, 0.5, 0.6],
          contentHash: "def456",
        },
      ],
    };

    await saveVectorStore(store);
    const loaded = await loadVectorStore();

    expect(loaded).not.toBeNull();
    expect(loaded!.model).toBe("text-embedding-3-small");
    expect(loaded!.entries).toHaveLength(2);
    expect(loaded!.entries[0].slug).toBe("test-page");
    expect(loaded!.entries[0].embedding).toEqual([0.1, 0.2, 0.3]);
    expect(loaded!.entries[1].slug).toBe("another-page");
  });

  it("saveVectorStore creates the wiki directory if needed", async () => {
    const nestedDir = path.join(tmpDir, "nested", "wiki");
    process.env.WIKI_DIR = nestedDir;

    const store: VectorStore = {
      model: "test-model",
      entries: [],
    };

    await saveVectorStore(store);
    const loaded = await loadVectorStore();
    expect(loaded).not.toBeNull();
    expect(loaded!.model).toBe("test-model");
  });

  it("writes valid JSON and leaves no .tmp file behind", async () => {
    const store: VectorStore = {
      model: "atomic-test",
      entries: [
        { slug: "p1", embedding: [0.1], contentHash: "h1" },
      ],
    };

    await saveVectorStore(store);

    // The persisted file should be valid JSON
    const raw = await fs.readFile(
      path.join(tmpDir, ".vectors.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.model).toBe("atomic-test");
    expect(parsed.entries).toHaveLength(1);

    // No leftover .tmp file after a successful write
    const files = await fs.readdir(tmpDir);
    expect(files).not.toContain(".vectors.json.tmp");
  });
});

// ---------------------------------------------------------------------------
// removeEmbedding
// ---------------------------------------------------------------------------

describe("removeEmbedding", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
    process.env.WIKI_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("removes the correct slug from the store", async () => {
    const store: VectorStore = {
      model: "test-model",
      entries: [
        { slug: "keep-me", embedding: [1, 0], contentHash: "a" },
        { slug: "remove-me", embedding: [0, 1], contentHash: "b" },
        { slug: "also-keep", embedding: [1, 1], contentHash: "c" },
      ],
    };
    await saveVectorStore(store);

    await removeEmbedding("remove-me");

    const loaded = await loadVectorStore();
    expect(loaded!.entries).toHaveLength(2);
    expect(loaded!.entries.map((e) => e.slug)).toEqual([
      "keep-me",
      "also-keep",
    ]);
  });

  it("does nothing if the slug is not in the store", async () => {
    const store: VectorStore = {
      model: "test-model",
      entries: [{ slug: "existing", embedding: [1, 0], contentHash: "a" }],
    };
    await saveVectorStore(store);

    await removeEmbedding("nonexistent");

    const loaded = await loadVectorStore();
    expect(loaded!.entries).toHaveLength(1);
  });

  it("does nothing if the store does not exist", async () => {
    // Should not throw
    await removeEmbedding("whatever");
  });
});

// ---------------------------------------------------------------------------
// upsertEmbedding — with mocked embed function
// ---------------------------------------------------------------------------

describe("upsertEmbedding", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
    process.env.WIKI_DIR = tmpDir;
    process.env.OPENAI_API_KEY = "sk-test-key";
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips re-embedding when contentHash matches", async () => {
    const content = "hello world";
    const hash = contentHash(content);

    // Pre-seed the store with a matching hash
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [
        { slug: "test-page", embedding: [0.1, 0.2], contentHash: hash },
      ],
    };
    await saveVectorStore(store);

    await upsertEmbedding("test-page", content);

    // embed should NOT have been called since hash matches
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("clears all entries when model changes", async () => {
    // Store was created with a different model
    const store: VectorStore = {
      model: "old-model-v1",
      entries: [
        { slug: "page-a", embedding: [1, 0], contentHash: "aaa" },
        { slug: "page-b", embedding: [0, 1], contentHash: "bbb" },
      ],
    };
    await saveVectorStore(store);

    // Mock the AI SDK embed function
    mockEmbed.mockResolvedValue({ embedding: [0.5, 0.5] });

    await upsertEmbedding("new-page", "new content");

    const loaded = await loadVectorStore();
    expect(loaded!.model).toBe("text-embedding-3-small"); // current model
    // Old entries should be gone, only the new one remains
    expect(loaded!.entries).toHaveLength(1);
    expect(loaded!.entries[0].slug).toBe("new-page");
  });

  it("adds a new entry when slug is not in store", async () => {
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [
        { slug: "existing", embedding: [1, 0], contentHash: "aaa" },
      ],
    };
    await saveVectorStore(store);

    mockEmbed.mockResolvedValue({ embedding: [0.3, 0.7] });

    await upsertEmbedding("new-page", "some content");

    const loaded = await loadVectorStore();
    expect(loaded!.entries).toHaveLength(2);
    expect(loaded!.entries[1].slug).toBe("new-page");
    expect(loaded!.entries[1].embedding).toEqual([0.3, 0.7]);
  });

  it("updates an existing entry when content changes", async () => {
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [
        { slug: "my-page", embedding: [1, 0], contentHash: "old-hash" },
      ],
    };
    await saveVectorStore(store);

    mockEmbed.mockResolvedValue({ embedding: [0.9, 0.1] });

    await upsertEmbedding("my-page", "updated content");

    const loaded = await loadVectorStore();
    expect(loaded!.entries).toHaveLength(1);
    expect(loaded!.entries[0].slug).toBe("my-page");
    expect(loaded!.entries[0].embedding).toEqual([0.9, 0.1]);
    expect(loaded!.entries[0].contentHash).toBe(contentHash("updated content"));
  });

  it("does nothing when no embedding provider is available", async () => {
    delete process.env.OPENAI_API_KEY;

    // Should not throw and should not create a store
    await upsertEmbedding("test", "content");

    const loaded = await loadVectorStore();
    expect(loaded).toBeNull();
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("concurrent upserts don't clobber each other", async () => {
    process.env.OPENAI_API_KEY = "sk-test-concurrent";

    mockEmbed.mockResolvedValue({ embedding: [0.5, 0.5] });

    // Fire two upserts concurrently with different slugs
    await Promise.all([
      upsertEmbedding("page-alpha", "content alpha"),
      upsertEmbedding("page-beta", "content beta"),
    ]);

    const loaded = await loadVectorStore();
    expect(loaded).not.toBeNull();
    const slugs = loaded!.entries.map((e) => e.slug).sort();
    expect(slugs).toEqual(["page-alpha", "page-beta"]);
  });
});

// ---------------------------------------------------------------------------
// searchByVector — with pre-loaded store
// ---------------------------------------------------------------------------

describe("searchByVector", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
    process.env.WIKI_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no embedding support", async () => {
    // No provider keys set
    const results = await searchByVector("query", 5);
    expect(results).toEqual([]);
  });

  it("returns correct ranking order", async () => {
    // Pre-load a store with known embeddings
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [
        { slug: "low-match", embedding: [0, 1, 0], contentHash: "a" },
        { slug: "high-match", embedding: [1, 0, 0], contentHash: "b" },
        { slug: "mid-match", embedding: [0.7, 0.7, 0], contentHash: "c" },
      ],
    };
    await saveVectorStore(store);

    process.env.OPENAI_API_KEY = "sk-test";

    // Mock embed to return a query vector closest to high-match
    mockEmbed.mockResolvedValue({ embedding: [1, 0, 0] });

    const results = await searchByVector("test query", 10);

    expect(results).toHaveLength(3);
    expect(results[0].slug).toBe("high-match");
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[1].slug).toBe("mid-match");
    expect(results[2].slug).toBe("low-match");
    expect(results[2].score).toBeCloseTo(0.0, 5);
  });

  it("respects topK limit", async () => {
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [
        { slug: "a", embedding: [1, 0], contentHash: "a" },
        { slug: "b", embedding: [0.9, 0.1], contentHash: "b" },
        { slug: "c", embedding: [0.5, 0.5], contentHash: "c" },
      ],
    };
    await saveVectorStore(store);

    process.env.OPENAI_API_KEY = "sk-test";
    mockEmbed.mockResolvedValue({ embedding: [1, 0] });

    const results = await searchByVector("test", 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty array when store is empty", async () => {
    const store: VectorStore = {
      model: "text-embedding-3-small",
      entries: [],
    };
    await saveVectorStore(store);

    process.env.OPENAI_API_KEY = "sk-test";
    mockEmbed.mockResolvedValue({ embedding: [1, 0] });

    const results = await searchByVector("test", 5);
    expect(results).toEqual([]);
  });

  it("returns empty array when store model differs from current model", async () => {
    // Store was built with a different model than the current provider uses
    const store: VectorStore = {
      model: "old-model-from-different-provider",
      entries: [
        { slug: "page-a", embedding: [1, 0, 0], contentHash: "a" },
        { slug: "page-b", embedding: [0, 1, 0], contentHash: "b" },
      ],
    };
    await saveVectorStore(store);

    process.env.OPENAI_API_KEY = "sk-test";
    mockEmbed.mockResolvedValue({ embedding: [1, 0, 0] });

    const results = await searchByVector("test query", 10);

    // Should return empty because store model doesn't match current model
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// contentHash utility
// ---------------------------------------------------------------------------

describe("contentHash", () => {
  it("returns consistent hash for same content", () => {
    const h1 = contentHash("hello");
    const h2 = contentHash("hello");
    expect(h1).toBe(h2);
  });

  it("returns different hash for different content", () => {
    const h1 = contentHash("hello");
    const h2 = contentHash("world");
    expect(h1).not.toBe(h2);
  });

  it("returns a 16-char hex string (FNV-1a)", () => {
    const h = contentHash("test");
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// getEmbeddingModel — basic checks (no real API calls)
// ---------------------------------------------------------------------------

describe("getEmbeddingModel", () => {
  it("returns null when no provider configured", () => {
    expect(getEmbeddingModel()).toBeNull();
  });

  it("returns null when only Anthropic is configured", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(getEmbeddingModel()).toBeNull();
  });

  it("returns a model object when OpenAI is configured", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const model = getEmbeddingModel();
    expect(model).not.toBeNull();
  });

  it("returns a model object when Google is configured", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test";
    const model = getEmbeddingModel();
    expect(model).not.toBeNull();
  });

  it("returns a model object when Ollama is configured", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434/api";
    const model = getEmbeddingModel();
    expect(model).not.toBeNull();
  });

  it("uses config embeddingModel in env provider path when EMBEDDING_MODEL env var absent", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockLoadConfigSync.mockReturnValue({ embeddingModel: "text-embedding-3-large" });
    // Should use config embeddingModel, not the provider default
    const model = getEmbeddingModel();
    expect(model).not.toBeNull();
    // Verify the model name resolution matches
    expect(getEmbeddingModelName()).toBe("text-embedding-3-large");
  });

  it("uses config ollamaBaseUrl in env-detected Ollama path", () => {
    // Ollama detected via OLLAMA_MODEL env var (no OLLAMA_BASE_URL env var)
    process.env.OLLAMA_MODEL = "llama3.2";
    mockLoadConfigSync.mockReturnValue({ ollamaBaseUrl: "http://remote-ollama:11434/api" });
    const model = getEmbeddingModel();
    expect(model).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Config file fallback — embedding functions read config when env vars absent
// ---------------------------------------------------------------------------

describe("config file fallback for embeddings", () => {
  describe("getEmbeddingModelName", () => {
    it("returns OpenAI default when config has openai provider + apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "openai", apiKey: "sk-cfg-test" });
      expect(getEmbeddingModelName()).toBe("text-embedding-3-small");
    });

    it("returns Google default when config has google provider + apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "google", apiKey: "google-cfg-test" });
      expect(getEmbeddingModelName()).toBe("gemini-embedding-001");
    });

    it("returns Ollama default when config has ollama provider (no key needed)", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "ollama" });
      expect(getEmbeddingModelName()).toBe("nomic-embed-text");
    });

    it("returns config embeddingModel over provider default", () => {
      mockLoadConfigSync.mockReturnValue({
        provider: "openai",
        apiKey: "sk-cfg-test",
        embeddingModel: "text-embedding-3-large",
      });
      expect(getEmbeddingModelName()).toBe("text-embedding-3-large");
    });

    it("EMBEDDING_MODEL env var overrides config embeddingModel", () => {
      process.env.EMBEDDING_MODEL = "custom-model";
      mockLoadConfigSync.mockReturnValue({
        provider: "openai",
        apiKey: "sk-cfg-test",
        embeddingModel: "text-embedding-3-large",
      });
      expect(getEmbeddingModelName()).toBe("custom-model");
    });

    it("env var provider takes priority over config provider", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-env-key";
      mockLoadConfigSync.mockReturnValue({ provider: "openai", apiKey: "sk-cfg-test" });
      // Should use Google (env) not OpenAI (config)
      expect(getEmbeddingModelName()).toBe("gemini-embedding-001");
    });

    it("returns null when config has anthropic provider", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "anthropic", apiKey: "sk-ant-test" });
      expect(getEmbeddingModelName()).toBeNull();
    });

    it("returns null when config has openai provider but no apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "openai" });
      expect(getEmbeddingModelName()).toBeNull();
    });
  });

  describe("hasEmbeddingSupport", () => {
    it("returns true when config has openai provider + apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "openai", apiKey: "sk-cfg-test" });
      expect(hasEmbeddingSupport()).toBe(true);
    });

    it("returns true when config has google provider + apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "google", apiKey: "google-cfg-test" });
      expect(hasEmbeddingSupport()).toBe(true);
    });

    it("returns true when config has ollama provider", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "ollama" });
      expect(hasEmbeddingSupport()).toBe(true);
    });

    it("returns false when config has anthropic provider", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "anthropic", apiKey: "sk-ant-test" });
      expect(hasEmbeddingSupport()).toBe(false);
    });

    it("returns false when config is empty", () => {
      mockLoadConfigSync.mockReturnValue({});
      expect(hasEmbeddingSupport()).toBe(false);
    });
  });

  describe("getEmbeddingModel", () => {
    it("returns a model when config has openai provider + apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "openai", apiKey: "sk-cfg-test" });
      const model = getEmbeddingModel();
      expect(model).not.toBeNull();
    });

    it("returns a model when config has google provider + apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "google", apiKey: "google-cfg-test" });
      const model = getEmbeddingModel();
      expect(model).not.toBeNull();
    });

    it("returns a model when config has ollama provider", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "ollama" });
      const model = getEmbeddingModel();
      expect(model).not.toBeNull();
    });

    it("returns null when config has anthropic provider", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "anthropic", apiKey: "sk-ant-test" });
      expect(getEmbeddingModel()).toBeNull();
    });

    it("returns null when config has openai but no apiKey", () => {
      mockLoadConfigSync.mockReturnValue({ provider: "openai" });
      expect(getEmbeddingModel()).toBeNull();
    });

    it("respects config embeddingModel for model name", () => {
      mockLoadConfigSync.mockReturnValue({
        provider: "openai",
        apiKey: "sk-cfg-test",
        embeddingModel: "text-embedding-3-large",
      });
      const model = getEmbeddingModel();
      expect(model).not.toBeNull();
      // The model object should exist — we can't easily inspect the model name
      // without calling the API, but we verified getEmbeddingModelName above
    });

    it("env var OpenAI key takes priority over config", () => {
      process.env.OPENAI_API_KEY = "sk-env-key";
      mockLoadConfigSync.mockReturnValue({ provider: "google", apiKey: "google-cfg-test" });
      // Should use OpenAI (env) not Google (config)
      const model = getEmbeddingModel();
      expect(model).not.toBeNull();
      // getEmbeddingModelName should confirm OpenAI was selected
      expect(getEmbeddingModelName()).toBe("text-embedding-3-small");
    });

    it("uses config ollamaBaseUrl for ollama provider", () => {
      mockLoadConfigSync.mockReturnValue({
        provider: "ollama",
        ollamaBaseUrl: "http://my-ollama:11434/api",
      });
      const model = getEmbeddingModel();
      expect(model).not.toBeNull();
    });
  });

  describe("config-file-only embedding (no env vars)", () => {
    it("embedText returns embedding when only config has openai provider + apiKey", async () => {
      mockLoadConfigSync.mockReturnValue({ provider: "openai", apiKey: "sk-cfg-only" });
      mockEmbed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      const result = await embedText("hello world");
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockEmbed).toHaveBeenCalledTimes(1);
    });

    it("embedText returns null when config only has anthropic (no embedding support)", async () => {
      mockLoadConfigSync.mockReturnValue({ provider: "anthropic", apiKey: "sk-ant-cfg" });

      const result = await embedText("hello world");
      expect(result).toBeNull();
      expect(mockEmbed).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// rebuildVectorStore
// ---------------------------------------------------------------------------

describe("rebuildVectorStore", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-rebuild-"));
    process.env.WIKI_DIR = tmpDir;
    process.env.OPENAI_API_KEY = "sk-test-key";
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("throws when no embedding provider is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    mockLoadConfigSync.mockReturnValue({});

    await expect(rebuildVectorStore()).rejects.toThrow(
      /No embedding provider configured/,
    );
  });

  it("creates a fresh store with all wiki pages embedded", async () => {
    mockListWikiPages.mockResolvedValue([
      { title: "Page A", slug: "page-a", summary: "Summary A" },
      { title: "Page B", slug: "page-b", summary: "Summary B" },
    ]);
    mockReadWikiPage.mockImplementation(async (slug: string) => {
      if (slug === "page-a") {
        return { slug: "page-a", title: "Page A", content: "Content A", path: "/fake/page-a.md" };
      }
      if (slug === "page-b") {
        return { slug: "page-b", title: "Page B", content: "Content B", path: "/fake/page-b.md" };
      }
      return null;
    });

    let callCount = 0;
    mockEmbed.mockImplementation(async () => {
      callCount++;
      return { embedding: [0.1 * callCount, 0.2 * callCount] };
    });

    const result = await rebuildVectorStore();

    expect(result.total).toBe(2);
    expect(result.embedded).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.model).toBe("text-embedding-3-small");

    const store = await loadVectorStore();
    expect(store).not.toBeNull();
    expect(store!.model).toBe("text-embedding-3-small");
    expect(store!.entries).toHaveLength(2);
    expect(store!.entries[0].slug).toBe("page-a");
    expect(store!.entries[0].contentHash).toBe(contentHash("Content A"));
    expect(store!.entries[1].slug).toBe("page-b");
  });

  it("skips pages with empty content", async () => {
    mockListWikiPages.mockResolvedValue([
      { title: "Good", slug: "good", summary: "Has content" },
      { title: "Empty", slug: "empty", summary: "No content" },
    ]);
    mockReadWikiPage.mockImplementation(async (slug: string) => {
      if (slug === "good") {
        return { slug: "good", title: "Good", content: "Real content", path: "/fake/good.md" };
      }
      if (slug === "empty") {
        return { slug: "empty", title: "Empty", content: "   ", path: "/fake/empty.md" };
      }
      return null;
    });

    mockEmbed.mockResolvedValue({ embedding: [0.5, 0.5] });

    const result = await rebuildVectorStore();

    expect(result.total).toBe(2);
    expect(result.embedded).toBe(1);
    expect(result.skipped).toBe(1);

    const store = await loadVectorStore();
    expect(store!.entries).toHaveLength(1);
    expect(store!.entries[0].slug).toBe("good");
  });

  it("skips pages where readWikiPage returns null", async () => {
    mockListWikiPages.mockResolvedValue([
      { title: "Missing", slug: "missing", summary: "Not found" },
    ]);
    mockReadWikiPage.mockResolvedValue(null);

    const result = await rebuildVectorStore();

    expect(result.total).toBe(1);
    expect(result.embedded).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("replaces existing store completely", async () => {
    // Pre-seed a store with old data
    const oldStore: VectorStore = {
      model: "old-model",
      entries: [
        { slug: "old-page", embedding: [1, 0], contentHash: "old" },
      ],
    };
    await saveVectorStore(oldStore);

    mockListWikiPages.mockResolvedValue([
      { title: "New", slug: "new-page", summary: "Brand new" },
    ]);
    mockReadWikiPage.mockResolvedValue({
      slug: "new-page",
      title: "New",
      content: "New content",
      path: "/fake/new-page.md",
    });
    mockEmbed.mockResolvedValue({ embedding: [0.9, 0.1] });

    const result = await rebuildVectorStore();

    expect(result.embedded).toBe(1);

    const store = await loadVectorStore();
    expect(store!.model).toBe("text-embedding-3-small");
    // Old entry should be gone
    expect(store!.entries).toHaveLength(1);
    expect(store!.entries[0].slug).toBe("new-page");
  });

  it("calls onProgress callback", async () => {
    mockListWikiPages.mockResolvedValue([
      { title: "A", slug: "a", summary: "A" },
      { title: "B", slug: "b", summary: "B" },
    ]);
    mockReadWikiPage.mockImplementation(async (slug: string) => ({
      slug,
      title: slug.toUpperCase(),
      content: `Content for ${slug}`,
      path: `/fake/${slug}.md`,
    }));
    mockEmbed.mockResolvedValue({ embedding: [0.5, 0.5] });

    const progress: Array<[number, number]> = [];
    await rebuildVectorStore((done, total) => {
      progress.push([done, total]);
    });

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("handles empty wiki gracefully", async () => {
    mockListWikiPages.mockResolvedValue([]);

    const result = await rebuildVectorStore();

    expect(result.total).toBe(0);
    expect(result.embedded).toBe(0);
    expect(result.skipped).toBe(0);

    const store = await loadVectorStore();
    expect(store).not.toBeNull();
    expect(store!.entries).toHaveLength(0);
  });

  it("skips pages where embedding throws an error", async () => {
    mockListWikiPages.mockResolvedValue([
      { title: "Good", slug: "good", summary: "Works" },
      { title: "Bad", slug: "bad", summary: "Fails" },
    ]);
    mockReadWikiPage.mockImplementation(async (slug: string) => ({
      slug,
      title: slug,
      content: `Content for ${slug}`,
      path: `/fake/${slug}.md`,
    }));

    let callIndex = 0;
    mockEmbed.mockImplementation(async () => {
      callIndex++;
      if (callIndex === 2) throw new Error("API rate limit");
      return { embedding: [0.5, 0.5] };
    });

    const result = await rebuildVectorStore();

    expect(result.total).toBe(2);
    expect(result.embedded).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
