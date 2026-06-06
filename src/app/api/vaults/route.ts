import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { listVaults, createVault } from "@/lib/vault";

/**
 * GET /api/vaults  → { vaults: Vault[] } — the signed-in user's own vaults.
 * POST /api/vaults { name } → { vault } — create a (public, v1) vault.
 *
 * Signed-in only (also enforced by the middleware write-gate for POST). Vaults
 * are always the caller's own — owner is the session principal, never the body.
 */
export async function GET() {
  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json({ vaults: await listVaults(principal.handle) });
}

export async function POST(req: Request) {
  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  let name: unknown;
  try {
    name = ((await req.json()) as { name?: unknown })?.name;
  } catch {
    /* invalid body → 400 below */
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Missing or invalid 'name'." },
      { status: 400 },
    );
  }
  // v1: public vaults only (private is paid/clone-to-private, future).
  const vault = await createVault(principal.handle, name.trim(), "public");
  return NextResponse.json({ vault }, { status: 201 });
}
