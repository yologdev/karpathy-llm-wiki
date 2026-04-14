"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/Alert";
import { BatchIngestForm } from "@/components/BatchIngestForm";
import { IngestSuccess } from "@/components/IngestSuccess";
import { IngestPreview } from "@/components/IngestPreview";
import type { PreviewData } from "@/components/IngestPreview";

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
    return (
      <IngestSuccess
        slug={result.primarySlug}
        relatedUpdated={result.relatedUpdated ?? []}
        onReset={reset}
      />
    );
  }

  // -------------------------------------------------------------------------
  // Stage: preview
  // -------------------------------------------------------------------------
  if (stage === "preview" && preview) {
    return (
      <IngestPreview
        preview={preview}
        loading={loading}
        showRawMarkdown={showRawMarkdown}
        onToggleMarkdown={() => setShowRawMarkdown((v) => !v)}
        onApprove={handleApprove}
        onCancel={cancelPreview}
        error={error}
      />
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

      {/* Mode tabs */}
      <div className="mb-6 flex gap-2">
        {(["text", "url", "batch"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              mode === m
                ? "bg-foreground text-background"
                : "border border-foreground/20 text-foreground/60 hover:text-foreground"
            }`}
          >
            {m === "text" ? "Paste Text" : m === "url" ? "From URL" : "Batch URLs"}
          </button>
        ))}
      </div>

      {/* Batch mode */}
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
              The page will be fetched and its text extracted for ingestion.
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
                placeholder="e.g. Transformer Architecture"
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
          <Alert variant="error">
            {error}
          </Alert>
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
