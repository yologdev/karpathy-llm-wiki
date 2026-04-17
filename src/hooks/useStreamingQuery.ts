"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { extractCitedSlugs } from "@/lib/citations";

export interface QueryResponse {
  answer: string;
  sources: string[];
  error?: string;
}

export interface UseStreamingQueryReturn {
  question: string;
  setQuestion: (q: string) => void;
  format: "prose" | "table";
  setFormat: (f: "prose" | "table") => void;
  result: QueryResponse | null;
  setResult: (r: QueryResponse | null) => void;
  loading: boolean;
  setLoading: (l: boolean) => void;
  streaming: boolean;
  setStreaming: (s: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
  submit: (e: React.FormEvent) => void;
  isProcessing: boolean;
}

interface UseStreamingQueryOptions {
  onComplete?: (question: string, answer: string, sources: string[]) => void;
  onSubmitStart?: () => void;
}

export function useStreamingQuery(
  options: UseStreamingQueryOptions = {},
): UseStreamingQueryReturn {
  const [question, setQuestion] = useState("");
  const [format, setFormat] = useState<"prose" | "table">("prose");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Stable ref for callbacks so we don't trigger re-renders
  const onCompleteRef = useRef(options.onComplete);
  onCompleteRef.current = options.onComplete;
  const onSubmitStartRef = useRef(options.onSubmitStart);
  onSubmitStartRef.current = options.onSubmitStart;

  // Abort any in-flight streaming request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!question.trim()) return;

      // Abort any previous in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setStreaming(false);
      setError(null);
      setResult(null);
      onSubmitStartRef.current?.();

      const trimmed = question.trim();

      try {
        // Try the streaming endpoint first
        const res = await fetch("/api/query/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, format }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // Streaming endpoint failed — try non-streaming fallback
          const data = await res.json().catch(() => null);
          const errMsg = data?.error ?? `Request failed (${res.status})`;

          // Fall back to non-streaming endpoint
          const fallbackRes = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: trimmed, format }),
            signal: controller.signal,
          });

          const fallbackData = await fallbackRes.json();
          if (!fallbackRes.ok) {
            setError(fallbackData.error ?? errMsg);
            return;
          }
          setResult(fallbackData);
          onCompleteRef.current?.(
            trimmed,
            fallbackData.answer,
            fallbackData.sources,
          );
          return;
        }

        // Parse sources from the custom header
        const sourcesHeader = res.headers.get("X-Wiki-Sources");
        let sources: string[] = [];
        if (sourcesHeader) {
          try {
            sources = JSON.parse(sourcesHeader) as string[];
          } catch {
            // Malformed header — fall back to empty array
            sources = [];
          }
        }

        // Stream the response body
        const reader = res.body?.getReader();
        if (!reader) {
          setError("Streaming not supported by the browser");
          return;
        }

        setStreaming(true);
        setLoading(false);

        const decoder = new TextDecoder();
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          answer += chunk;
          setResult({ answer, sources });
        }

        // Refine sources to only those actually cited in the answer
        const citedSources = extractCitedSlugs(answer, sources);
        // Fall back to loaded sources if no citations detected (defensive)
        const finalSources =
          citedSources.length > 0 ? citedSources : sources;
        setResult({ answer, sources: finalSources });
        setStreaming(false);

        // Notify caller that query completed
        onCompleteRef.current?.(trimmed, answer, finalSources);
      } catch (err) {
        // Don't report abort errors as failures
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError("Failed to connect to the server");
      } finally {
        setLoading(false);
        setStreaming(false);
      }
    },
    [question, format],
  );

  const isProcessing = loading || streaming;

  return {
    question,
    setQuestion,
    format,
    setFormat,
    result,
    setResult,
    loading,
    setLoading,
    streaming,
    setStreaming,
    error,
    setError,
    submit: handleSubmit,
    isProcessing,
  };
}
