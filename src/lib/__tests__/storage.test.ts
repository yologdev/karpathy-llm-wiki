import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getStorage, _resetStorage } from "../storage";

describe("storage factory", () => {
  beforeEach(() => {
    _resetStorage();
  });

  afterEach(() => {
    _resetStorage();
    vi.unstubAllEnvs();
  });

  it("defaults to fs provider (which is not yet implemented)", () => {
    // No env override, no Cloudflare runtime → should detect "fs"
    // fs provider is not yet implemented, so getStorage() throws
    expect(() => getStorage()).toThrow("FileSystemProvider not yet implemented");
  });

  it("respects STORAGE_PROVIDER=fs override", () => {
    vi.stubEnv("STORAGE_PROVIDER", "fs");
    expect(() => getStorage()).toThrow("FileSystemProvider not yet implemented");
  });

  it("respects STORAGE_PROVIDER=cloudflare-r2 override", () => {
    vi.stubEnv("STORAGE_PROVIDER", "cloudflare-r2");
    expect(() => getStorage()).toThrow("CloudflareR2Provider not yet implemented");
  });

  it("ignores invalid STORAGE_PROVIDER values and falls back to fs", () => {
    vi.stubEnv("STORAGE_PROVIDER", "invalid-provider");
    expect(() => getStorage()).toThrow("FileSystemProvider not yet implemented");
  });
});

describe("storage types", () => {
  it("exports StorageProvider type", async () => {
    const types = await import("../storage/types");
    // Type-only exports don't have runtime values, but the module
    // should load without errors
    expect(types).toBeDefined();
  });

  it("exports all type names from index re-exports", async () => {
    const mod = await import("../storage");
    // The module should export the factory functions
    expect(typeof mod.getStorage).toBe("function");
    expect(typeof mod._resetStorage).toBe("function");
  });
});
