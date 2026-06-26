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
  _internal,
} from "../mcp-http";
import { ensureDirectories } from "../wiki";
import { _resetStorage } from "../storage";
import { createVault, vaultSlugs } from "../vault";
import { registerAgent } from "../agents";
import type { Principal } from "../auth";

const ALICE: Principal = { id: "agent:a--yoyo", handle: "alice" };
const BOB: Principal = { id: "user:bob", handle: "bob" };

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
      expect.arrayContaining(["ingest_url", "ingest_text", "create_page", "save_query_answer", "reingest", "update_metadata"]),
    );
    expect(reads).toEqual(
      expect.arrayContaining(["search_wiki", "read_page", "list_pages", "query_wiki"]),
    );
  });

  it("exposes a batch cap constant", () => {
    expect(MCP_MAX_BATCH).toBeGreaterThan(0);
  });
});

describe("dispatchMcp — per-agent target vault", () => {
  const VAULT = { id: "alice--inbox", name: "Inbox" };

  it("initialize surfaces the target vault in instructions (and omits it without one)", async () => {
    const withVault = await dispatchMcp({ id: 1, method: "initialize" }, ALICE, VAULT);
    expect((withVault!.result as { instructions?: string }).instructions).toMatch(/Inbox/);
    const without = await dispatchMcp({ id: 1, method: "initialize" }, ALICE, null);
    expect((without!.result as { instructions?: string }).instructions).toBeUndefined();
  });

  it("tools/list appends the vault destination to WRITE tool descriptions only", async () => {
    const res = await dispatchMcp({ id: 1, method: "tools/list" }, ALICE, VAULT);
    const tools = (res!.result as { tools: { name: string; description: string }[] }).tools;
    const ingest = tools.find((t) => t.name === "ingest_url")!;
    const search = tools.find((t) => t.name === "search_wiki")!;
    expect(ingest.description).toMatch(/Inbox/);
    expect(search.description).not.toMatch(/Inbox/);
  });

  it("files a created page into the target vault and notes it in the result", async () => {
    const vault = await createVault("alice", "Inbox", "public");
    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: { name: "create_page", arguments: { slug: "from-agent", content: "# From Agent\n\nbody." } },
      },
      ALICE,
      { id: vault.id, name: vault.name },
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBeFalsy();
    // The new page is referenced into the vault, and the result records it.
    expect(await vaultSlugs(vault.id)).toContain("from-agent");
    expect(r.content[0].text).toContain("filedIntoVault");
  });

  it("resultSlug reads `slug` (most write tools) and `primarySlug` (reingest)", () => {
    // Guards the reingest filing path: reingest returns IngestResult with
    // primarySlug and no top-level slug.
    expect(_internal.resultSlug({ slug: "a" })).toBe("a");
    expect(_internal.resultSlug({ primarySlug: "b" })).toBe("b");
    expect(_internal.resultSlug({ slug: "a", primarySlug: "b" })).toBe("a");
    expect(_internal.resultSlug({})).toBeNull();
    expect(_internal.resultSlug("nope")).toBeNull();
  });

  it("a vault-filing failure does not fail the write (fail-soft)", async () => {
    // No such vault → addToVault's mutate is a no-op/throws internally; the page
    // is still created and the call succeeds.
    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: { name: "create_page", arguments: { slug: "still-created", content: "# X\n\nbody." } },
      },
      ALICE,
      { id: "alice--ghost", name: "Ghost" },
    );
    const r = res!.result as { isError?: boolean };
    expect(r.isError).toBeFalsy();
    const { readWikiPage } = await import("../wiki");
    expect(await readWikiPage("still-created")).not.toBeNull();
  });
});

describe("dispatchMcp — update_metadata", () => {
  it("tools/list returns update_metadata", async () => {
    const res = await dispatchMcp({ id: 1, method: "tools/list" }, null);
    const tools = (res!.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toContain("update_metadata");
  });

  it("rejects update_metadata without auth (write-gated)", async () => {
    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: { name: "update_metadata", arguments: { slug: "test", metadata: { disputed: true } } },
      },
      null,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/authentication required/i);
  });

  it("forwards the principal to patchMetadata (updates metadata on an owned page)", async () => {
    // Create a page owned by alice first.
    const { writeWikiPage, serializeFrontmatter } = await import("../wiki");
    const fm = { title: "Meta Test", owner: "alice", created: "2025-01-01" };
    await writeWikiPage("meta-test", serializeFrontmatter(fm, "# Meta Test\n\nBody."));

    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: {
          name: "update_metadata",
          arguments: { slug: "meta-test", metadata: { disputed: true, confidence: 0.5 } },
        },
      },
      ALICE,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.updated).toBe(true);

    // Verify the metadata was actually applied.
    const { readWikiPageWithFrontmatter: readFm } = await import("../wiki");
    const page = await readFm("meta-test");
    expect(page!.frontmatter.disputed).toBe(true);
    expect(page!.frontmatter.confidence).toBe(0.5);
  });
});

describe("dispatchMcp — publish_to_commons ownership check", () => {
  it("rejects publish_to_commons when caller does not own the agent", async () => {
    // Register an agent owned by alice.
    await registerAgent({
      id: "alice--yoyo",
      name: "yoyo",
      description: "Alice's agent",
      owner: "alice",
      identityPages: [],
      learningPages: [],
      socialPages: [],
    });

    // Bob tries to publish alice's agent page — should be rejected.
    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: {
          name: "publish_to_commons",
          arguments: { slug: "some-page", agentId: "alice--yoyo" },
        },
      },
      BOB,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/ownership mismatch/i);
  });

  it("allows publish_to_commons when caller owns the agent", async () => {
    // Register an agent owned by alice.
    await registerAgent({
      id: "alice--yoyo",
      name: "yoyo",
      description: "Alice's agent",
      owner: "alice",
      identityPages: [],
      learningPages: [],
      socialPages: [],
    });

    // Create an agent-knowledge page owned by the agent.
    const { writeWikiPage, serializeFrontmatter } = await import("../wiki");
    const fm = {
      title: "Agent Knowledge",
      owner: "alice--yoyo",
      type: "agent-knowledge",
      created: "2025-01-01",
    };
    await writeWikiPage(
      "agent-topic",
      serializeFrontmatter(fm, "# Agent Knowledge\n\nBody."),
    );

    // Alice (the agent's owner) publishes — should succeed.
    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: {
          name: "publish_to_commons",
          arguments: { slug: "agent-topic", agentId: "alice--yoyo" },
        },
      },
      ALICE,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.published).toBe(true);
    expect(parsed.owner).toBe("alice");
  });

  it("rejects publish_to_commons for a nonexistent agent", async () => {
    const res = await dispatchMcp(
      {
        id: 1,
        method: "tools/call",
        params: {
          name: "publish_to_commons",
          arguments: { slug: "some-page", agentId: "ghost--yoyo" },
        },
      },
      ALICE,
    );
    const r = res!.result as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/agent not found/i);
  });
});
