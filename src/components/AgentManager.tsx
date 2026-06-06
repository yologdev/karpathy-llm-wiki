"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/slugify";
import type { AgentProfile } from "@/lib/types";

/**
 * Client-safe mirror of `agentShortName` from `@/lib/agents` (a pure fn, but
 * that module pulls in server-only deps, so it can't be imported here). The id
 * is `slugify(owner)--slugify(name)`; strip the unambiguous owner prefix to get
 * the name slug for the `/u/<owner>/a/<name>` URL.
 */
function agentShortName(agent: AgentProfile): string {
  if (!agent.owner) return agent.id;
  const prefix = `${slugify(agent.owner)}--`;
  return agent.id.startsWith(prefix) ? agent.id.slice(prefix.length) : agent.id;
}
import { Avatar, Mark } from "@/components/folio/primitives";
import { AgentTokenPanel } from "@/components/AgentTokenPanel";

interface AgentManagerProps {
  handle: string;
  agents: AgentProfile[];
}

/** Folio text input — mirrors the Ask/Browse console input field. */
function FInput({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const shared = {
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(e.target.value),
    placeholder,
    style: {
      width: "100%",
      border: "1px solid var(--rule-strong)",
      borderRadius: 12,
      background: "var(--paper-2)",
      padding: "12px 16px",
      fontSize: 15,
      color: "var(--ink)",
      outline: "none",
      fontFamily: "var(--font-read)",
      resize: "vertical" as const,
    },
  };
  return multiline ? (
    <textarea {...shared} rows={2} />
  ) : (
    <input {...shared} />
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <span className="receipt" style={{ fontSize: 12, color: "var(--rust)" }}>
      {message}
    </span>
  );
}

/** A single agent management card. */
function AgentCard({
  handle,
  agent,
}: {
  handle: string;
  agent: AgentProfile;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "token">(null);
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveEdit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setMode(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete agent "${agent.name}"? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div className="row" style={{ gap: 13, alignItems: "flex-start" }}>
        <Avatar id={agent.id} agent size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <Link
              href={`/u/${handle}/a/${agentShortName(agent)}`}
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: "-.02em",
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              {agent.name}
            </Link>
            <Mark id={agent.id} agent />
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "var(--muted)",
              lineHeight: 1.55,
              maxWidth: "60ch",
            }}
          >
            {agent.description}
          </p>
        </div>
      </div>

      <div
        className="row"
        style={{ gap: 6, flexWrap: "wrap", marginTop: 16 }}
      >
        <button
          type="button"
          className="btn ghost"
          onClick={() => setMode(mode === "edit" ? null : "edit")}
        >
          {mode === "edit" ? "Cancel" : "Edit"}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setMode(mode === "token" ? null : "token")}
        >
          Token
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={remove}
          disabled={busy}
          style={{ color: "var(--rust)" }}
        >
          Delete
        </button>
        {error && <ErrorLine message={error} />}
      </div>

      {mode === "edit" && (
        <div className="stack" style={{ gap: 12, marginTop: 16 }}>
          <FInput value={name} onChange={setName} placeholder="Agent name" />
          <FInput
            value={description}
            onChange={setDescription}
            placeholder="What this agent is"
            multiline
          />
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              onClick={saveEdit}
              disabled={busy || !name.trim() || !description.trim()}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {mode === "token" && (
        <div style={{ marginTop: 16 }}>
          <AgentTokenPanel agentId={agent.id} />
        </div>
      )}
    </div>
  );
}

function CreateAgent({ handle }: { handle: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewId = name.trim()
    ? `${slugify(handle)}--${slugify(name)}`
    : null;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      setName("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--paper-2)",
        border: "1px solid var(--rule)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div className="stack" style={{ gap: 12 }}>
        <FInput value={name} onChange={setName} placeholder="New agent name (e.g. Scout)" />
        <FInput
          value={description}
          onChange={setDescription}
          placeholder="What this agent does"
          multiline
        />
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <button
            type="button"
            className="btn primary"
            onClick={create}
            disabled={busy || !name.trim() || !description.trim()}
          >
            {busy ? "Creating…" : "Create agent"}
          </button>
          {previewId && (
            <span className="receipt" style={{ fontSize: 11.5, color: "var(--faint)" }}>
              id: {previewId}
            </span>
          )}
          {error && <ErrorLine message={error} />}
        </div>
      </div>
    </div>
  );
}

/**
 * The owner's agent management surface on `/vault`: lists their agents with
 * inline edit / token / delete, plus a create form. All actions hit the
 * existing `/api/agents` endpoints and refresh the server tree on success.
 */
export function AgentManager({ handle, agents }: AgentManagerProps) {
  return (
    <div className="stack" style={{ gap: 16 }}>
      {agents.length === 0 ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14.5 }}>
          No agents yet. Create one below to ingest and maintain pages on your
          behalf.
        </p>
      ) : (
        agents.map((agent) => (
          <AgentCard key={agent.id} handle={handle} agent={agent} />
        ))
      )}
      <CreateAgent handle={handle} />
    </div>
  );
}
