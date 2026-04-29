"use client";

import { useState } from "react";
import type { PreviewData } from "@/components/IngestPreview";

export type Mode = "text" | "url" | "batch";
export type Stage = "form" | "preview" | "success";

export interface IngestResponse {
  rawPath: string;
  primarySlug: string;
  relatedUpdated: string[];
  wikiPages: string[];
  indexUpdated: boolean;
  previewContent?: string;
  error?: string;
}

export interface UseIngestReturn {
  // State
  mode: Mode;
  stage: Stage;
  title: string;
  content: string;
  url: string;
  loading: boolean;
  error: string | null;
  result: IngestResponse | null;
  preview: PreviewData | null;
  showRawMarkdown: boolean;
  // Actions
  switchMode: (m: Mode) => void;
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setUrl: (v: string) => void;
  handlePreview: (e: React.FormEvent) => void;
  handleApprove: () => void;
  handleDirectIngest: (e: React.FormEvent) => void;
  reset: () => void;
  cancelPreview: () => void;
  toggleRawMarkdown: () => void;
}

export function useIngest(): UseIngestReturn {
  const [mode, setMode] = useState<Mode>("text");
  const [stage, setStage] = useState<Stage>("form");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    if (newMode === "url") {
      setTitle("");
      setContent("");
    } else if (newMode === "text") {
      setUrl("");
    } else {
      setTitle("");
      setContent("");
      setUrl("");
    }
  }

  /** Phase 1: call the API with preview=true to get LLM output without writing. */
  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body =
        mode === "url"
          ? { url, preview: true }
          : { title, content, preview: true };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setPreview({
        slug: data.primarySlug,
        previewContent: data.previewContent ?? "",
        relatedPages: data.relatedUpdated ?? [],
        title: mode === "url" ? data.primarySlug : title,
        content: mode === "url" ? "" : content,
        url: mode === "url" ? url : undefined,
      });
      setStage("preview");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  /** Phase 2: approve the preview — commit with pre-generated content. */
  async function handleApprove() {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      const body = preview.url
        ? {
            url: preview.url,
            generatedContent: preview.previewContent,
          }
        : {
            title: preview.title,
            content: preview.content,
            generatedContent: preview.previewContent,
          };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data);
      setStage("success");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  /** Direct ingest: skip preview, write immediately. */
  async function handleDirectIngest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate inputs (since this button bypasses HTML5 form validation)
    if (mode === "url") {
      if (!url.trim()) {
        setError("Please enter a URL");
        return;
      }
      try {
        new URL(url.trim());
      } catch {
        setError("Please enter a valid URL (e.g. https://example.com)");
        return;
      }
    } else {
      if (!title.trim()) {
        setError("Please enter a title");
        return;
      }
      if (!content.trim()) {
        setError("Please enter some content");
        return;
      }
    }

    setLoading(true);
    setResult(null);

    try {
      const body =
        mode === "url" ? { url } : { title, content };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data);
      setStage("success");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setTitle("");
    setContent("");
    setUrl("");
    setError(null);
    setResult(null);
    setPreview(null);
    setStage("form");
    setShowRawMarkdown(false);
  }

  function cancelPreview() {
    setPreview(null);
    setError(null);
    setStage("form");
    setShowRawMarkdown(false);
  }

  function toggleRawMarkdown() {
    setShowRawMarkdown((v) => !v);
  }

  return {
    mode,
    stage,
    title,
    content,
    url,
    loading,
    error,
    result,
    preview,
    showRawMarkdown,
    switchMode,
    setTitle,
    setContent,
    setUrl,
    handlePreview,
    handleApprove,
    handleDirectIngest,
    reset,
    cancelPreview,
    toggleRawMarkdown,
  };
}
