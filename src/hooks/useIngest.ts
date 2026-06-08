"use client";

import { useState } from "react";
import type { PreviewData } from "@/components/IngestReview";
import type { IngestPreviewMeta } from "@/lib/types";

export type Mode = "url" | "pdf" | "xpost" | "text" | "image" | "batch";
export type Stage = "form" | "synthesis" | "review" | "success";

export interface IngestResponse {
  rawPath: string;
  primarySlug: string;
  relatedUpdated: string[];
  wikiPages: string[];
  indexUpdated: boolean;
  previewContent?: string;
  preview?: IngestPreviewMeta;
  sourceContent?: string;
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
  // Actions
  switchMode: (m: Mode) => void;
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setUrl: (v: string) => void;
  setImageUrl: (v: string) => void;
  setImageFile: (f: File | null) => void;
  setPdfUrl: (v: string) => void;
  setPdfFile: (f: File | null) => void;
  handleSourceSubmit: (e: React.FormEvent) => void;
  handleApprove: (editedContent?: string) => void;
  handleImageIngest: (e: React.FormEvent) => void;
  handlePdfIngest: (e: React.FormEvent) => void;
  reset: () => void;
  cancelReview: () => void;
}

/**
 * Validate ingest inputs — pure function shared by the source-step submit.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateIngestInput(
  mode: Mode,
  title: string,
  content: string,
  url: string,
): string | null {
  if (mode === "url" || mode === "xpost") {
    if (!url.trim()) {
      return "Please enter a URL";
    }
    try {
      new URL(url.trim());
    } catch {
      return "Please enter a valid URL (e.g. https://example.com)";
    }
  } else {
    if (!content.trim()) {
      return "Please enter some content";
    }
    // Pasted text derives its title from the content; image/PDF still want one.
    if (mode !== "text" && !title.trim()) {
      return "Please enter a title";
    }
  }
  return null;
}

export function useIngest(): UseIngestReturn {
  const [mode, setMode] = useState<Mode>("url");
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

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    // Clear the fields that don't belong to the new mode so a stale value never
    // leaks across a tab switch.
    if (newMode !== "text") {
      setTitle("");
      setContent("");
    }
    if (newMode !== "url" && newMode !== "xpost") {
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

  /**
   * Step 1 → 2 → 3: synthesize the source (preview, no write), show the
   * synthesis animation while it runs, then land on the review step.
   */
  async function handleSourceSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateIngestInput(mode, title, content, url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setStage("synthesis");

    try {
      const usesUrl = mode === "url" || mode === "xpost";
      const body = usesUrl
        ? { url: url.trim(), preview: true }
        : { title, content, preview: true };

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: IngestResponse = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setStage("form");
        return;
      }

      setPreview({
        slug: data.primarySlug,
        previewContent: data.previewContent ?? "",
        relatedPages: data.relatedUpdated ?? [],
        // Prefer the synthesized title (the concept) so a title-less paste
        // shows the derived name on the review card and commits with it.
        title: data.preview?.title ?? (usesUrl ? data.primarySlug : title),
        content: usesUrl ? "" : content,
        url: usesUrl ? url.trim() : undefined,
        meta: data.preview,
      });
      setStage("review");
    } catch {
      setError("Network error — could not reach the server");
      setStage("form");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Step 3: publish — commit the reviewed draft. `editedContent` (when the user
   * edited the draft in the review step) is published instead of the original
   * synthesized body.
   */
  async function handleApprove(editedContent?: string) {
    if (!preview) return;

    // An edit was passed but it's blank — surface it instead of silently
    // publishing the original AI draft (the opposite of the user's intent).
    if (editedContent !== undefined && !editedContent.trim()) {
      setError("The draft is empty — add content or discard to cancel.");
      return;
    }

    setLoading(true);
    setError(null);

    const generated = editedContent ?? preview.previewContent;
    // The synthesized tags shown in the review card live only in the preview
    // meta; forward them on commit so the published page keeps them (the
    // commit-from-preview path skips the LLM and re-derives nothing).
    const tags = preview.meta?.tags;

    try {
      const body = preview.url
        ? { url: preview.url, generatedContent: generated, ...(tags?.length ? { tags } : {}) }
        : {
            title: preview.title,
            content: preview.content,
            generatedContent: generated,
            ...(tags?.length ? { tags } : {}),
            // Preserve PDF/image provenance through the text commit path.
            ...(preview.sourceType ? { sourceType: preview.sourceType } : {}),
            ...(preview.sourceUrl ? { sourceUrl: preview.sourceUrl } : {}),
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

  /** Image ingest: store image + describe via vision model, then REVIEW before
   *  publishing. The preview returns the body (image + description) as
   *  sourceContent so approve commits via the shared text path. */
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
    setStage("synthesis");

    try {
      let res: Response;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        if (title.trim()) fd.append("title", title.trim());
        fd.append("preview", "true");
        res = await fetch("/api/ingest/image", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: imageUrl.trim(),
            title: title.trim() || undefined,
            preview: true,
          }),
        });
      }

      const data: IngestResponse = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setStage("form");
        return;
      }
      setPreview({
        slug: data.primarySlug,
        previewContent: data.previewContent ?? "",
        relatedPages: data.relatedUpdated ?? [],
        title: data.preview?.title ?? title,
        content: data.sourceContent ?? "",
        url: undefined,
        sourceType: "image",
        // Real source URL only when ingesting by URL (uploads have none).
        sourceUrl: imageFile ? undefined : imageUrl.trim() || undefined,
        meta: data.preview,
      });
      setStage("review");
    } catch {
      setError("Network error — could not reach the server");
      setStage("form");
    } finally {
      setLoading(false);
    }
  }

  /** PDF ingest: extract text, synthesize, then REVIEW before publishing. The
   *  preview returns the extracted text as sourceContent so approve commits via
   *  the shared text path (no re-fetch / re-extract). */
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
    setStage("synthesis");

    try {
      let res: Response;
      if (pdfFile) {
        const fd = new FormData();
        fd.append("file", pdfFile);
        if (title.trim()) fd.append("title", title.trim());
        fd.append("preview", "true");
        res = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfUrl: pdfUrl.trim(),
            title: title.trim() || undefined,
            preview: true,
          }),
        });
      }

      const data: IngestResponse = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setStage("form");
        return;
      }
      setPreview({
        slug: data.primarySlug,
        previewContent: data.previewContent ?? "",
        relatedPages: data.relatedUpdated ?? [],
        title: data.preview?.title ?? title,
        content: data.sourceContent ?? "",
        url: undefined,
        sourceType: "pdf",
        // Real source URL only when ingesting by URL (uploads have none).
        sourceUrl: pdfFile ? undefined : pdfUrl.trim() || undefined,
        meta: data.preview,
      });
      setStage("review");
    } catch {
      setError("Network error — could not reach the server");
      setStage("form");
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
  }

  /** Discard the reviewed draft and return to the source step. */
  function cancelReview() {
    setPreview(null);
    setError(null);
    setStage("form");
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
    switchMode,
    setTitle,
    setContent,
    setUrl,
    setImageUrl,
    setImageFile,
    setPdfUrl,
    setPdfFile,
    handleSourceSubmit,
    handleApprove,
    handleImageIngest,
    handlePdfIngest,
    reset,
    cancelReview,
  };
}
