/**
 * Pure, client-safe helpers for recognizing agent handles. Split out of
 * `agents.ts` (which pulls in the server storage layer) so client components
 * — e.g. `UserLink` — can tell an agent author from a human without bundling
 * the server. `agents.ts` re-exports these for existing server importers.
 */

/** The default agent name every user gets (the canonical "yoyo"). */
export const DEFAULT_AGENT_NAME = "yoyo";

/**
 * True when an author/actor handle denotes an agent rather than a human.
 * Agents appear as the composite id `<owner>--<name>` (e.g. `yuanhao--yoyo`)
 * or, in some legacy attributions, as the bare agent name (`yoyo`). Used to
 * mark agent contributions distinctly across the UI — never to fold agents
 * into the human contributor list (or to link them to a `/u/<handle>` profile).
 */
export function isAgentHandle(handle: string | null | undefined): boolean {
  if (!handle) return false;
  return (
    handle.includes("--") ||
    handle === DEFAULT_AGENT_NAME ||
    handle.endsWith(`--${DEFAULT_AGENT_NAME}`)
  );
}
