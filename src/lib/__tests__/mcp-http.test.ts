import { describe, it, expect } from "vitest";
import {
  dispatchMcp,
  MCP_TOOLS,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
} from "../mcp-http";

// These exercise the JSON-RPC envelope + auth gating, which need no storage/LLM
// (a write tool is rejected BEFORE its handler runs when there's no owner).

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
      "alice",
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/unknown tool/i);
  });

  it("blocks a WRITE tool when unauthenticated (owner=null) before running it", async () => {
    const res = await dispatchMcp(
      { id: 1, method: "tools/call", params: { name: "ingest_url", arguments: { url: "https://example.com" } } },
      null,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/authentication required/i);
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
});
