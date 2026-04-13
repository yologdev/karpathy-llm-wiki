"use client";

// ---------------------------------------------------------------------------
// EmbeddingSettings — embedding model field + rebuild vector index section
// ---------------------------------------------------------------------------

export interface EmbeddingSettingsProps {
  embeddingModel: string;
  setEmbeddingModel: (v: string) => void;
  rebuilding: boolean;
  onRebuild: () => void;
  rebuildResult: { ok: boolean; message: string } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmbeddingSettings({
  embeddingModel,
  setEmbeddingModel,
  rebuilding,
  onRebuild,
  rebuildResult,
}: EmbeddingSettingsProps) {
  return (
    <div>
      <label
        htmlFor="embeddingModel"
        className="block text-sm font-medium text-foreground/80"
      >
        Embedding Model{" "}
        <span className="font-normal text-foreground/40">(optional)</span>
      </label>
      <input
        id="embeddingModel"
        type="text"
        value={embeddingModel}
        onChange={(e) => setEmbeddingModel(e.target.value)}
        placeholder="e.g. text-embedding-3-small (OpenAI) or embedding-001 (Google)"
        className="mt-1.5 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
      />
      <p className="mt-1 text-xs text-foreground/40">
        Embeddings are supported with OpenAI and Google providers. Leave
        empty to use the provider default.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onRebuild}
          disabled={rebuilding}
          className="rounded-md border border-foreground/20 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-50"
        >
          {rebuilding ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Rebuilding…
            </span>
          ) : (
            "Rebuild Vector Index"
          )}
        </button>
      </div>
      {rebuildResult && (
        <div
          className={`mt-2 rounded-lg border p-3 text-sm ${
            rebuildResult.ok
              ? "border-green-500/20 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "border-red-500/20 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {rebuildResult.message}
        </div>
      )}
    </div>
  );
}
