"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { MAX_BATCH_URLS } from "@/lib/constants";
import { Alert } from "@/components/Alert";

interface BatchItem {
  url: string;
  status: "pending" | "processing" | "success" | "error";
  slug?: string;
  error?: string;
}

export function BatchIngestForm() {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const parseUrls = useCallback((text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, []);

  const validateUrls = useCallback((urls: string[]): string | null => {
    if (urls.length === 0) return "Please enter at least one URL.";
    if (urls.length > MAX_BATCH_URLS)
      return `Too many URLs. Maximum is ${MAX_BATCH_URLS}, got ${urls.length}.`;
    const invalid: string[] = [];
    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        invalid.push(u);
      }
    }
    if (invalid.length > 0) {
      return `Invalid URL${invalid.length > 1 ? "s" : ""}: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? ` and ${invalid.length - 3} more` : ""}`;
    }
    return null;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const urls = parseUrls(input);
    const err = validateUrls(urls);
    if (err) {
      setValidationError(err);
      return;
    }

    const initialItems: BatchItem[] = urls.map((url) => ({
      url,
      status: "pending",
    }));
    setItems(initialItems);
    setRunning(true);

    try {
      const res = await fetch("/api/ingest/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (!res.ok) {
        const data = await res.json();
        setValidationError(data.error || "Batch request failed");
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setValidationError("Could not read streaming response");
        setRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      // Mark all as processing initially — we'll update them as results arrive
      setItems(urls.map((url) => ({ url, status: "processing" })));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              index: number;
              url: string;
              success: boolean;
              result?: { primarySlug: string };
              error?: string;
            };

            setItems((prev) =>
              prev.map((item, i) => {
                if (i !== event.index) return item;
                if (event.success) {
                  return {
                    ...item,
                    status: "success",
                    slug: event.result?.primarySlug,
                  };
                }
                return {
                  ...item,
                  status: "error",
                  error: event.error ?? "Unknown error",
                };
              }),
            );
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer) as {
            index: number;
            url: string;
            success: boolean;
            result?: { primarySlug: string };
            error?: string;
          };
          setItems((prev) =>
            prev.map((item, i) => {
              if (i !== event.index) return item;
              if (event.success) {
                return {
                  ...item,
                  status: "success",
                  slug: event.result?.primarySlug,
                };
              }
              return {
                ...item,
                status: "error",
                error: event.error ?? "Unknown error",
              };
            }),
          );
        } catch {
          // skip
        }
      }
    } catch {
      setValidationError("Network error — could not reach the server");
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    setInput("");
    setItems([]);
    setValidationError(null);
    setRunning(false);
  }

  const successCount = items.filter((i) => i.status === "success").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const isDone = !running && items.length > 0 && successCount + errorCount === items.length;

  const statusIcon = (status: BatchItem["status"]) => {
    switch (status) {
      case "pending":
        return "⏳";
      case "processing":
        return "🔄";
      case "success":
        return "✅";
      case "error":
        return "❌";
    }
  };

  return (
    <div className="space-y-6">
      {!running && items.length === 0 && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="batch-urls"
              className="block text-sm font-medium mb-2"
            >
              URLs (one per line)
            </label>
            <textarea
              id="batch-urls"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={8}
              placeholder={"https://example.com/article-1\nhttps://example.com/article-2\nhttps://example.com/article-3"}
              className="w-full rounded-lg border border-foreground/20 bg-transparent px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/50 focus:outline-none transition-colors resize-y font-mono"
            />
            <p className="mt-2 text-xs text-foreground/40">
              Paste up to {MAX_BATCH_URLS} URLs, one per line. They will be processed
              sequentially with progress updates.
            </p>
          </div>

          {validationError && (
            <Alert variant="error">
              {validationError}
            </Alert>
          )}

          <button
            type="submit"
            className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Process All
          </button>
        </form>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {/* Progress summary */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground/70">
              {running
                ? `Processing... ${successCount + errorCount} of ${items.length} complete`
                : `${successCount} of ${items.length} URL${items.length === 1 ? "" : "s"} ingested successfully`}
            </p>
            {running && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{
                width: `${items.length > 0 ? ((successCount + errorCount) / items.length) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Item list */}
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-foreground/10 px-4 py-3 text-sm"
              >
                <span className="shrink-0 text-base leading-5">
                  {statusIcon(item.status)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-foreground/60">
                    {item.url}
                  </p>
                  {item.status === "success" && item.slug && (
                    <p className="mt-1">
                      Created{" "}
                      <Link
                        href={`/wiki/${item.slug}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {item.slug}
                      </Link>
                    </p>
                  )}
                  {item.status === "error" && item.error && (
                    <p className="mt-1 text-red-600 dark:text-red-400">
                      {item.error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Summary actions after completion */}
          {isDone && (
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={reset}
                className="inline-block rounded-lg bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Ingest more
              </button>
              <Link
                href="/wiki"
                className="text-sm text-foreground/60 hover:text-foreground transition-colors"
              >
                View wiki →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
