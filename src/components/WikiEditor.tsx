"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/errors";
import { Alert } from "@/components/Alert";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetadataValues {
  confidence: number | null;
  disputed: boolean;
  tags: string[];
  aliases: string[];
  expiry: string;
  valid_from: string;
  supersedes: string;
}

interface WikiEditorProps {
  slug: string;
  /** The page's tenant — where to navigate after a successful save. */
  tenant: string;
  initialContent: string;
  initialMetadata?: MetadataValues;
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

/** Inline chip list with add / remove for tags and aliases. */
function ChipInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft("");
  }

  return (
    <div>
      <span className="block text-xs font-medium text-foreground/60 mb-1">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="hover:text-red-500 transition-colors"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="rounded border border-foreground/20 px-2 py-1 text-xs hover:bg-foreground/10 transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dirty detection helper
// ---------------------------------------------------------------------------

function isMetadataDirty(
  current: MetadataValues,
  initial: MetadataValues,
): boolean {
  if (current.confidence !== initial.confidence) return true;
  if (current.disputed !== initial.disputed) return true;
  if (current.expiry !== initial.expiry) return true;
  if (current.valid_from !== initial.valid_from) return true;
  if (current.supersedes !== initial.supersedes) return true;
  if (current.tags.length !== initial.tags.length) return true;
  if (current.tags.some((t, i) => t !== initial.tags[i])) return true;
  if (current.aliases.length !== initial.aliases.length) return true;
  if (current.aliases.some((a, i) => a !== initial.aliases[i])) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Build PATCH payload — always send all 7 keys so users can clear fields
// ---------------------------------------------------------------------------

function buildPatchPayload(values: MetadataValues): Record<string, unknown> {
  return {
    confidence: values.confidence,
    disputed: values.disputed,
    tags: values.tags,
    aliases: values.aliases,
    expiry: values.expiry || null,
    valid_from: values.valid_from || null,
    supersedes: values.supersedes || null,
  };
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

const DEFAULT_METADATA: MetadataValues = {
  confidence: null,
  disputed: false,
  tags: [],
  aliases: [],
  expiry: "",
  valid_from: "",
  supersedes: "",
};

export function WikiEditor({
  slug,
  tenant,
  initialContent,
  initialMetadata,
}: WikiEditorProps) {
  const router = useRouter();

  // Body state
  const [content, setContent] = useState(initialContent);
  const bodyDirty = content !== initialContent;

  // Metadata state — real useState so React re-renders on change
  const initial = initialMetadata ?? DEFAULT_METADATA;
  const [metadata, setMetadata] = useState<MetadataValues>(initial);
  const metadataDirty = isMetadataDirty(metadata, initial);

  const dirty = bodyDirty || metadataDirty;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateField = useCallback(
    <K extends keyof MetadataValues>(key: K, value: MetadataValues[K]) => {
      setMetadata((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ------ save handler ------

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setError("Content cannot be empty");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // 1. Save body if changed (PUT)
      if (bodyDirty) {
        const res = await fetch(`/api/wiki/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `body save failed (${res.status})`);
        }
      }

      // 2. Save metadata if changed (PATCH)
      if (metadataDirty) {
        const res = await fetch(`/api/wiki/${slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: buildPatchPayload(metadata) }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            body.error ?? `metadata save failed (${res.status})`,
          );
        }
      }

      router.push(`/u/${tenant}/${slug}`);
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, "unknown error"));
      setBusy(false);
    }
  }

  // ------ confidence display helper ------
  const confidenceDisplay =
    metadata.confidence !== null
      ? `${Math.round(metadata.confidence * 100)}%`
      : "—";

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-6">
      {/* ── Metadata section ── */}
      {initialMetadata && (
        <details className="rounded-lg border border-foreground/20 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold select-none">
            Page Metadata
            {metadataDirty && (
              <span className="ml-2 text-xs text-yellow-500 font-normal">
                (modified)
              </span>
            )}
          </summary>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Confidence */}
            <div>
              <label
                htmlFor="confidence"
                className="block text-xs font-medium text-foreground/60 mb-1"
              >
                Confidence{" "}
                <span className="text-foreground/40">{confidenceDisplay}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="confidence"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={metadata.confidence ?? 0.5}
                  onChange={(e) =>
                    updateField("confidence", parseFloat(e.target.value))
                  }
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => updateField("confidence", null)}
                  className="text-xs text-foreground/40 hover:text-foreground transition-colors"
                  title="Clear confidence"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Disputed toggle */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="disputed"
                className="text-xs font-medium text-foreground/60"
              >
                Disputed
              </label>
              <button
                id="disputed"
                type="button"
                role="switch"
                aria-checked={metadata.disputed}
                onClick={() => updateField("disputed", !metadata.disputed)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  metadata.disputed ? "bg-red-500" : "bg-foreground/20"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    metadata.disputed ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              {metadata.disputed && (
                <span className="text-xs text-red-500">⚠ Disputed</span>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label
                htmlFor="expiry"
                className="block text-xs font-medium text-foreground/60 mb-1"
              >
                Expiry
              </label>
              <input
                id="expiry"
                type="date"
                value={metadata.expiry}
                onChange={(e) => updateField("expiry", e.target.value)}
                className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm focus:border-foreground/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Valid from */}
            <div>
              <label
                htmlFor="valid_from"
                className="block text-xs font-medium text-foreground/60 mb-1"
              >
                Valid from
              </label>
              <input
                id="valid_from"
                type="date"
                value={metadata.valid_from}
                onChange={(e) => updateField("valid_from", e.target.value)}
                className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm focus:border-foreground/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Supersedes */}
            <div className="sm:col-span-2">
              <label
                htmlFor="supersedes"
                className="block text-xs font-medium text-foreground/60 mb-1"
              >
                Supersedes (slug)
              </label>
              <input
                id="supersedes"
                type="text"
                value={metadata.supersedes}
                onChange={(e) => updateField("supersedes", e.target.value)}
                placeholder="e.g. old-page-slug"
                className="w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Tags */}
            <div className="sm:col-span-2">
              <ChipInput
                label="Tags"
                values={metadata.tags}
                onChange={(v) => updateField("tags", v)}
                placeholder="Add tag…"
              />
            </div>

            {/* Aliases */}
            <div className="sm:col-span-2">
              <ChipInput
                label="Aliases"
                values={metadata.aliases}
                onChange={(v) => updateField("aliases", v)}
                placeholder="Add alias…"
              />
            </div>
          </div>
        </details>
      )}

      {/* ── Body textarea ── */}
      <div>
        <label
          htmlFor="content"
          className="block text-sm font-medium mb-2"
        >
          Markdown
          {bodyDirty && (
            <span className="ml-2 text-xs text-yellow-500 font-normal">
              (modified)
            </span>
          )}
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          spellCheck={false}
          className="w-full min-h-[500px] rounded-lg border border-foreground/20 bg-transparent px-4 py-3 font-mono text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors resize-y"
        />
        <p className="mt-2 text-xs text-foreground/40">
          The first <code>#</code> heading will become the page title.
        </p>
      </div>

      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy || !dirty}
          className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <Link
          href={`/u/${tenant}/${slug}`}
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
