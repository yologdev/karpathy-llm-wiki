"use client";

import Link from "next/link";
import { Alert } from "@/components/Alert";
import { BatchIngestForm } from "@/components/BatchIngestForm";
import { IngestSuccess } from "@/components/IngestSuccess";
import { IngestPreview } from "@/components/IngestPreview";
import { useIngest } from "@/hooks/useIngest";

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
    showRawMarkdown,
    switchMode,
    setTitle,
    setContent,
    setUrl,
    setImageUrl,
    setImageFile,
    setPdfUrl,
    setPdfFile,
    handlePreview,
    handleApprove,
    handleDirectIngest,
    handleImageIngest,
    handlePdfIngest,
    reset,
    cancelPreview,
    toggleRawMarkdown,
  } = useIngest();

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
        onToggleMarkdown={toggleRawMarkdown}
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
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {(["text", "url", "image", "pdf", "batch"] as const).map((m) => (
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
            {m === "text"
              ? "Paste Text"
              : m === "url"
                ? "From URL"
                : m === "image"
                  ? "Image"
                  : m === "pdf"
                    ? "PDF"
                    : "Batch URLs"}
          </button>
        ))}
      </div>

      {/* Image mode */}
      {mode === "image" ? (
        <form onSubmit={handleImageIngest} className="space-y-6">
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
            className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "Ingest image"}
          </button>
        </form>
      ) : /* PDF mode */
      mode === "pdf" ? (
        <form onSubmit={handlePdfIngest} className="space-y-6">
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
            className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "Ingest PDF"}
          </button>
        </form>
      ) : /* Batch mode */
      mode === "batch" ? (
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

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
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
