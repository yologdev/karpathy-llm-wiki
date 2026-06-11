"use client";

import { Alert } from "@/components/Alert";
import { IngestSuccess } from "@/components/IngestSuccess";
import { IngestReview } from "@/components/IngestReview";
import { IngestStepper } from "@/components/IngestStepper";
import { IngestSynthesis } from "@/components/IngestSynthesis";
import { RecentIngests } from "@/components/RecentIngests";
import { Icon } from "@/components/folio/icons";
import { useIngest, isUrlMode, type Mode } from "@/hooks/useIngest";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "url", label: "URL" },
  { mode: "pdf", label: "PDF" },
  { mode: "xpost", label: "X post" },
  { mode: "youtube", label: "YouTube" },
  { mode: "text", label: "Paste text" },
  { mode: "image", label: "Image" },
];

/** Per-URL-mode input hints. */
const URL_HINTS: Partial<Record<Mode, { placeholder: string; label: string }>> = {
  xpost: { placeholder: "https://x.com/user/status/…", label: "X post URL" },
  youtube: {
    placeholder: "https://youtube.com/watch?v=…",
    label: "YouTube video URL",
  },
  url: { placeholder: "https://example.com/article", label: "Source URL" },
};

const FEATURES: [string, string][] = [
  ["One canonical page", "duplicate sources merge, never fork"],
  ["Provenance kept", "every source traces to who triggered it"],
  ["Agents welcome", "the same path powers the MCP + API"],
];

