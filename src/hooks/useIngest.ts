"use client";

import { useState } from "react";
import type { PreviewData } from "@/components/IngestPreview";

export type Mode = "text" | "url" | "batch" | "image" | "pdf";
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
  imageUrl: string;
  imageFile: File | null;
  pdfUrl: string;
  pdfFile: File | null;
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
  setImageUrl: (v: string) => void;
  setImageFile: (f: File | null) => void;
  setPdfUrl: (v: string) => void;
  setPdfFile: (f: File | null) => void;
  handlePreview: (e: React.FormEvent) => void;
  handleApprove: () => void;
  handleDirectIngest: (e: React.FormEvent) => void;
  handleImageIngest: (e: React.FormEvent) => void;
  handlePdfIngest: (e: React.FormEvent) => void;
  reset: () => void;
  cancelPreview: () => void;
  toggleRawMarkdown: () => void;
}

/**
 * Validate ingest inputs — pure function extracted from handleDirectIngest.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateIngestInput(
  mode: Mode,
  title: string,
  content: string,
  url: string,
): string | null {
  if (mode === "url") {
    if (!url.trim()) {
      return "Please enter a URL";
    }
    try {
      new URL(url.trim());
    } catch {
      return "Please enter a valid URL (e.g. https://example.com)";
    }
  } else {
    if (!title.trim()) {
      return "Please enter a title";
    }
    if (!content.trim()) {
      return "Please enter some content";
    }
  }
  return null;
}

export function useIngest(): UseIngestReturn {
  const [mode, setMode] = useState<Mode>("text");
  const [stage, setStage] = useState<Stage>("form");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
    } else if (newMode === "image") {
      setContent("");
      setUrl("");
    } else if (newMode === "pdf") {
      setContent("");
      setUrl("");
    } else {
      setTitle("");
      setContent("");
      setUrl("");
    }
    if (newMode !== "image") {
      setImageUrl("");
      setImageFile(null);
    }
    if (newMode !== "pdf") {
      setPdfUrl("");
      setPdfFile(null);
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
    const validationError = validateIngestInput(mode, title, content, url);
    if (validationError) {
      setError(validationError);
      return;
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

  /** Image ingest: store image, describe via vision model, write a page. No
   *  preview stage (the body is just the image + description). */
  async function handleImageIngest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!imageFile && !imageUrl.trim()) {
      setError("Provide an image URL or choose a file");
      return;
    }
    if (!imageFile && imageUrl.trim()) {
      try {
        new URL(imageUrl.trim());
      } catch {
        setError("Please enter a valid image URL");
        return;
      }
    }

    setLoading(true);
    setResult(null);

    try {
      let res: Response;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        if (title.trim()) fd.append("title", title.trim());
        res = await fetch("/api/ingest/image", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: imageUrl.trim(),
            title: title.trim() || undefined,
          }),
        });
      }

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

  /** PDF ingest: extract text from a PDF, run through the ingest pipeline. No
   *  preview stage (the body is the extracted text). */
  async function handlePdfIngest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!pdfFile && !pdfUrl.trim()) {
      setError("Provide a PDF URL or choose a file");
      return;
    }
    if (!pdfFile && pdfUrl.trim()) {
      try {
        new URL(pdfUrl.trim());
      } catch {
        setError("Please enter a valid PDF URL");
        return;
      }
    }

    setLoading(true);
    setResult(null);

    try {
      let res: Response;
      if (pdfFile) {
        const fd = new FormData();
        fd.append("file", pdfFile);
        if (title.trim()) fd.append("title", title.trim());
        res = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfUrl: pdfUrl.trim(),
            title: title.trim() || undefined,
          }),
        });
      }

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
    setImageUrl("");
    setImageFile(null);
    setPdfUrl("");
    setPdfFile(null);
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
    imageUrl,
    imageFile,
    pdfUrl,
    pdfFile,
    loading,
    error,
    result,
    preview,
    showRawMarkdown,
    switchMode,
    setTitle,
    setContent,
    setUrl,
    setImageUrl,
    setImageFile,
    setPdfUrl,
    setPdfFile,
    handlePreview,
    handleApprove,
    handleDirectIngest,
    handleImageIngest,
    handlePdfIngest,
    reset,
    cancelPreview,
    toggleRawMarkdown,
  };
}
