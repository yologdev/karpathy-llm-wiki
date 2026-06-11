import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { getPrincipal } from "@/lib/auth";
import { listVaults } from "@/lib/vault";
import { VaultManager } from "@/components/VaultManager";

/**
 * `/vault` — the signed-in user's vault management surface: a list of their
 * named vaults (each a curated reference lens over the commons) with create /
 * rename / delete / view. Agents live on the top-level `/agents`. Signed-out visitors
 * see only a sign-in prompt — no data is fetched or leaked.
 */
export default async function VaultPage() {
  const principal = await getPrincipal();

  if (!principal) {
    return (
      <div className="fade">
        <section
          className="shell"
          style={{ paddingTop: 120, paddingBottom: 120, textAlign: "center" }}
        >
          <p className="fmark" style={{ justifyContent: "center" }}>
            your vaults
          </p>
          <h1
            className="display"
            style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: "16px 0 12px" }}
          >
            Vaults
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
            Sign in to create and manage your vaults — curated reference lenses
            over the commons.
          </p>
          <SignInButton mode="modal">
            <button className="btn primary">Sign in to view your vaults</button>
          </SignInButton>
        </section>
      </div>
    );
  }

  const vaults = await listVaults(principal.handle);

  return (
    <div className="fade">
      {/* Header */}
      <section className="shell" style={{ paddingTop: 56 }}>
        <p className="fmark" style={{ marginBottom: 18 }}>
          your vaults
        </p>
        <div
          className="spread"
          style={{ gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <h1
            className="display"
            style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: 0 }}
          >
            Vaults
          </h1>
          <Link
            href="/agents"
            className="receipt"
            style={{
              fontSize: 13,
              color: "var(--agent)",
              textDecoration: "none",
              paddingBottom: 8,
              whiteSpace: "nowrap",
            }}
          >
            Agents →
          </Link>
        </div>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: 18,
            lineHeight: 1.55,
            margin: "14px 0 0",
            maxWidth: "56ch",
          }}
        >
          Each vault is a curated set of live references into the commons — save
          pages to a vault, then browse, query, and graph through that lens.
        </p>
      </section>

      {/* Vaults */}
      <section
        className="shell"
        style={{
          marginTop: 44,
          paddingTop: 26,
          borderTop: "1px solid var(--rule)",
        }}
      >
        <VaultManager vaults={vaults} />
      </section>
    </div>
  );
}
