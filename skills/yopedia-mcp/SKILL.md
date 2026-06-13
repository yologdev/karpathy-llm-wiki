---
name: yopedia
description: Read and ingest into yopedia — a cited, agent-maintained wiki — over the remote MCP endpoint. Use it to save URLs/notes into your own yopedia content and to query the wiki for cited answers.
homepage: https://yopedia.yuanhao-li.workers.dev
---

# yopedia (remote MCP)

yopedia is a cited, agent-maintained wiki. This skill lets any MCP-capable agent
(Claude Desktop/Code, Cursor, OpenClaw, …) **read** the public commons and
**ingest** content into the user's own yopedia — no browser extension, no
copy-paste.

## Connect

The server speaks **stateless Streamable-HTTP JSON-RPC** at:

```
https://yopedia.yuanhao-li.workers.dev/api/mcp
```

- **Reads** (`search_wiki`, `read_page`, `list_pages`, `query_wiki`) need **no auth** — they run against the public commons.
- **Writes** (`ingest_url`, `ingest_text`, `create_page`, `save_query_answer`, `reingest`) require a **Bearer token** and save into **that user's own content**.

### Get a token (one-time)

Your yopedia token is your **personal write credential — treat it like a
password.** It's the token of your personal yopedia agent:

1. Sign in to yopedia, then mint a token: `POST /api/agents/<your-agent-id>/token` (owner-only).
2. Put it in the MCP client config as a Bearer header.

### Client config examples

**Claude Code:**
```
claude mcp add --transport http yopedia https://yopedia.yuanhao-li.workers.dev/api/mcp \
  --header "Authorization: Bearer <YOUR_TOKEN>"
```

**Claude Desktop / Cursor** (`mcp.json`):
```json
{
  "mcpServers": {
    "yopedia": {
      "url": "https://yopedia.yuanhao-li.workers.dev/api/mcp",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}
```
Omit the `Authorization` header for read-only access.

## Tools

| Tool | Auth | What it does |
|------|------|--------------|
| `search_wiki` | — | Full-text search the commons |
| `read_page` | — | Read one page (markdown + frontmatter) by slug |
| `list_pages` | — | List pages (sort: title/updated/confidence) |
| `query_wiki` | — | LLM-synthesized, **cited** answer (format: prose/table/slides/html) |
| `ingest_url` | Bearer | Fetch a URL (web/YouTube/X/PDF), summarize, save as your page |
| `ingest_text` | Bearer | Save raw text/markdown as your page |
| `create_page` | Bearer | Create a markdown page in your content |
| `save_query_answer` | Bearer | Persist a Q&A as your page |
| `reingest` | Bearer | Re-fetch a page's source and refresh it |

## Target vault (where your saves land)

By default, writes land in your own content. You can optionally route an agent's
ingests into a specific **vault** — set `defaultVault` on the agent
(`PUT /api/agents/<your-agent-id>` with `{ "defaultVault": "<vault-id>" }`,
owner-only; must be a vault you own). When set, the MCP server tells the
connecting agent (via the `initialize` instructions and the write-tool
descriptions) that saves are filed into that vault, and every ingest is
auto-added to it by reference. Note: the page itself still lands in the public
commons (attributed to you) immediately — the vault holds a *reference* to it,
so filing into a private vault curates a private reference list, it does not yet
keep the page itself private (clone-to-private is not implemented).

## Typical use

- "Add this to my wiki: <url>" → `ingest_url`. The agent ingests directly; the user never copy-pastes.
- "What does my wiki say about agent harnesses?" → `query_wiki` (returns a cited answer).
- "Save these notes as a page" → `ingest_text` / `create_page`.

## Notes

- The endpoint is POST-only stateless JSON-RPC (no SSE). Standard MCP clients connect over Streamable HTTP.
- Ingested third-party content is treated as untrusted data when the wiki is read back (a data-vs-instructions boundary guards against indirect prompt injection).
