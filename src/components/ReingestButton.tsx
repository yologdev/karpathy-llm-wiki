"use client";

import { useState } from "react";
import { IngestReview, type PreviewData } from "@/components/IngestReview";

interface ReingestButtonProps {
  slug: string;
}

/**
 * Re-ingest a page with a REVIEW step: re-fetch + synthesize a draft (no write),
 * show it in {@link IngestReview} for editing, then publish on approve. Mirrors
 * the /ingest UI's preview → review → publish, over `/api/ingest/reingest`.
 */
export function ReingestButton({ slug }: ReingestButtonProps) {
  const [stage, setStage] = useState<"idle" | "loading" | "review">("idle");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/ingest/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Re-ingest preview failed");
        setStage("idle");
        return;
      }
      setPreview({
        slug: data.primarySlug ?? slug,
        previewContent: data.previewContent ?? "",
        relatedPages: data.relatedUpdated ?? [],
        title: data.preview?.title ?? slug,
        content: "",
        ...(data.sourceUrl ? { sourceUrl: data.sourceUrl } : {}),
        meta: data.preview,
      });
      setStage("review");
    } catch {
      setError("Network error — could not reach the server");
      setStage("idle");
    }
  }

  async function publish(editedContent?: string) {
    if (!preview) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          generatedContent: editedContent ?? preview.previewContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Publish failed");
        setPublishing(false);
        return;
      }
      // Reload so the reader sees the updated page.
      window.location.reload();
    } catch {
      setError("Network error — could not reach the server");
      setPublishing(false);
    }
  }

  function cancel() {
    setStage("idle");
    setPreview(null);
    setError(null);
    setPublishing(false);
  }

  return (
    <>
      <div className="inline-flex flex-col items-start gap-1">
        <button
          onClick={loadPreview}
          disabled={stage === "loading"}
          aria-label="Re-ingest source content"
          className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {stage === "loading" ? "Preparing draft…" : "Re-ingest"}
        </button>
        {stage === "idle" && error && (
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        )}
      </div>

      {stage === "review" && preview && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !publishing) cancel();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "5vh 16px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              background: "var(--paper)",
              borderRadius: 16,
              maxWidth: 880,
              width: "100%",
              padding: 28,
              boxShadow: "var(--shadow)",
            }}
          >
            <h2 className="display" style={{ fontSize: 22, margin: "0 0 6px" }}>
              Re-ingest — review the new draft
            </h2>
            <p
              className="receipt"
              style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 18px" }}
            >
              Re-fetched from the source. Review and edit before it replaces the page.
            </p>
            <IngestReview
              preview={preview}
              loading={publishing}
              onApprove={publish}
              onCancel={cancel}
              error={error}
            />
          </div>
        </div>
      )}
    </>
  );
}
