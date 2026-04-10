"use client";

import { useEffect, useState } from "react";

interface ProviderInfo {
  configured: boolean;
  provider: string | null;
  model: string | null;
  embeddingSupport: boolean;
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    ollama: "Ollama",
  };
  return labels[provider] ?? provider;
}

export function StatusBadge() {
  const [info, setInfo] = useState<ProviderInfo | null>(null);
  const [error, setError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => {
        if (!r.ok) throw new Error("status fetch failed");
        return r.json();
      })
      .then((data: ProviderInfo) => setInfo(data))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!info) {
    // Loading shimmer
    return (
      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground/40">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
        Checking provider…
      </div>
    );
  }

  if (info.configured) {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground/60">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
        Connected: {providerLabel(info.provider!)} ({info.model})
        {info.embeddingSupport && (
          <span className="ml-1 text-foreground/40">• embeddings ✓</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 text-center">
      <div className="flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
        No LLM provider configured
      </div>
      <button
        onClick={() => setShowHelp((v) => !v)}
        className="mt-1 text-xs text-foreground/40 hover:text-foreground/60 underline"
      >
        {showHelp ? "Hide setup instructions" : "How to configure"}
      </button>
      {showHelp && (
        <div className="mt-3 mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-xs dark:border-amber-800/50 dark:bg-amber-900/20">
          <p className="mb-2 font-medium text-amber-800 dark:text-amber-300">
            Set one of these environment variables:
          </p>
          <ul className="space-y-1 font-mono text-amber-700 dark:text-amber-400">
            <li>ANTHROPIC_API_KEY</li>
            <li>OPENAI_API_KEY</li>
            <li>GOOGLE_GENERATIVE_AI_API_KEY</li>
            <li>OLLAMA_BASE_URL / OLLAMA_MODEL</li>
          </ul>
          <p className="mt-2 text-foreground/50">
            Optional: <span className="font-mono">LLM_MODEL</span> to override
            the default model,{" "}
            <span className="font-mono">EMBEDDING_MODEL</span> for custom
            embeddings.
          </p>
        </div>
      )}
    </div>
  );
}
