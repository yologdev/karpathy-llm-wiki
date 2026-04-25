/**
 * Structured logging module.
 *
 * Replaces scattered console.warn/error calls with a tag-based logger
 * that respects log levels and can be silenced in tests.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.warn("wiki", "readWikiPage failed for slug:", err);
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function defaultLevel(): LogLevel {
  // Explicit env var wins
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVEL_ORDER) return env as LogLevel;

  // In test mode, default to error-only to reduce noise
  if (process.env.NODE_ENV === "test") return "error";

  // Production/dev default
  return "warn";
}

let currentLevel: LogLevel = defaultLevel();

/** Set the minimum log level. Calls below this level are suppressed. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Get the current log level. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/** Reset log level to the environment-derived default. */
export function resetLogLevel(): void {
  currentLevel = defaultLevel();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function log(
  level: "debug" | "info" | "warn" | "error",
  tag: string,
  msg: string,
  ...args: unknown[]
): void {
  if (!shouldLog(level)) return;
  const prefix = `[${tag}]`;
  console[level](prefix, msg, ...args);
}

export const logger = {
  debug: (tag: string, msg: string, ...args: unknown[]) =>
    log("debug", tag, msg, ...args),
  info: (tag: string, msg: string, ...args: unknown[]) =>
    log("info", tag, msg, ...args),
  warn: (tag: string, msg: string, ...args: unknown[]) =>
    log("warn", tag, msg, ...args),
  error: (tag: string, msg: string, ...args: unknown[]) =>
    log("error", tag, msg, ...args),
};
