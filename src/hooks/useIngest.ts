"use client";

import { useState, useRef, useEffect } from "react";
import { rememberRecentJob } from "@/lib/recent-ingests";

export type Mode = "url" | "pdf" | "xpost" | "youtube" | "text" | "image" | "batch";
/** All ingests are async now: submit → `queued` (poll the job) → `success`. */
export type Stage = "form" | "queued" | "success";

/** Modes whose source is a single URL (routed through the same /api/ingest URL
 *  path — the backend auto-detects X posts and YouTube videos by their URL). */
export function isUrlMode(m: Mode): boolean {
  return m === "url" || m === "xpost" || m === "youtube";
}

export interface IngestResponse {
  rawPath?: string;
  primarySlug?: string;
  relatedUpdated?: string[];
  wikiPages?: string[];
  indexUpdated?: boolean;
  error?: string;
  /** Every ingest is queued; the page polls `/api/ingest/status/<jobId>`. */
  queued?: boolean;
  jobId?: string;
  /** Present on the off-Workers inline fallback (dev/tests). */
  slug?: string;
}

/** The resolved page once an async job completes. */
export interface IngestSuccess {
  primarySlug: string;
  relatedUpdated: string[];
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
  vaultId: string | null;
  loading: boolean;
  error: string | null;
  result: IngestSuccess | null;
  // Actions
  switchMode: (m: Mode) => void;
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setUrl: (v: string) => void;
  setImageUrl: (v: string) => void;
  setImageFile: (f: File | null) => void;
  setPdfUrl: (v: string) => void;
  setPdfFile: (f: File | null) => void;
  setVaultId: (v: string | null) => void;
  handleSourceSubmit: (e: React.FormEvent) => void;
  handleImageIngest: (e: React.FormEvent) => void;
  handlePdfIngest: (e: React.FormEvent) => void;
  reset: () => void;
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
  if (isUrlMode(mode)) {
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
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestSuccess | null>(null);

  // Poll handle for an async (queued) ingest; cleared on terminal state/unmount.
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stopPolling() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }
  useEffect(() => stopPolling, []);

  /** Poll an async ingest job until it's done/failed (or a ~5min cap). */
  function startPolling(jobId: string) {
    stopPolling();
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/ingest/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "done" && data.slug) {
            setResult({ primarySlug: data.slug, relatedUpdated: [] });
            setStage("success");
            return;
          }
          if (data.status === "failed") {
            setError(data.error || "Ingestion failed");
            setStage("form");
            return;
          }
        }
      } catch {
        // Transient network blip — keep polling.
      }
      if (tries >= 100) {
        setError("Still processing — check Recent ingests in a moment.");
        setStage("form");
        return;
      }
      pollRef.current = setTimeout(tick, 3000);
    };
    pollRef.current = setTimeout(tick, 2000);
  }

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    // Clear the fields that don't belong to the new mode so a stale value never
    // leaks across a tab switch.
    if (newMode !== "text") {
      setTitle("");
      setContent("");
    }
    if (!isUrlMode(newMode)) {
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
   * Handle the `{queued, jobId}` response shared by every submit path: remember
   * the job, switch to the processing view, and start polling. Returns false (so
   * the caller can surface an error) when the response wasn't a queued job.
   */
  function onQueued(data: IngestResponse): boolean {
    if (data.queued && data.jobId) {
      rememberRecentJob(data.jobId);
      // Inline fallback (dev/tests) returns the slug immediately, but the poll
      // path resolves it uniformly — just start polling.
      setStage("queued");
      startPolling(data.jobId);
      return true;
    }
    return false;
  }

  /** URL / text submit → queue the ingest → poll the job. */
  async function handleSourceSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateIngestInput(mode, title, content, url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const usesUrl = isUrlMode(mode);
      const body: Record<string, unknown> = usesUrl
        ? { url: url.trim() }
        : { title, content };
      if (vaultId) body.vaultId = vaultId;

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
      if (!onQueued(data)) {
        setError("Unexpected response — the ingest was not queued.");
        setStage("form");
      }
    } catch {
      setError("Network error — could not reach the server");
      setStage("form");
    } finally {
      setLoading(false);
    }
  }

  /** Image ingest: POST (URL JSON or upload multipart) → queue → poll. */
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
        if (vaultId) fd.append("vaultId", vaultId);
        res = await fetch("/api/ingest/image", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: imageUrl.trim(),
            title: title.trim() || undefined,
            vaultId: vaultId || undefined,
          }),
        });
      }

      const data: IngestResponse = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setStage("form");
        return;
      }
      if (!onQueued(data)) {
        setError("Unexpected response — the ingest was not queued.");
        setStage("form");
      }
    } catch {
      setError("Network error — could not reach the server");
      setStage("form");
    } finally {
      setLoading(false);
    }
  }

  /** PDF ingest: POST (URL JSON or upload multipart) → queue → poll. */
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
        if (vaultId) fd.append("vaultId", vaultId);
        res = await fetch("/api/ingest/pdf", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfUrl: pdfUrl.trim(),
            title: title.trim() || undefined,
            vaultId: vaultId || undefined,
          }),
        });
      }

      const data: IngestResponse = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setStage("form");
        return;
      }
      if (!onQueued(data)) {
        setError("Unexpected response — the ingest was not queued.");
        setStage("form");
      }
    } catch {
      setError("Network error — could not reach the server");
      setStage("form");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    stopPolling();
    setTitle("");
    setContent("");
    setUrl("");
    setImageUrl("");
    setImageFile(null);
    setPdfUrl("");
    setPdfFile(null);
    setVaultId(null);
    setError(null);
    setResult(null);
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
    vaultId,
    loading,
    error,
    result,
    switchMode,
    setTitle,
    setContent,
    setUrl,
    setImageUrl,
    setImageFile,
    setPdfUrl,
    setPdfFile,
    setVaultId,
    handleSourceSubmit,
    handleImageIngest,
    handlePdfIngest,
    reset,
  };
}
