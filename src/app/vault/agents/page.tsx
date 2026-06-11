import { permanentRedirect } from "next/navigation";

/**
 * Agents moved to the top-level `/agents`. Keep this thin shim so old links /
 * bookmarks to `/vault/agents` resolve instead of 404ing.
 */
export default function VaultAgentsRedirect() {
  permanentRedirect("/agents");
}
