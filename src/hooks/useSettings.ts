"use client";

import { useState, useCallback, useEffect } from "react";
import { providerLabel } from "@/lib/providers";

// ---------------------------------------------------------------------------
// Types matching the API responses
// ---------------------------------------------------------------------------

export type SettingSource = "env" | "config" | "default" | "none";

export interface EffectiveSettings {
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

export interface ProviderStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  embeddingSupport: boolean;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

interface ActionResult {
  ok: boolean;
  message: string;
}

export interface UseSettingsReturn {
  // Fetched data
  settings: EffectiveSettings | null;
  status: ProviderStatus | null;
  loadError: string | null;
  // Form values
  provider: string;
  apiKey: string;
  model: string;
  ollamaBaseUrl: string;
  embeddingModel: string;
  // Form setters
  setProvider: (v: string) => void;
  setApiKey: (v: string) => void;
  setModel: (v: string) => void;
  setOllamaBaseUrl: (v: string) => void;
  setEmbeddingModel: (v: string) => void;
  // Actions
  handleSave: (e: React.FormEvent) => Promise<void>;
  handleTest: () => Promise<void>;
  handleRebuildEmbeddings: () => Promise<void>;
  // Action state
  saving: boolean;
  saveResult: ActionResult | null;
  setSaveResult: (v: ActionResult | null) => void;
  testing: boolean;
  testResult: ActionResult | null;
  setTestResult: (v: ActionResult | null) => void;
  rebuilding: boolean;
  rebuildResult: ActionResult | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettings(): UseSettingsReturn {
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
  const [saveResult, setSaveResult] = useState<ActionResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ActionResult | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<ActionResult | null>(null);

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
          message: `Connected to ${providerLabel(data.provider ?? "anthropic")} (${data.model})${data.embeddingSupport ? " — embeddings supported" : ""}`,
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

  return {
    // Fetched data
    settings,
    status,
    loadError,
    // Form values
    provider,
    apiKey,
    model,
    ollamaBaseUrl,
    embeddingModel,
    // Form setters
    setProvider,
    setApiKey,
    setModel,
    setOllamaBaseUrl,
    setEmbeddingModel,
    // Actions
    handleSave,
    handleTest,
    handleRebuildEmbeddings,
    // Action state
    saving,
    saveResult,
    setSaveResult,
    testing,
    testResult,
    setTestResult,
    rebuilding,
    rebuildResult,
  };
}
