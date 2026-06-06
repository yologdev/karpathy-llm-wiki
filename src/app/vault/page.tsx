import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { getPrincipal } from "@/lib/auth";
import { slugsForOwner } from "@/lib/search";
import { listReadableWikiPages } from "@/lib/wiki";
import { getVaultRefs } from "@/lib/vault";
import { listAgentsForOwner } from "@/lib/agents";
import { commonsPath, editPath, ownerToTenant } from "@/lib/links";
import { formatRelativeTime } from "@/lib/format";
import type { IndexEntry } from "@/lib/types";
import { Confidence, Mark } from "@/components/folio/primitives";
import { DeletePageButton } from "@/components/DeletePageButton";
import { RemoveFromVaultButton } from "@/components/RemoveFromVaultButton";
import { AgentManager } from "@/components/AgentManager";

/**
 * `/vault` — the signed-in user's own management surface. NOT a public profile
 * (`/u/<handle>` stays that). Here the viewer is always the owner, so every row
 * gets owner actions (edit/delete/remove) and the agent manager. Signed-out
 * visitors see only a sign-in prompt — no data is fetched or leaked.
 */
export default async function VaultPage() {
  const principal = await getPrincipal();

  if (!principal) {
    return (
      <div className="fade">
        <section
          className="shell"
          style={{
            paddingTop: 120,
            paddingBottom: 120,
            textAlign: "center",
          }}
        >
          <p className="fmark" style={{ justifyContent: "center" }}>
            your vault · public + private
          </p>
          <h1
            className="display"
            style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: "16px 0 12px" }}
          >
            Vault
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
            Sign in to manage your contributed commons pages, curated
            references, and agents.
          </p>
          <SignInButton mode="modal">
            <button className="btn primary">Sign in to view your vault</button>
          </SignInButton>
        </section>
      </div>
    );
  }

  const handle = principal.handle;

  // Mirror the public-profile data exactly, but for the signed-in owner.
  const mine = new Set(await slugsForOwner(handle));
  const readable = await listReadableWikiPages(principal);
  const contributed = readable.filter((p) => mine.has(p.slug));

  const curatedSet = new Set(await getVaultRefs(handle));
  const curated = readable.filter(
    (p) => curatedSet.has(p.slug) && !mine.has(p.slug),
  );

  const agents = await listAgentsForOwner(handle);

  return (
    <div className="fade">
      {/* Header */}
      <section className="shell" style={{ paddingTop: 56 }}>
        <p className="fmark" style={{ marginBottom: 18 }}>
          your vault · public + private
        </p>
        <h1
          className="display"
          style={{ fontSize: "clamp(34px,4.6vw,58px)", margin: 0 }}
        >
          Vault
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
          Your contributed commons pages, curated references, and agents — all
          in one place to manage.
        </p>
      </section>

      {/* Contributed */}
      <Section label="contributed">
        <div
          className="row"
          style={{ gap: 14, flexWrap: "wrap", marginBottom: 6 }}
        >
          <Link className="btn primary" href="/ingest">
            Create a page →
          </Link>
          <span
            className="receipt"
            style={{ fontSize: 12, color: "var(--faint)" }}
          >
            ingest lands in the commons + auto-refs into your vault
          </span>
        </div>
        {contributed.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14.5, margin: "18px 0 0" }}>
            You haven&rsquo;t contributed any commons pages yet.
          </p>
        ) : (
          <PageList>
            {contributed.map((p) => (
              <PageRow key={p.slug} page={p}>
                <Link
                  className="btn ghost"
                  href={editPath(ownerToTenant(p.owner), p.slug)}
                >
                  Edit
                </Link>
                <DeletePageButton slug={p.slug} />
              </PageRow>
            ))}
          </PageList>
        )}
      </Section>

      {/* Curated */}
      <Section
        label="curated"
        sub="Commons pages you saved to your vault — live references, not copies."
      >
        {curated.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14.5, margin: 0 }}>
            Nothing curated yet. Save a commons page to your vault from any
            article to keep a live reference here.
          </p>
        ) : (
          <PageList>
            {curated.map((p) => (
              <PageRow key={p.slug} page={p}>
                <RemoveFromVaultButton slug={p.slug} />
              </PageRow>
            ))}
          </PageList>
        )}
      </Section>

      {/* Agents */}
      <Section
        label="agents"
        sub="Agents that ingest and maintain pages on your behalf."
      >
        <AgentManager handle={handle} agents={agents} />
      </Section>

      {/* Private vault teaser */}
      <Section label="private vault">
        <div
          style={{
            background: "var(--paper-2)",
            border: "1px solid var(--rule)",
            borderRadius: 16,
            padding: 22,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: "-.02em",
              color: "var(--ink)",
            }}
          >
            Private pages
          </h3>
          <p
            style={{
              margin: "8px 0 14px",
              fontSize: 14.5,
              color: "var(--muted)",
              lineHeight: 1.55,
              maxWidth: "56ch",
            }}
          >
            Sealed, owner-only pages — coming with the paid plan.
          </p>
          <span
            className="row receipt"
            style={{ gap: 8, fontSize: 11.5, color: "var(--rust)" }}
          >
            <span className="fresh warn" /> coming soon
          </span>
        </div>
      </Section>
    </div>
  );
}

