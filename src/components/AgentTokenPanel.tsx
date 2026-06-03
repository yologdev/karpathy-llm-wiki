"use client";

import { useState } from "react";

/**
 * Owner-only panel to manage an agent's credential (per-agent token). The token
 * is shown **once** when generated/rotated — only its hash is stored server-side
 * — so the owner copies it then into an external runtime (e.g. openclaw) to
 * ingest as the agent. Lost it? Rotate for a new one.
 */
export function AgentTokenPanel({ agentId }: { agentId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/token`, { method });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      if (method === "POST") {
        const data = (await res.json()) as { token: string };
        setToken(data.token);
        setCopied(false);
      } else {
        setToken(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // Clipboard blocked — the user can select the text manually.
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-foreground/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
        Agent credential
      </h2>
      <p className="mt-1 text-sm text-foreground/60">
        A token lets an external runtime (e.g. openclaw) ingest into this agent.
        It&rsquo;s shown once — copy it now; rotate if you lose it.{" "}
        <a href="/agent-api" className="underline hover:text-foreground">
          How agents use it →
        </a>
      </p>

      {token && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-foreground/5 px-2 py-1 text-xs">
            {token}
          </code>
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/5"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => call("POST")}
          disabled={busy}
          className="rounded-md border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
        >
          {token ? "Rotate token" : "Generate token"}
        </button>
        <button
          type="button"
          onClick={() => call("DELETE")}
          disabled={busy}
          className="rounded-md border border-foreground/20 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
        >
          Revoke
        </button>
        {error && (
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        )}
      </div>
    </section>
  );
}
