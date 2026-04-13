"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { providerLabel } from "@/lib/providers";
import { ProviderForm } from "@/components/ProviderForm";
import { EmbeddingSettings } from "@/components/EmbeddingSettings";

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
  embeddingModel: string | null;
  embeddingModelSource: SettingSource;
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
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{
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
      if (data.embeddingModelSource === "config" && data.embeddingModel) {
        setEmbeddingModel(data.embeddingModel);
      } else {
        setEmbeddingModel("");
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

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }

      setSaveResult({ ok: true, message: "Settings saved." });

      // Refresh to pick up new effective values
      await fetchSettings();
      await fetchStatus();
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : "Save failed",
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
  // Rebuild vector index
  // ------------------------------------------

  async function handleRebuildEmbeddings() {
    setRebuilding(true);
    setRebuildResult(null);

    try {
      const res = await fetch("/api/settings/rebuild-embeddings", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setRebuildResult({
          ok: false,
          message: data.error ?? "Rebuild failed",
        });
      } else {
        setRebuildResult({
          ok: true,
          message: `Rebuilt: ${data.embedded} page${data.embedded !== 1 ? "s" : ""} embedded using ${data.model}${data.skipped > 0 ? ` (${data.skipped} skipped)` : ""}`,
        });
      }
    } catch (err) {
      setRebuildResult({
        ok: false,
        message:
          err instanceof Error ? err.message : "Failed to rebuild vector index",
      });
    } finally {
      setRebuilding(false);
    }
  }

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
        <ProviderForm
          provider={provider}
          setProvider={setProvider}
          apiKey={apiKey}
          setApiKey={setApiKey}
          model={model}
          setModel={setModel}
          ollamaBaseUrl={ollamaBaseUrl}
          setOllamaBaseUrl={setOllamaBaseUrl}
          settings={settings}
          onFieldChange={() => {
            setSaveResult(null);
            setTestResult(null);
          }}
        />

        {/* Embedding Model */}
        <EmbeddingSettings
          embeddingModel={embeddingModel}
          setEmbeddingModel={setEmbeddingModel}
          rebuilding={rebuilding}
          onRebuild={handleRebuildEmbeddings}
          rebuildResult={rebuildResult}
        />

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
