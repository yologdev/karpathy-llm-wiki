import { NextResponse } from "next/server";
import { verifyAgentToken, getAgent } from "@/lib/agents";
import { getServicePrincipal } from "@/lib/auth";
import { dispatchMcp, type JsonRpcRequest } from "@/lib/mcp-http";
import { logger } from "@/lib/logger";

/**
 * Remote (HTTP) MCP endpoint — stateless Streamable-HTTP JSON-RPC. External
 * agents (Claude Desktop/Code, Cursor, OpenClaw) POST one MCP message per
 * request: `initialize`, `tools/list`, `tools/call`. See `src/lib/mcp-http.ts`.
 *
 * Auth is by Bearer token and resolves a write `owner`:
 *   - a per-user **agent token** (minted via /api/agents/[id]/token) → the
 *     agent's human **owner**, so writes land in THAT user's content. This is
 *     the user's personal write credential (treat it like a password). It is a
 *     deliberately broader grant than the per-agent `/api/agents/[id]/ingest`
 *     route, which scopes writes to agent-knowledge — here the human is driving
 *     their own client, so their writes are their own pages.
 *   - the **service token** → the configured service principal.
 *   - **no token** → reads still work (public commons); write tools return an
 *     auth-required tool error.
 *
 * Middleware-exempt (authenticates in-route via the token, not a Clerk session).
 */

/** Resolve the write-owner handle from a Bearer token. Returns `{ owner }` on
 *  success (owner may be null = unauthenticated reads), or `{ unauthorized }`
 *  when a token was presented but is invalid. */
async function resolveOwner(
  req: Request,
): Promise<{ owner: string | null } | { unauthorized: true }> {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return { owner: null };

  const agentId = await verifyAgentToken(bearer);
  if (agentId) {
    const agent = await getAgent(agentId).catch(() => null);
    // Token valid but the agent is gone (deleted/renamed) → no owner to
    // attribute to: reject rather than silently downgrade to anonymous.
    if (!agent?.owner) return { unauthorized: true };
    return { owner: agent.owner };
  }

  const service = getServicePrincipal(req);
  if (service) return { owner: service.handle };

  return { unauthorized: true };
}

const PARSE_ERROR: JsonRpcRequest = {};

export async function POST(req: Request) {
  try {
    const auth = await resolveOwner(req);
    if ("unauthorized" in auth) {
      return NextResponse.json(
        { error: "Invalid token." },
        { status: 401 },
      );
    }
    const owner = auth.owner;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        { status: 400 },
      );
    }

    // JSON-RPC batch (array) or single message.
    if (Array.isArray(body)) {
      const responses = (
        await Promise.all(
          body.map((m) => dispatchMcp((m ?? PARSE_ERROR) as JsonRpcRequest, owner)),
        )
      ).filter((r) => r !== null);
      // All notifications → 202 with no body.
      if (responses.length === 0) return new NextResponse(null, { status: 202 });
      return NextResponse.json(responses);
    }

    const res = await dispatchMcp((body ?? PARSE_ERROR) as JsonRpcRequest, owner);
    if (res === null) return new NextResponse(null, { status: 202 });
    return NextResponse.json(res);
  } catch (err) {
    logger.error("mcp", "remote MCP request failed", err);
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } },
      { status: 500 },
    );
  }
}

/** The transport is stateless POST-only (no SSE/session stream). */
export function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed — POST JSON-RPC to this endpoint." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
