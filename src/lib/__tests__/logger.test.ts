import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logger,
  setLogLevel,
  getLogLevel,
  resetLogLevel,
  type LogLevel,
} from "../logger";

describe("logger", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLogLevel();
  });

  it("defaults to error level in test environment", () => {
    resetLogLevel();
    // NODE_ENV is 'test' during vitest runs
    expect(getLogLevel()).toBe("error");
  });

  it("logger.error calls console.error with tag prefix", () => {
    setLogLevel("error");
    logger.error("wiki", "something broke", 42);
    expect(errorSpy).toHaveBeenCalledWith("[wiki]", "something broke", 42);
  });

  it("logger.warn calls console.warn when level allows", () => {
    setLogLevel("warn");
    logger.warn("ingest", "slow fetch");
    expect(warnSpy).toHaveBeenCalledWith("[ingest]", "slow fetch");
  });

  it("logger.warn is suppressed at error level", () => {
    setLogLevel("error");
    logger.warn("ingest", "slow fetch");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logger.info calls console.info when level allows", () => {
    setLogLevel("info");
    logger.info("query", "searching");
    expect(infoSpy).toHaveBeenCalledWith("[query]", "searching");
  });

  it("logger.info is suppressed at warn level", () => {
    setLogLevel("warn");
    logger.info("query", "searching");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("logger.debug calls console.debug when level allows", () => {
    setLogLevel("debug");
    logger.debug("embeddings", "vector computed", { dim: 768 });
    expect(debugSpy).toHaveBeenCalledWith("[embeddings]", "vector computed", {
      dim: 768,
    });
  });

  it("logger.debug is suppressed at info level", () => {
    setLogLevel("info");
    logger.debug("embeddings", "vector computed");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("silent level suppresses everything", () => {
    setLogLevel("silent");
    logger.debug("a", "msg");
    logger.info("a", "msg");
    logger.warn("a", "msg");
    logger.error("a", "msg");
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("setLogLevel changes the effective level", () => {
    setLogLevel("debug");
    expect(getLogLevel()).toBe("debug");
    logger.debug("test", "visible");
    expect(debugSpy).toHaveBeenCalled();
  });

  it("resetLogLevel restores the default", () => {
    setLogLevel("silent");
    expect(getLogLevel()).toBe("silent");
    resetLogLevel();
    // In test env, default is "error"
    expect(getLogLevel()).toBe("error");
  });

  it("all four levels work at debug level", () => {
    setLogLevel("debug");
    logger.debug("t", "d");
    logger.info("t", "i");
    logger.warn("t", "w");
    logger.error("t", "e");
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("level boundary: warn allows warn and error but not info", () => {
    setLogLevel("warn");
    logger.info("t", "no");
    logger.warn("t", "yes");
    logger.error("t", "yes");
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("passes multiple extra args through", () => {
    setLogLevel("error");
    const err = new Error("boom");
    logger.error("llm", "call failed:", err, { retries: 3 });
    expect(errorSpy).toHaveBeenCalledWith(
      "[llm]",
      "call failed:",
      err,
      { retries: 3 },
    );
  });

  it("accepts valid LogLevel types", () => {
    const levels: LogLevel[] = ["debug", "info", "warn", "error", "silent"];
    for (const level of levels) {
      setLogLevel(level);
      expect(getLogLevel()).toBe(level);
    }
  });
});
