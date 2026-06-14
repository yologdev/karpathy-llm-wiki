import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  stageBytes,
  stageText,
  readStagedBytes,
  readStagedText,
  deleteStaged,
  assertStagedKey,
} from "../ingest-staging";
import { _resetStorage, getStorage } from "../storage";

let tmpDir: string;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-staging-"));
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) saved[k] = process.env[k];
  process.env.DATA_DIR = tmpDir;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  _resetStorage();
});

afterEach(async () => {
  for (const k of ["DATA_DIR", "WIKI_DIR", "RAW_DIR"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("ingest-staging", () => {
  it("round-trips staged bytes and deletes the blob", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const key = await stageBytes("job-1", "report.pdf", "document.pdf", bytes);
    // Key lands under raw/uploads/<jobId>/<filename>.
    expect(key).toContain("uploads/job-1/report.pdf");

    const read = await readStagedBytes(key);
    expect(new Uint8Array(read)).toEqual(new Uint8Array([1, 2, 3, 4]));

    await deleteStaged(key);
    // The blob is gone.
    expect(await getStorage().fileExists(key)).toBe(false);
  });

  it("round-trips staged text", async () => {
    const key = await stageText("job-2", "a long pasted document");
    expect(key).toContain("uploads/job-2/text.md");
    expect(await readStagedText(key)).toBe("a long pasted document");
  });

  it("guards the staged key on read/delete — a crafted key can't escape the prefix", () => {
    // Producer-built keys pass.
    expect(() => assertStagedKey("raw/uploads/job-9/doc.pdf")).not.toThrow();
    // Traversal / non-staging keys are refused.
    expect(() => assertStagedKey("raw/uploads/../wiki/secret.md")).toThrow(/non-staging/i);
    expect(() => assertStagedKey("wiki/agentic-systems.md")).toThrow(/non-staging/i);
    expect(() => assertStagedKey("raw/uploads/job-9/../../x")).toThrow(/non-staging/i);
  });

  it("readStagedBytes/Text reject a non-staging key (don't read arbitrary objects)", async () => {
    await expect(readStagedBytes("wiki/secret.md")).rejects.toThrow(/non-staging/i);
    await expect(readStagedText("../../etc/passwd")).rejects.toThrow(/non-staging/i);
  });

  it("deleteStaged never throws on a bad key and does not delete it", async () => {
    // A wiki asset that must NOT be deletable via a crafted staged key.
    await getStorage().writeFile("wiki/keep.md", "important");
    await deleteStaged("wiki/keep.md"); // guard refuses → logged, no delete
    expect(await getStorage().fileExists("wiki/keep.md")).toBe(true);
  });

  it("sanitizes a traversal-y filename to a safe single segment", async () => {
    const key = await stageBytes("job-3", "../../etc/passwd", "image", new ArrayBuffer(1));
    // No path separators survive — the name is flattened under the job prefix.
    expect(key).toContain("uploads/job-3/");
    expect(key).not.toContain("..");
    expect(key.endsWith("passwd")).toBe(true);
  });

  it("rejects a crafted jobId that would escape the prefix", async () => {
    await expect(stageText("../evil", "x")).rejects.toThrow(/invalid staging job id/);
  });

  it("deleteStaged never throws on a missing key", async () => {
    await expect(deleteStaged("raw/uploads/nope/missing.pdf")).resolves.toBeUndefined();
  });
});
