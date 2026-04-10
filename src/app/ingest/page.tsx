"use client";

import Link from "next/link";
import { useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { BatchIngestForm } from "@/components/BatchIngestForm";

type Mode = "text" | "url" | "batch";
type Stage = "form" | "preview" | "success";

interface IngestResponse {
  rawPath: string;
  primarySlug: string;
  relatedUpdated: string[];
  wikiPages: string[];
  indexUpdated: boolean;
  previewContent?: string;
  error?: string;
}

/** State captured during the preview phase, passed to commit. */
interface PreviewData {
  slug: string;
  previewContent: string;
  relatedPages: string[];
  /** Original title used for the ingest call. */
  title: string;
  /** Original raw content used for the ingest call. */
  content: string;
  /** Original URL if using URL mode. */
  url?: string;
}

export default function IngestPage() {
  const [mode, setMode] = useState<Mode>("text");
  const [stage, setStage] = useState<Stage>("form");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    if (newMode === "url") {
      setTitle("");
      setContent("");
    } else if (newMode === "text") {
      setUrl("");
    } else {
      setTitle("");
      setContent("");
      setUrl("");
    }
  }

  /** Phase 1: call the API with preview=true to get LLM output without writing. */
  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body =
        mode === "url"
          ? { url, preview: true }
          : { title, content, preview: true };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setPreview({
        slug: data.primarySlug,
        previewContent: data.previewContent ?? "",
        relatedPages: data.relatedUpdated ?? [],
        title: mode === "url" ? data.primarySlug : title,
        content: mode === "url" ? "" : content,
        url: mode === "url" ? url : undefined,
      });
      setStage("preview");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  /** Phase 2: approve the preview — commit with pre-generated content. */
  async function handleApprove() {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      const body = preview.url
        ? {
            url: preview.url,
            generatedContent: preview.previewContent,
          }
        : {
            title: preview.title,
            content: preview.content,
            generatedContent: preview.previewContent,
          };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data);
      setStage("success");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  /** Direct ingest: skip preview, write immediately. */
  async function handleDirectIngest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate inputs (since this button bypasses HTML5 form validation)
    if (mode === "url") {
      if (!url.trim()) {
        setError("Please enter a URL");
        return;
      }
      try {
        new URL(url.trim());
      } catch {
        setError("Please enter a valid URL (e.g. https://example.com)");
        return;
      }
    } else {
      if (!title.trim()) {
        setError("Please enter a title");
        return;
      }
      if (!content.trim()) {
        setError("Please enter some content");
        return;
      }
    }

    setLoading(true);
    setResult(null);

    try {
      const body =
        mode === "url" ? { url } : { title, content };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data);
      setStage("success");
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
    setPreview(null);
    setStage("form");
    setShowRawMarkdown(false);
  }

  function cancelPreview() {
    setPreview(null);
    setError(null);
    setStage("form");
    setShowRawMarkdown(false);
  }

  // -------------------------------------------------------------------------
  // Stage: success
  // -------------------------------------------------------------------------
  if (stage === "success" && result) {
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

  // -------------------------------------------------------------------------
  // Stage: preview
  // -------------------------------------------------------------------------
  if (stage === "preview" && preview) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Review Ingest Preview</h1>
          <button
            onClick={cancelPreview}
            className="text-sm text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
          >
            ← Back to form
          </button>
        </div>

        {/* Metadata */}
        <div className="mb-6 rounded-lg border border-foreground/10 p-4">
          <p className="text-sm">
            <span className="font-medium text-foreground/70">Slug:</span>{" "}
            <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-sm">{preview.slug}</code>
          </p>
          {preview.relatedPages.length > 0 && (
            <p className="mt-2 text-sm text-foreground/70">
              Will also update {preview.relatedPages.length} related page
              {preview.relatedPages.length === 1 ? "" : "s"}:{" "}
              {preview.relatedPages.join(", ")}
            </p>
          )}
        </div>

        {/* Toggle between rendered and raw markdown */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setShowRawMarkdown(false)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              !showRawMarkdown
                ? "bg-foreground text-background"
                : "border border-foreground/20 text-foreground/60 hover:text-foreground"
            }`}
          >
            Rendered
          </button>
          <button
            type="button"
            onClick={() => setShowRawMarkdown(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              showRawMarkdown
                ? "bg-foreground text-background"
                : "border border-foreground/20 text-foreground/60 hover:text-foreground"
            }`}
          >
            Raw Markdown
          </button>
        </div>

        {/* Preview content */}
        <div className="mb-6 rounded-lg border border-foreground/10 p-6">
          {showRawMarkdown ? (
            <pre className="whitespace-pre-wrap text-sm text-foreground/80 font-mono overflow-x-auto">
              {preview.previewContent}
            </pre>
          ) : (
            <MarkdownRenderer content={preview.previewContent} />
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "Committing..." : "Approve & Ingest"}
          </button>
          <button
            onClick={cancelPreview}
            disabled={loading}
            className="text-sm text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // Stage: form (default)
  // -------------------------------------------------------------------------
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
        <button
          type="button"
          onClick={() => switchMode("batch")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            mode === "batch"
              ? "bg-foreground text-background"
              : "border border-foreground/20 text-foreground/60 hover:text-foreground"
          }`}
        >
          Batch URLs
        </button>
      </div>

      {mode === "batch" ? (
        <BatchIngestForm />
      ) : (
      <form onSubmit={handlePreview} className="space-y-6">
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

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "Preview"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleDirectIngest}
            className="text-sm text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
          >
            Ingest directly →
          </button>
        </div>
      </form>
      )}
    </main>
  );
}
