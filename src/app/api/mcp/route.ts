import { NextResponse } from "next/server";
import { verifyAgentToken, getAgent } from "@/lib/agents";
import { getServicePrincipal, type Principal } from "@/lib/auth";
import { getVault, vaultOwnedBy } from "@/lib/vault";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  dispatchMcp,
  MCP_MAX_BATCH,
  type JsonRpcRequest,
  type TargetVault,
} from "@/lib/mcp-http";
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

/** `kind:"ok"` carries the caller (null = unauthenticated reads); `unauthorized`
 *  means a token was presented but is invalid → 401. Literal discriminant so the
 *  three outcomes are compiler-checked, not a structural `in` probe. */
type AuthResult =
  | { kind: "ok"; principal: Principal | null; targetVault: TargetVault | null }
  | { kind: "unauthorized" };

/** Resolve an agent's configured `defaultVault` to a usable target — only if it
 *  still exists and is owned by `owner` (stale/foreign ids are ignored, not an
 *  error). */
async function resolveTargetVault(
  vaultId: string | undefined,
  owner: string,
): Promise<TargetVault | null> {
  if (!vaultId || !vaultOwnedBy(vaultId, owner)) return null;
  const vault = await getVault(vaultId);
  return vault ? { id: vault.id, name: vault.name } : null;
}

/** Resolve the calling principal from a Bearer token. A per-user agent token
 *  resolves to its human OWNER (handle), so writes attribute to and are
 *  authorized as that user; the service token resolves to the trusted service
 *  principal; no token → unauthenticated (reads only). */
async function resolvePrincipal(req: Request): Promise<AuthResult> {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return { kind: "ok", principal: null, targetVault: null };

  const agentId = await verifyAgentToken(bearer);
  if (agentId) {
    // getAgent returns null on not-found (→ reject) and throws only on a real
    // storage error (→ propagates to the outer catch → logged 500, not masked
    // as a bad token). Token valid but the agent is gone → no owner to
    // attribute to: reject rather than silently downgrade to anonymous.
    const agent = await getAgent(agentId);
    if (!agent?.owner) return { kind: "unauthorized" };
    // Act as the agent's human owner (handle-keyed ownership). The non-service
    // id means this is NOT a write-anything principal — it can only write the
    // owner's own pages + the public commons (canWriteFrontmatter).
    return {
      kind: "ok",
      principal: { id: `agent:${agentId}`, handle: agent.owner },
      targetVault: await resolveTargetVault(agent.defaultVault, agent.owner),
    };
  }

  const service = getServicePrincipal(req);
  if (service) return { kind: "ok", principal: service, targetVault: null };

  return { kind: "unauthorized" };
}

const PARSE_ERROR: JsonRpcRequest = {};

export async function POST(req: Request) {
  try {
    const auth = await resolvePrincipal(req);
    if (auth.kind === "unauthorized") {
      return NextResponse.json(
        { error: "Invalid token." },
        { status: 401 },
      );
    }
    const { principal, targetVault } = auth;

    // Cost guard. Key by the authenticated principal when present, else the
    // client IP — anonymous reads still reach query_wiki, which hits the LLM.
    const rlKey = principal
      ? `p:${principal.handle}`
      : `ip:${req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown"}`;
    const rl = await enforceRateLimit("mcp", rlKey);
    if (!rl.allowed) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limit exceeded." } },
        { status: 429 },
      );
    }

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
      if (body.length > MCP_MAX_BATCH) {
        // Each message can fan out to a fetch + LLM call — cap the burst.
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32600, message: `Batch too large (max ${MCP_MAX_BATCH}).` },
          },
          { status: 400 },
        );
      }
      const responses = (
        await Promise.all(
          body.map((m) =>
            dispatchMcp((m ?? PARSE_ERROR) as JsonRpcRequest, principal, targetVault),
          ),
        )
      ).filter((r) => r !== null);
      // All notifications → 202 with no body.
      if (responses.length === 0) return new NextResponse(null, { status: 202 });
      return NextResponse.json(responses);
    }

    const res = await dispatchMcp(
      (body ?? PARSE_ERROR) as JsonRpcRequest,
      principal,
      targetVault,
    );
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
