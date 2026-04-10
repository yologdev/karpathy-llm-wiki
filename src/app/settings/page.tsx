"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types matching the API responses
// ---------------------------------------------------------------------------

type SettingSource = "env" | "config" | "default" | "none";

interface EffectiveSettings {
  provider: string | null;
  providerSource: SettingSource;
  model: string | null;
  modelSource: SettingSource;
  configured: boolean;
  embeddingSupport: boolean;
  maskedApiKey: string | null;
  apiKeySource: SettingSource;
  ollamaBaseUrl: string | null;
  ollamaBaseUrlSource: SettingSource;
}

interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  embeddingSupport: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS = [
  { value: "", label: "— Select provider —" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "ollama", label: "Ollama" },
] as const;

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  ollama: "llama3.2",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    ollama: "Ollama",
  };
  return labels[provider] ?? provider;
}

function SourceBadge({ source }: { source: SettingSource }) {
  if (source === "env") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        from environment
      </span>
    );
  }
  if (source === "config") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground/50">
        from config
      </span>
    );
  }
  if (source === "default") {
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground/40">
        default
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // Fetched state
  const [settings, setSettings] = useState<EffectiveSettings | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // ------------------------------------------
  // Fetch settings & status
  // ------------------------------------------

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data: EffectiveSettings = await res.json();
      setSettings(data);

      // Pre-fill form only with config-sourced values (not env)
      if (data.providerSource === "config" && data.provider) {
        setProvider(data.provider);
      } else if (data.providerSource !== "env") {
        setProvider("");
      }
      // API key: never pre-fill (security), keep empty
      setApiKey("");
      if (data.modelSource === "config" && data.model) {
        setModel(data.model);
      } else {
        setModel("");
      }
      if (data.ollamaBaseUrlSource === "config" && data.ollamaBaseUrl) {
        setOllamaBaseUrl(data.ollamaBaseUrl);
      } else {
        setOllamaBaseUrl("");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Status check failed");
      const data: ProviderStatus = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchStatus();
  }, [fetchSettings, fetchStatus]);

  // ------------------------------------------
  // Save
  // ------------------------------------------

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    setTestResult(null);

    try {
      const body: Record<string, string | null> = {};

      // Only send provider if user selected one
      if (provider) {
        body.provider = provider;
      }

      // Send API key only if user typed something new
      if (apiKey) {
        body.apiKey = apiKey;
      }

      // Model: send if filled, null to clear
      if (model.trim()) {
        body.model = model.trim();
      }

      // Ollama base URL
      if (provider === "ollama" && ollamaBaseUrl.trim()) {
        body.ollamaBaseUrl = ollamaBaseUrl.trim();
      }

      // Embedding model
      if (embeddingModel.trim()) {
        body.embeddingModel = embeddingModel.trim();
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveResult({
          ok: false,
          message: data.error ?? "Save failed",
        });
        return;
      }

      setSaveResult({ ok: true, message: "Settings saved successfully." });

      // Refresh displayed settings & status
      await fetchSettings();
      await fetchStatus();
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------
  // Test connection
  // ------------------------------------------

  async function handleTest() {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Status endpoint returned an error");
      const data: ProviderStatus = await res.json();
      setStatus(data);

      if (data.configured) {
        setTestResult({
          ok: true,
          message: `Connected to ${providerLabel(data.provider!)} (${data.model})${data.embeddingSupport ? " — embeddings supported" : ""}`,
        });
      } else {
        setTestResult({
          ok: false,
          message: "No provider configured. Save your settings first.",
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  }

  // ------------------------------------------
  // Determine effective provider for UI logic
  // ------------------------------------------

  // The provider to use for conditional field display:
  // if form has a selection, use that; otherwise fall back to effective settings
  const effectiveProvider =
    provider || (settings?.providerSource === "env" ? settings.provider : null);
  const showApiKey = effectiveProvider !== "ollama";
  const showOllamaUrl = effectiveProvider === "ollama";

  // ------------------------------------------
  // Render
  // ------------------------------------------

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="text-sm text-foreground/50 hover:text-foreground/80 transition-colors"
        >
          ← Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <div className="mt-6 rounded-lg border border-red-500/20 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          Failed to load settings: {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-foreground/50 hover:text-foreground/80 transition-colors"
      >
        ← Home
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
        Settings
      </h1>
      <p className="mt-2 text-foreground/60">
        Configure your LLM provider and model preferences.
      </p>

      {/* ---- Status indicator ---- */}
      <div className="mt-6 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4">
        {!status && !settings ? (
          <div className="flex items-center gap-2 text-sm text-foreground/40">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
            Checking provider…
          </div>
        ) : status?.configured ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="text-foreground/80">
              Connected:{" "}
              <span className="font-medium">
                {providerLabel(status.provider!)}
              </span>{" "}
              ({status.model})
            </span>
            {status.embeddingSupport && (
              <span className="text-foreground/40">• embeddings ✓</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            No LLM provider configured
          </div>
        )}
      </div>

      {/* ---- Form ---- */}
      <form onSubmit={handleSave} className="mt-8 space-y-6">
        {/* Provider */}
        <div>
          <label
            htmlFor="provider"
            className="block text-sm font-medium text-foreground/80"
          >
            Provider
            {settings && <SourceBadge source={settings.providerSource} />}
          </label>
          {settings?.providerSource === "env" ? (
            <div className="mt-1.5 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground/60">
              {providerLabel(settings.provider!)}
            </div>
          ) : (
            <select
              id="provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setSaveResult(null);
                setTestResult(null);
              }}
              className="mt-1.5 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* API Key */}
        {showApiKey && (
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm font-medium text-foreground/80"
            >
              API Key
              {settings && <SourceBadge source={settings.apiKeySource} />}
            </label>
            {settings?.apiKeySource === "env" ? (
              <div className="mt-1.5 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground/60 font-mono">
                {settings.maskedApiKey ?? "****"}
              </div>
            ) : (
              <>
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    settings?.maskedApiKey
                      ? `Current: ${settings.maskedApiKey}`
                      : "Enter your API key"
                  }
                  className="mt-1.5 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
                />
                {settings?.maskedApiKey && !apiKey && (
                  <p className="mt-1 text-xs text-foreground/40">
                    Leave empty to keep the existing key.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Model */}
        <div>
          <label
            htmlFor="model"
            className="block text-sm font-medium text-foreground/80"
          >
            Model
            {settings && <SourceBadge source={settings.modelSource} />}
          </label>
          {settings?.modelSource === "env" ? (
            <div className="mt-1.5 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground/60 font-mono">
              {settings.model}
            </div>
          ) : (
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                effectiveProvider
                  ? DEFAULT_MODELS[effectiveProvider] ??
                    "Enter model name"
                  : "Select a provider first"
              }
              className="mt-1.5 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
            />
          )}
          <p className="mt-1 text-xs text-foreground/40">
            Leave empty to use the default model for the selected provider.
          </p>
        </div>

        {/* Ollama Base URL */}
        {showOllamaUrl && (
          <div>
            <label
              htmlFor="ollamaBaseUrl"
              className="block text-sm font-medium text-foreground/80"
            >
              Ollama Base URL
              {settings && (
                <SourceBadge source={settings.ollamaBaseUrlSource} />
              )}
            </label>
            {settings?.ollamaBaseUrlSource === "env" ? (
              <div className="mt-1.5 rounded-md border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm text-foreground/60 font-mono">
                {settings.ollamaBaseUrl}
              </div>
            ) : (
              <input
                id="ollamaBaseUrl"
                type="text"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/api"
                className="mt-1.5 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 font-mono"
              />
            )}
          </div>
        )}

        {/* Embedding Model */}
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
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
        </div>

        {/* Save feedback */}
        {saveResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              saveResult.ok
                ? "border-green-500/20 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "border-red-500/20 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {saveResult.message}
          </div>
        )}

        {/* Test feedback */}
        {testResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              testResult.ok
                ? "border-green-500/20 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "border-red-500/20 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {testResult.message}
          </div>
        )}
      </form>
    </main>
  );
}
