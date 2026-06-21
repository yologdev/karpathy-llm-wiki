import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Mock LLM and embeddings — real filesystem, fake AI
// ---------------------------------------------------------------------------
vi.mock("../llm", () => ({
  hasLLMKey: vi.fn(() => false),
  callLLM: vi.fn(),
}));

vi.mock("../embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../embeddings")>();
  return {
    ...actual, // keep the real contentHash (used by ingest dedup)
    hasEmbeddingSupport: vi.fn(() => false),
    searchByVector: vi.fn(async () => []),
    upsertEmbedding: vi.fn(async () => {}),
    removeEmbedding: vi.fn(async () => {}),
  };
});

// Mock unpdf
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

import { ingest, readLedger } from "../ingest";
import { _resetStorage } from "../storage";
import { resetSourceIndex } from "../source-index";

// ---------------------------------------------------------------------------
// Temp directory setup — DATA_DIR controls the storage root so the ledger
// file lands inside the temp dir.
// ---------------------------------------------------------------------------
let tmpDir: string;
let originalWikiDir: string | undefined;
let originalRawDir: string | undefined;
let originalDataDir: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dedup-ledger-test-"));
  originalWikiDir = process.env.WIKI_DIR;
  originalRawDir = process.env.RAW_DIR;
  originalDataDir = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
  resetSourceIndex();
});

afterEach(async () => {
  if (originalWikiDir === undefined) delete process.env.WIKI_DIR;
  else process.env.WIKI_DIR = originalWikiDir;
  if (originalRawDir === undefined) delete process.env.RAW_DIR;
  else process.env.RAW_DIR = originalRawDir;
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("dedup'd ingests write a ledger entry", () => {
  it("ingest same content twice → both appear in ledger, second marked deduped", async () => {
    const content = "Quantum computing uses qubits for computation.";

    // First ingest — should create a new page and a ledger entry.
    const first = await ingest("Quantum Computing", content, {
      sourceUrl: "https://example.com/quantum",
      triggeredBy: "@alice",
    });
    expect(first.primarySlug).toBe("quantum-computing");
    expect(first.deduped).toBeUndefined();

    // Second ingest — same content triggers content-hash dedup.
    const second = await ingest("Quantum Computing", content, {
      sourceUrl: "https://example.com/quantum",
      triggeredBy: "@bob",
    });
    expect(second.primarySlug).toBe("quantum-computing");
    expect(second.deduped).toBe(true);

    // Both ingests should appear in the ledger.
    const entries = await readLedger();
    expect(entries.length).toBe(2);

    // Most-recent-first, so entries[0] is the dedup'd one.
    const dedupEntry = entries[0];
    expect(dedupEntry.primary_slug).toBe("quantum-computing");
    expect(dedupEntry.status).toBe("completed");
    expect(dedupEntry.deduped).toBe(true);

    // The first entry should NOT be marked deduped.
    const firstEntry = entries[1];
    expect(firstEntry.primary_slug).toBe("quantum-computing");
    expect(firstEntry.deduped).toBeUndefined();
  });
});
