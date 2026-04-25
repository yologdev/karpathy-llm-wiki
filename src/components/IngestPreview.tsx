import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Alert } from "@/components/Alert";

export interface PreviewData {
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

interface IngestPreviewProps {
  preview: PreviewData;
  loading: boolean;
  showRawMarkdown: boolean;
  onToggleMarkdown: () => void;
  onApprove: () => void;
  onCancel: () => void;
  error: string | null;
}

export function IngestPreview({
  preview,
  loading,
  showRawMarkdown,
  onToggleMarkdown,
  onApprove,
  onCancel,
  error,
}: IngestPreviewProps) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Review Ingest Preview</h1>
        <button
          onClick={onCancel}
          aria-label="Cancel ingest and return to form"
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
          onClick={() => { if (showRawMarkdown) onToggleMarkdown(); }}
          aria-pressed={!showRawMarkdown}
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
          onClick={() => { if (!showRawMarkdown) onToggleMarkdown(); }}
          aria-pressed={showRawMarkdown}
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
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-4">
        <button
          onClick={onApprove}
          disabled={loading}
          className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? "Committing..." : "Approve & Ingest"}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          aria-label="Cancel ingest"
          className="text-sm text-foreground/60 hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </main>
  );
}
