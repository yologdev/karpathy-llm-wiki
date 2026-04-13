"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { slugify } from "@/lib/slugify";
import { getErrorMessage } from "@/lib/errors";
import { Alert } from "@/components/Alert";

export default function NewWikiPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoSlug = useMemo(() => slugify(title), [title]);
  const slug = slugOverride || autoSlug;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
      setError("Please enter a title or slug.");
      return;
    }

    // Build the markdown body — prepend an H1 from the title if the user
    // didn't already start the content with one.
    let body = content.trim();
    const hasH1 = /^#\s+.+$/m.test(body);
    if (!hasH1 && title.trim()) {
      body = `# ${title.trim()}\n\n${body}`;
    }
    if (!body) {
      setError("Content must not be empty.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: trimmedSlug, content: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      router.push(`/wiki/${trimmedSlug}`);
    } catch (err) {
      setError(getErrorMessage(err, "Network error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold mb-6">Create new wiki page</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Transformer Architecture"
            className="w-full rounded-lg border border-foreground/10 bg-transparent px-4 py-2 text-sm outline-none focus:border-foreground/30 transition-colors"
          />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="slug" className="block text-sm font-medium mb-1">
            Slug
          </label>
          <input
            id="slug"
            type="text"
            value={slugOverride || autoSlug}
            onChange={(e) => setSlugOverride(e.target.value)}
            placeholder="auto-generated-from-title"
            className="w-full rounded-lg border border-foreground/10 bg-transparent px-4 py-2 text-sm font-mono outline-none focus:border-foreground/30 transition-colors"
          />
          {slug && (
            <p className="mt-1 text-xs text-foreground/50">
              Will be created as: <code className="font-mono">{slug}.md</code>
            </p>
          )}
        </div>

        {/* Content */}
        <div>
          <label htmlFor="content" className="block text-sm font-medium mb-1">
            Content (Markdown)
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            placeholder={`Write your wiki page content here…\n\nThe title above will be added as an H1 heading automatically.\n\n## Overview\n\nA brief summary paragraph…\n\n## Details\n\nMore in-depth information…`}
            className="w-full rounded-lg border border-foreground/10 bg-transparent px-4 py-2 text-sm font-mono outline-none focus:border-foreground/30 transition-colors resize-y"
          />
        </div>

        {/* Error */}
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !slug}
            className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? "Creating…" : "Create page"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/wiki")}
            className="rounded-lg border border-foreground/10 px-4 py-2 text-sm text-foreground/70 hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
