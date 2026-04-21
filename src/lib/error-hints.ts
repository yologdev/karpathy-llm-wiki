/**
 * Pure function that pattern-matches common error messages and returns
 * actionable guidance for the user. No side effects, no imports beyond types.
 */

export interface ErrorHint {
  category: "auth" | "rate-limit" | "network" | "config" | "filesystem";
  suggestion: string;
  action?: {
    label: string;
    href: string;
  };
}

export function getErrorHint(message: string): ErrorHint | null {
  const lower = message.toLowerCase();

  // Ollama-specific network errors (must be checked before generic network)
  if (
    lower.includes("ollama") &&
    (lower.includes("econnrefused") || lower.includes("fetch failed"))
  ) {
    return {
      category: "network",
      suggestion:
        "Could not connect to Ollama. Make sure `ollama serve` is running.",
    };
  }

  // Auth / API key errors
  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication") ||
    lower.includes("401")
  ) {
    return {
      category: "auth",
      suggestion: "Check your API key in Settings or .env.local",
      action: {
        label: "Go to Settings",
        href: "/settings",
      },
    };
  }

  // Rate limit errors
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota")
  ) {
    return {
      category: "rate-limit",
      suggestion:
        "You've hit the provider's rate limit. Wait a moment and try again.",
    };
  }

  // Generic network errors
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econnreset")
  ) {
    return {
      category: "network",
      suggestion:
        "Could not reach the LLM provider. Check your internet connection.",
    };
  }

  // Configuration errors
  if (
    lower.includes("no provider configured") ||
    lower.includes("provider is required")
  ) {
    return {
      category: "config",
      suggestion: "No LLM provider configured. Set up your provider in Settings.",
      action: {
        label: "Go to Settings",
        href: "/settings",
      },
    };
  }

  // Filesystem errors
  if (
    lower.includes("enoent") ||
    lower.includes("no such file") ||
    lower.includes("permission denied") ||
    lower.includes("eacces")
  ) {
    return {
      category: "filesystem",
      suggestion:
        "A file operation failed. Check that the wiki/ directory exists and is writable.",
    };
  }

  return null;
}
