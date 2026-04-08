"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface WikiEditorProps {
  slug: string;
  initialContent: string;
}

export function WikiEditor({ slug, initialContent }: WikiEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = content !== initialContent;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      setError("Content cannot be empty");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `save failed (${res.status})`);
      }

      router.push(`/wiki/${slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-6">
      <div>
        <label
          htmlFor="content"
          className="block text-sm font-medium mb-2"
        >
          Markdown
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
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
          href={`/wiki/${slug}`}
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
