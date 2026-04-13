"use client";

// ---------------------------------------------------------------------------
// ProviderForm — provider / API key / model / Ollama URL fields
// ---------------------------------------------------------------------------

import { PROVIDER_INFO, DEFAULT_MODELS, providerLabel } from "@/lib/providers";
import { SourceBadge } from "@/components/SourceBadge";

// ---------------------------------------------------------------------------
// Types
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

export interface ProviderFormProps {
  provider: string;
  setProvider: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (v: string) => void;
  settings: EffectiveSettings | null;
  onFieldChange?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_OPTIONS = [
  { value: "", label: "— Select provider —" },
  ...PROVIDER_INFO,
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderForm({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  model,
  setModel,
  ollamaBaseUrl,
  setOllamaBaseUrl,
  settings,
  onFieldChange,
}: ProviderFormProps) {
  // The provider to use for conditional field display:
  // if form has a selection, use that; otherwise fall back to effective settings
  const effectiveProvider =
    provider || (settings?.providerSource === "env" ? settings.provider : null);
  const showApiKey = effectiveProvider !== "ollama";
  const showOllamaUrl = effectiveProvider === "ollama";

  return (
    <>
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
              onFieldChange?.();
            }}
            className="mt-1.5 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          >
            {PROVIDER_OPTIONS.map((p) => (
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
                ? DEFAULT_MODELS[effectiveProvider] ?? "Enter model name"
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
    </>
  );
}
