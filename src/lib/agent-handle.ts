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

/**
 * Non-human automation authors: the seed/system placeholder, the auto-linter,
 * and the platform seed identity. They aren't people and shouldn't appear as
 * their own contributors — their edits are part of the agent's autonomous
 * upkeep, so {@link normalizeActor} folds them into the agent ("yoyo").
 */
const AUTOMATION_ACTORS = new Set(["system", "lint-fix", "yopedia"]);

/** True when a handle is a non-human automation actor (seed/system/linter). */
export function isAutomationActor(handle: string | null | undefined): boolean {
  return !!handle && AUTOMATION_ACTORS.has(handle.trim().toLowerCase());
}

/**
 * Normalize an author/actor for attribution: automation actors (system, the
 * linter, the platform seed) are credited to the agent ("yoyo") so the
 * contributor list reads as the real people plus the agent, not a scatter of
 * one-off system handles. Real human/agent handles pass through unchanged.
 */
export function normalizeActor(handle: string): string {
  return isAutomationActor(handle) ? DEFAULT_AGENT_NAME : handle;
}
