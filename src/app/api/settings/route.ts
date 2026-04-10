import {
  loadConfig,
  saveConfig,
  getEffectiveSettings,
  isValidProvider,
  _resetConfigCache,
  type AppConfig,
} from "@/lib/config";
import { getEffectiveProvider } from "@/lib/config";

// ---------------------------------------------------------------------------
// GET /api/settings — return effective settings with source annotations
// ---------------------------------------------------------------------------

export async function GET() {
  const settings = getEffectiveSettings();
  return Response.json(settings);
}

// ---------------------------------------------------------------------------
// PUT /api/settings — update the config file
// ---------------------------------------------------------------------------

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppConfig>;

    // Validate provider if provided
    if (body.provider !== undefined && body.provider !== null) {
      if (typeof body.provider !== "string" || !isValidProvider(body.provider)) {
        return Response.json(
          { error: `Invalid provider: "${body.provider}". Must be one of: anthropic, openai, google, ollama` },
          { status: 400 },
        );
      }
    }

    // Validate model if provided
    if (body.model !== undefined && body.model !== null) {
      if (typeof body.model !== "string" || body.model.trim().length === 0) {
        return Response.json(
          { error: "Model must be a non-empty string" },
          { status: 400 },
        );
      }
    }

    // Validate ollamaBaseUrl if provided
    if (body.ollamaBaseUrl !== undefined && body.ollamaBaseUrl !== null) {
      if (typeof body.ollamaBaseUrl !== "string") {
        return Response.json(
          { error: "ollamaBaseUrl must be a string" },
          { status: 400 },
        );
      }
    }

    // Load existing config and merge with provided fields
    const existing = await loadConfig();
    const updated: AppConfig = { ...existing };

    if (body.provider !== undefined) {
      if (body.provider === null) {
        delete updated.provider;
      } else {
        updated.provider = body.provider as AppConfig["provider"];
      }
    }

    if (body.apiKey !== undefined) {
      if (body.apiKey === null || body.apiKey === "") {
        delete updated.apiKey;
      } else {
        updated.apiKey = body.apiKey;
      }
    }

    if (body.model !== undefined) {
      if (body.model === null || body.model === "") {
        delete updated.model;
      } else {
        updated.model = body.model;
      }
    }

    if (body.ollamaBaseUrl !== undefined) {
      if (body.ollamaBaseUrl === null || body.ollamaBaseUrl === "") {
        delete updated.ollamaBaseUrl;
      } else {
        updated.ollamaBaseUrl = body.ollamaBaseUrl;
      }
    }

    if (body.embeddingModel !== undefined) {
      if (body.embeddingModel === null || body.embeddingModel === "") {
        delete updated.embeddingModel;
      } else {
        updated.embeddingModel = body.embeddingModel;
      }
    }

    await saveConfig(updated);

    // Reset the sync cache so the next read picks up the new config
    _resetConfigCache();

    // Return updated effective settings
    const effective = getEffectiveProvider();
    return Response.json({
      saved: true,
      effective,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