export default function IngestPage() {
  const {
    mode,
    stage,
    title,
    content,
    url,
    imageUrl,
    imageFile,
    pdfUrl,
    pdfFile,
    loading,
    error,
    result,
    preview,
    switchMode,
    setTitle,
    setContent,
    setUrl,
    setImageUrl,
    setImageFile,
    setPdfUrl,
    setPdfFile,
    handleSourceSubmit,
    handleApprove,
    handleImageIngest,
    handlePdfIngest,
    reset,
    cancelReview,
  } = useIngest();

  // Success keeps its own full-page layout.
  if (stage === "success" && result) {
    return (
      <IngestSuccess
        slug={result.primarySlug}
        relatedUpdated={result.relatedUpdated ?? []}
        onReset={reset}
      />
    );
  }

  const currentStep: 1 | 2 | 3 =
    stage === "review" ? 3 : stage === "synthesis" || stage === "queued" ? 2 : 1;
  const sourceLabel =
    mode === "text"
      ? title.trim() || "your text"
      : mode === "image"
        ? imageFile?.name || imageUrl.trim() || "your image"
        : mode === "pdf"
          ? pdfFile?.name || pdfUrl.trim() || "your PDF"
          : url.trim() || "your source";

  return (
    <main
      className="mx-auto px-6"
      style={{ maxWidth: 900, paddingTop: 56, paddingBottom: 88 }}
    >
      {/* Hero — persists across all three steps */}
      <p className="fmark" style={{ marginBottom: 18 }}>
        contribute to the commons
      </p>
      <h1
        className="display"
        style={{ fontSize: "clamp(34px,4.6vw,56px)", margin: 0, maxWidth: "16ch" }}
      >
        Ingest a source.
      </h1>
      <p
        style={{
          fontFamily: "var(--font-read)",
          fontSize: 19,
          lineHeight: 1.55,
          color: "var(--ink-2)",
          marginTop: 18,
          maxWidth: "48ch",
          fontStyle: "italic",
        }}
      >
        Drop a link, PDF, or post. yoyo synthesizes it into a cited page — and
        merges it if the source already lives in the commons.
      </p>

      <IngestStepper current={currentStep} />

      {/* Step 2: synthesis */}
      {stage === "synthesis" && <IngestSynthesis sourceLabel={sourceLabel} />}

      {/* Step 2 (async): a slow source (YouTube) was queued for background work. */}
      {stage === "queued" && (
        <div style={{ marginTop: 28 }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
            Ingestion job sent.
          </p>
          <p style={{ marginTop: 8, color: "var(--muted)", maxWidth: "48ch" }}>
            Your page is being built in the background — this can take a minute
            for a long video. It&apos;ll appear here when it&apos;s ready. You can
            leave this page; the outcome shows under <strong>Recent ingests</strong>.
          </p>
          {error && (
            <Alert variant="error" className="mt-4">
              {error}
            </Alert>
          )}
        </div>
      )}

      {/* Step 3: review */}
      {stage === "review" && preview && (
        <IngestReview
          preview={preview}
          loading={loading}
          onApprove={handleApprove}
          onCancel={cancelReview}
          error={error}
        />
      )}

      {/* Step 1: source */}
      {stage === "form" && (
        <>
          {/* Source-type tabs */}
          <div className="row" style={{ gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
            {TABS.map(({ mode: m, label }) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  style={{
                    fontSize: 13,
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: 0,
                    cursor: "pointer",
                    background: active ? "var(--paper-3)" : "transparent",
                    color: active ? "var(--ink)" : "var(--muted)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* URL / X post / YouTube: one inline input + Ingest button */}
          {isUrlMode(mode) && (
            <form onSubmit={handleSourceSubmit}>
              <div
                className="row"
                style={{
                  gap: 10,
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 16,
                  background: "var(--paper-2)",
                  boxShadow: "var(--shadow)",
                  padding: "8px 8px 8px 22px",
                  alignItems: "center",
                }}
              >
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  placeholder={(URL_HINTS[mode] ?? URL_HINTS.url)!.placeholder}
                  aria-label={(URL_HINTS[mode] ?? URL_HINTS.url)!.label}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: 0,
                    outline: 0,
                    background: "transparent",
                    fontFamily: "var(--font-mono)",
                    fontSize: 15,
                    color: "var(--ink)",
                  }}
                  className="placeholder:text-faint"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn primary shrink-0 disabled:opacity-50"
                >
                  Ingest <Icon.arrow width="16" height="16" />
                </button>
              </div>
              {mode === "youtube" && (
                <p className="mt-2 text-xs text-foreground/40">
                  Pulls the video&apos;s transcript + metadata into a cited page.
                </p>
              )}
              {error && (
                <Alert variant="error" className="mt-4">
                  {error}
                </Alert>
              )}
            </form>
          )}

          {/* Paste text */}
          {mode === "text" && (
            <form onSubmit={handleSourceSubmit} className="space-y-5">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-2">
                  Title{" "}
                  <span className="text-foreground/40">(optional)</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Leave blank to derive it from the content"
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="content" className="block text-sm font-medium mb-2">
                  Content
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={12}
                  placeholder="Paste the source text here…"
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors resize-y"
                />
              </div>
              {error && <Alert variant="error">{error}</Alert>}
              <button
                type="submit"
                disabled={loading}
                className="btn primary disabled:opacity-50"
              >
                Synthesize <Icon.arrow width="16" height="16" />
              </button>
            </form>
          )}

          {/* Image */}
          {mode === "image" && (
            <form onSubmit={handleImageIngest} className="space-y-5">
              <div>
                <label htmlFor="imageUrl" className="block text-sm font-medium mb-2">
                  Image URL
                </label>
                <input
                  id="imageUrl"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  disabled={!!imageFile}
                  placeholder="https://example.com/image.png"
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors disabled:opacity-50"
                />
              </div>
              <div className="text-center text-xs text-foreground/40">— or —</div>
              <div>
                <label htmlFor="imageFile" className="block text-sm font-medium mb-2">
                  Upload an image
                </label>
                <input
                  id="imageFile"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-foreground/80 file:mr-3 file:rounded-lg file:border file:border-foreground/20 file:bg-transparent file:px-4 file:py-2 file:text-sm file:text-foreground hover:file:border-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="imageTitle" className="block text-sm font-medium mb-2">
                  Title <span className="text-foreground/40">(optional)</span>
                </label>
                <input
                  id="imageTitle"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Defaults to the filename"
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
                />
                <p className="mt-2 text-xs text-foreground/40">
                  A vision model reads the image into a page that embeds it.
                </p>
              </div>
              {error && <Alert variant="error">{error}</Alert>}
              <button
                type="submit"
                disabled={loading}
                className="btn primary disabled:opacity-50"
              >
                {loading ? "Processing…" : "Ingest image"}
              </button>
            </form>
          )}

          {/* PDF */}
          {mode === "pdf" && (
            <form onSubmit={handlePdfIngest} className="space-y-5">
              <div>
                <label htmlFor="pdfUrl" className="block text-sm font-medium mb-2">
                  PDF URL
                </label>
                <input
                  id="pdfUrl"
                  type="url"
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  disabled={!!pdfFile}
                  placeholder="https://example.com/document.pdf"
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors disabled:opacity-50"
                />
              </div>
              <div className="text-center text-xs text-foreground/40">— or —</div>
              <div>
                <label htmlFor="pdfFile" className="block text-sm font-medium mb-2">
                  Upload a PDF
                </label>
                <input
                  id="pdfFile"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-foreground/80 file:mr-3 file:rounded-lg file:border file:border-foreground/20 file:bg-transparent file:px-4 file:py-2 file:text-sm file:text-foreground hover:file:border-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="pdfTitle" className="block text-sm font-medium mb-2">
                  Title <span className="text-foreground/40">(optional)</span>
                </label>
                <input
                  id="pdfTitle"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Defaults to the first line of the PDF"
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors"
                />
                <p className="mt-2 text-xs text-foreground/40">
                  Text is extracted from the PDF and processed into a wiki page.
                </p>
              </div>
              {error && <Alert variant="error">{error}</Alert>}
              <button
                type="submit"
                disabled={loading}
                className="btn primary disabled:opacity-50"
              >
                {loading ? "Processing…" : "Ingest PDF"}
              </button>
            </form>
          )}

          {/* What ingestion guarantees */}
          <div
            className="row"
            style={{
              gap: 18,
              marginTop: 36,
              paddingTop: 24,
              borderTop: "1px solid var(--rule)",
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            {FEATURES.map(([h, b]) => (
              <div key={h} style={{ flex: "1 1 200px" }}>
                <p
                  className="receipt"
                  style={{ fontSize: 12.5, color: "var(--ink)", margin: "0 0 4px" }}
                >
                  {h}
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {b}
                </p>
              </div>
            ))}
          </div>

          <RecentIngests />
        </>
      )}
    </main>
  );
}
