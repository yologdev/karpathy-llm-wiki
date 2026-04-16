import fs from "fs/promises";
import path from "path";
import { withFileLock } from "./lock";
import { getWikiDir, ensureDirectories } from "./wiki";

// ---------------------------------------------------------------------------
// Append-only log
// ---------------------------------------------------------------------------

/** Allowed operation kinds for log entries. */
export type LogOperation =
  | "ingest"
  | "query"
  | "lint"
  | "save"
  | "edit"
  | "delete"
  | "other";

const ALLOWED_LOG_OPERATIONS: readonly LogOperation[] = [
  "ingest",
  "query",
  "lint",
  "save",
  "edit",
  "delete",
  "other",
];

/**
 * Append a structured entry to `wiki/log.md`, following the founding-spec format:
 *
 * ```
 * ## [2026-04-07] ingest | Article Title
 *
 * <optional details line>
 *
 * ```
 *
 * Each entry is a markdown H2 heading, making the log both human-readable
 * (renders as a list of section headings) and grep-friendly:
 * `grep "^## \[" wiki/log.md | tail -5` returns the last 5 entries.
 *
 * @throws {Error} when `operation` is not one of the allowed values.
 * @throws {Error} when `title` is empty (after trimming).
 */
export async function appendToLog(
  operation: LogOperation,
  title: string,
  details?: string,
): Promise<void> {
  if (!ALLOWED_LOG_OPERATIONS.includes(operation)) {
    throw new Error(
      `Invalid log operation: "${operation}" (must be one of ${ALLOWED_LOG_OPERATIONS.join(", ")})`,
    );
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Invalid log title: must be a non-empty string");
  }

  await withFileLock("log.md", async () => {
    await ensureDirectories();
    const logPath = path.join(getWikiDir(), "log.md");
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const heading = `## [${date}] ${operation} | ${title.trim()}`;

    let block = `${heading}\n\n`;
    if (details && details.trim().length > 0) {
      block += `${details.trim()}\n\n`;
    }
    await fs.appendFile(logPath, block, "utf-8");
  });
}

/** Read the contents of `wiki/log.md`. Returns `null` if the file doesn't exist. */
export async function readLog(): Promise<string | null> {
  const logPath = path.join(getWikiDir(), "log.md");
  try {
    return await fs.readFile(logPath, "utf-8");
  } catch (err) {
    console.warn("[wiki] readLog failed to read log.md:", err);
    return null;
  }
}
