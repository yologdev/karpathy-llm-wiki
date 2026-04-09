"use client";

import Link from "next/link";
import { useState } from "react";

type Mode = "text" | "url";

interface IngestResponse {
  rawPath: string;
  primarySlug: string;
  relatedUpdated: string[];
  wikiPages: string[];
  indexUpdated: boolean;
  error?: string;
}

export default function IngestPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    if (newMode === "url") {
      setTitle("");
      setContent("");
    } else {
      setUrl("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body =
        mode === "url" ? { url } : { title, content };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setTitle("");
    setContent("");
    setUrl("");
    setError(null);
    setResult(null);
  }

  if (result) {
    const slug = result.primarySlug;
    const relatedUpdated = result.relatedUpdated ?? [];
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-lg border border-foreground/10 p-8 text-center">
          <p className="text-2xl font-semibold">✓ Ingested as wiki page</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href={`/wiki/${slug}`}
              className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              View &ldquo;{slug}&rdquo; →
            </Link>
            {relatedUpdated.length > 0 && (
              <div className="mt-4 w-full max-w-md text-left">
                <p className="text-sm text-foreground/70">
                  Also updated {relatedUpdated.length} related page
                  {relatedUpdated.length === 1 ? "" : "s"}:
                </p>
                <ul className="mt-2 flex list-none flex-col gap-1 pl-0">
                  {relatedUpdated.map((relatedSlug) => (
                    <li key={relatedSlug}>
                      <Link
                        href={`/wiki/${relatedSlug}`}
                        className="text-sm text-foreground/70 hover:text-foreground hover:underline transition-colors"
                      >
                        {relatedSlug}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-4 mt-2">
              <Link
                href="/wiki"
                className="text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                Back to wiki
              </Link>
              <button
                onClick={reset}
                className="text-sm text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
              >
                Ingest another
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Ingest Content</h1>
        <Link
          href="/"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors"
        >
          ← Home
        </Link>
      </div>

      {/* Mode toggle */}
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => switchMode("text")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            mode === "text"
              ? "bg-foreground text-background"
              : "border border-foreground/20 text-foreground/60 hover:text-foreground"
          }`}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => switchMode("url")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            mode === "url"
              ? "bg-foreground text-background"
              : "border border-foreground/20 text-foreground/60 hover:text-foreground"
          }`}
        >
          URL
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === "url" ? (
          <div>
            <label
              htmlFor="url"
              className="block text-sm font-medium mb-2"
            >
              URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com/article"
              className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
            />
            <p className="mt-2 text-xs text-foreground/40">
              The page title and content will be extracted automatically.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium mb-2"
              >
                Title
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Attention Is All You Need"
                className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="content"
                className="block text-sm font-medium mb-2"
              >
                Content
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={12}
                placeholder="Paste the source text here..."
                className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors resize-y"
              />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : "Ingest"}
        </button>
      </form>
    </main>
  );
}
