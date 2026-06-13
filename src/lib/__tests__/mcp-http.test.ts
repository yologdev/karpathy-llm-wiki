import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  dispatchMcp,
  MCP_TOOLS,
  MCP_MAX_BATCH,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
} from "../mcp-http";
import { ensureDirectories } from "../wiki";
import { _resetStorage } from "../storage";
import type { Principal } from "../auth";

const ALICE: Principal = { id: "agent:a--yoyo", handle: "alice" };

// Most cases exercise the JSON-RPC envelope + auth gating, which need no
// storage/LLM (a write tool is rejected BEFORE its handler runs when there's no
// principal). The reingest-ACL case touches storage, so set up a temp wiki.
let tmpDir: string;
let prevWiki: string | undefined;
let prevRaw: string | undefined;
let prevData: string | undefined;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-http-test-"));
  prevWiki = process.env.WIKI_DIR;
  prevRaw = process.env.RAW_DIR;
  prevData = process.env.DATA_DIR;
  process.env.WIKI_DIR = path.join(tmpDir, "wiki");
  process.env.RAW_DIR = path.join(tmpDir, "raw");
  process.env.DATA_DIR = tmpDir;
  _resetStorage();
  await ensureDirectories();
});
afterEach(async () => {
  process.env.WIKI_DIR = prevWiki;
  process.env.RAW_DIR = prevRaw;
  process.env.DATA_DIR = prevData;
  _resetStorage();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("dispatchMcp — protocol", () => {
  it("initialize returns protocol version + serverInfo + tools capability", async () => {
    const res = await dispatchMcp({ id: 1, method: "initialize" }, null);
    expect(res).not.toBeNull();
    expect(res!.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: MCP_SERVER_INFO,
      capabilities: { tools: {} },
    });
  });

  it("ping returns an empty result", async () => {
    const res = await dispatchMcp({ id: 2, method: "ping" }, null);
    expect(res!.result).toEqual({});
  });

  it("notifications get no response (null)", async () => {
    expect(await dispatchMcp({ method: "notifications/initialized" }, null)).toBeNull();
  });

  it("unknown method is a JSON-RPC method-not-found error", async () => {
    const res = await dispatchMcp({ id: 3, method: "frobnicate" }, null);
    expect(res!.error?.code).toBe(-32601);
  });

  it("echoes the request id (incl. null)", async () => {
    const res = await dispatchMcp({ id: "abc", method: "ping" }, null);
    expect(res!.id).toBe("abc");
  });
});

describe("dispatchMcp — tools/list", () => {
  it("lists the curated tools with name/description/inputSchema", async () => {
    const res = await dispatchMcp({ id: 1, method: "tools/list" }, null);
    const tools = (res!.result as { tools: { name: string; inputSchema: unknown }[] }).tools;
    const names = tools.map((t) => t.name);
    expect(names).toContain("search_wiki");
    expect(names).toContain("query_wiki");
    expect(names).toContain("ingest_url");
    expect(names).toContain("ingest_text");
    // Every descriptor carries a schema; the internal `write`/`run` fields are
    // NOT leaked to the wire.
    for (const t of tools) {
      expect(t.inputSchema).toBeTypeOf("object");
      expect(t).not.toHaveProperty("write");
      expect(t).not.toHaveProperty("run");
    }
  });
});

describe("dispatchMcp — tools/call auth gating", () => {
  it("rejects an unknown tool as an isError result (not a crash)", async () => {
    const res = await dispatchMcp(
      { id: 1, method: "tools/call", params: { name: "no_such_tool", arguments: {} } },
      ALICE,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/unknown tool/i);
  });

  it("blocks a WRITE tool when unauthenticated (principal=null) before running it", async () => {
    const res = await dispatchMcp(
      { id: 1, method: "tools/call", params: { name: "ingest_url", arguments: { url: "https://example.com" } } },
      null,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/authentication required/i);
  });

  it("reingest denies (cloaked) a missing/unauthorized page before any fetch", async () => {
    const res = await dispatchMcp(
      { id: 1, method: "tools/call", params: { name: "reingest", arguments: { slug: "does-not-exist" } } },
      ALICE,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not found or you don't have permission/i);
  });

  it("every write tool is gated and every read tool is open", () => {
    const writes = MCP_TOOLS.filter((t) => t.write).map((t) => t.name);
    const reads = MCP_TOOLS.filter((t) => !t.write).map((t) => t.name);
    expect(writes).toEqual(
      expect.arrayContaining(["ingest_url", "ingest_text", "create_page", "save_query_answer", "reingest"]),
    );
    expect(reads).toEqual(
      expect.arrayContaining(["search_wiki", "read_page", "list_pages", "query_wiki"]),
    );
  });

  it("exposes a batch cap constant", () => {
    expect(MCP_MAX_BATCH).toBeGreaterThan(0);
  });
});
