/**
 * Staging for async ingest payloads too large for a queue message.
 *
 * A Cloudflare Queues message caps at 128 KB, so uploaded file bytes (PDF /
 * image) and oversized pasted text can't ride inline. Instead the producing
 * route stages them to the storage layer (R2 in production) under
 * `raw/uploads/<jobId>/<name>`, and the queue carries only the small key. The
 * task consumer reads the blob back, ingests, then deletes it (R2 has no TTL).
 */

import { getStorage } from "./storage";
import { rawRelPath } from "./wiki";
import { logger } from "./logger";

/** jobIds are UUIDs; reject anything else so a crafted id can't escape the prefix. */
function assertSafeJobId(jobId: string): void {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(jobId)) {
    throw new Error(`invalid staging job id: ${jobId}`);
  }
}

/** Strip a filename to a safe single path segment (no separators / traversal). */
function safeFilename(filename: string | undefined, fallback: string): string {
  const base = (filename ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || fallback;
}

/** Storage-relative key for a staged blob. */
function stagedKey(jobId: string, name: string): string {
  assertSafeJobId(jobId);
  return rawRelPath(`uploads/${jobId}/${name}`);
}

/** A well-formed staged key ends in `uploads/<jobId>/<file>`. */
const STAGED_KEY_RE = /(^|\/)uploads\/[a-zA-Z0-9-]{1,64}\/[a-zA-Z0-9._-]+$/;

/**
 * Guard a key BEFORE reading/deleting it. The producer always builds keys via
 * {@link stagedKey} (jobId-scoped, filename-sanitized), but the consumer reads
 * the key from a queue message; constrain it to the staging prefix so a crafted
 * task can never make the consumer read/delete an arbitrary storage object
 * (defense-in-depth — `/api/tasks/run` is already service-token gated).
 */
export function assertStagedKey(key: string): void {
  if (key.includes("..") || !STAGED_KEY_RE.test(key)) {
    throw new Error(`refusing to access non-staging key: ${key}`);
  }
}

/** Stage uploaded binary bytes; returns the storage-relative key. */
export async function stageBytes(
  jobId: string,
  filename: string | undefined,
  fallbackName: string,
  bytes: ArrayBuffer,
): Promise<string> {
  const key = stagedKey(jobId, safeFilename(filename, fallbackName));
  await getStorage().writeAsset(key, bytes);
  return key;
}

/** Stage pasted text (oversized for an inline queue message); returns the key. */
export async function stageText(jobId: string, text: string): Promise<string> {
  const key = stagedKey(jobId, "text.md");
  await getStorage().writeAsset(key, new TextEncoder().encode(text).buffer as ArrayBuffer);
  return key;
}

/** Read staged bytes back (uploaded PDF/image). */
export async function readStagedBytes(key: string): Promise<ArrayBuffer> {
  assertStagedKey(key);
  return getStorage().readAsset(key);
}

/** Read staged text back (oversized paste). */
export async function readStagedText(key: string): Promise<string> {
  assertStagedKey(key);
  const buf = await getStorage().readAsset(key);
  return new TextDecoder().decode(buf);
}

/** Best-effort delete of a staged blob (R2 has no TTL). Never throws (incl. a
 *  key that fails the staging-prefix guard — we just don't delete it). */
export async function deleteStaged(key: string): Promise<void> {
  try {
    assertStagedKey(key);
    await getStorage().deleteFile(key);
  } catch (err) {
    logger.warn("ingest", `failed to delete staged blob ${key}`, err);
  }
}