/** A vault subsection: an `.fmark` label over a rule, with optional subhead. */
function Section({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="shell"
      style={{
        marginTop: 44,
        paddingTop: 26,
        borderTop: "1px solid var(--rule)",
      }}
    >
      <p className="fmark" style={{ marginBottom: sub ? 10 : 18 }}>
        {label}
      </p>
      {sub && (
        <p
          style={{
            margin: "0 0 18px",
            fontSize: 14,
            color: "var(--muted)",
            maxWidth: "62ch",
          }}
        >
          {sub}
        </p>
      )}
      {children}
    </section>
  );
}

function PageList({ children }: { children: React.ReactNode }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: "12px 0 0",
        padding: 0,
        borderTop: "1px solid var(--rule)",
      }}
    >
      {children}
    </ul>
  );
}

/** Folio page row (Browse `PageRow` look) with owner action slot. */
function PageRow({
  page,
  children,
}: {
  page: IndexEntry;
  children: React.ReactNode;
}) {
  const owner = page.owner && page.owner !== "system" ? page.owner : null;
  const agentOwned = !!owner && owner.includes("--");
  const rel = page.updated ? formatRelativeTime(page.updated) : null;

  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 22,
        alignItems: "baseline",
        padding: "22px 0",
        borderTop: "1px solid var(--rule)",
      }}
    >
      <div>
        <Link
          href={commonsPath(page.slug)}
          style={{ textDecoration: "none" }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-.02em",
              lineHeight: 1.2,
              color: "var(--ink)",
            }}
          >
            {page.title}
          </h3>
        </Link>
        {page.summary && (
          <p
            style={{
              margin: "8px 0 12px",
              fontSize: 14.5,
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: "62ch",
            }}
          >
            {page.summary}
          </p>
        )}
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          {(page.tags ?? []).slice(0, 3).map((t) => (
            <span
              key={t}
              className="receipt"
              style={{ fontSize: 11.5, color: "var(--ink-2)" }}
            >
              #{t}
            </span>
          ))}
          {owner && <Mark id={owner} agent={agentOwned} />}
          <span
            className="receipt"
            style={{ fontSize: 11.5, color: "var(--faint)" }}
          >
            {page.sourceCount ?? 0}{" "}
            {(page.sourceCount ?? 0) === 1 ? "source" : "sources"}
            {rel ? ` · ${rel}` : ""}
          </span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {children}
        </div>
      </div>
      {page.confidence !== undefined && (
        <div
          className="stack"
          style={{ gap: 9, alignItems: "flex-end", paddingTop: 4 }}
        >
          <Confidence value={page.confidence} withLabel />
        </div>
      )}
    </li>
  );
}
