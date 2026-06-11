import { SignInButton } from "@clerk/nextjs";
import { getPrincipal } from "@/lib/auth";
import { listAgentsForOwner } from "@/lib/agents";
import { AgentManager } from "@/components/AgentManager";

/**
 * `/agents` — the signed-in user's agent management surface: list their agents
 * with inline edit / token / delete, plus a create form. A top-level page (moved
 * off `/vault`). Signed-out visitors see only a sign-in prompt — no data fetched.
 */
export default async function AgentsPage() {
  const principal = await getPrincipal();

  if (!principal) {
    return (
      <div className="fade">
        <section
          className="shell"
          style={{ paddingTop: 120, paddingBottom: 120, textAlign: "center" }}
        >
          <p className="fmark" style={{ justifyContent: "center" }}>
            your agents
          </p>
          <h1
            className="display"
            style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: "16px 0 12px" }}
          >
            Agents
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 18,
              maxWidth: "44ch",
              margin: "0 auto 28px",
              lineHeight: 1.55,
            }}
          >
            Sign in to create and manage agents that ingest and maintain pages
            on your behalf.
          </p>
          <SignInButton mode="modal">
            <button className="btn primary">Sign in to view your agents</button>
          </SignInButton>
        </section>
      </div>
    );
  }

  const handle = principal.handle;
  const agents = await listAgentsForOwner(handle);

  return (
    <div className="fade">
      {/* Header */}
      <section className="shell" style={{ paddingTop: 56 }}>
        <p className="fmark" style={{ marginBottom: 18 }}>
          your agents
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: 0 }}
        >
          Agents
        </h1>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: 18,
            lineHeight: 1.55,
            margin: "14px 0 0",
            maxWidth: "56ch",
          }}
        >
          Agents that ingest and maintain pages on your behalf.
        </p>
      </section>

      {/* Agents */}
      <section
        className="shell"
        style={{
          marginTop: 44,
          paddingTop: 26,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <AgentManager handle={handle} agents={agents} />
      </section>
    </div>
  );
}
