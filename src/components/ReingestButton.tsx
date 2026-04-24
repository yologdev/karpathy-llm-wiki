"use client";

import { useState } from "react";

interface ReingestButtonProps {
  slug: string;
}

export function ReingestButton({ slug }: ReingestButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleReingest() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/ingest/reingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Re-ingest failed");
        return;
      }
      setState("success");
      setMessage(`Re-ingested successfully — updated ${data.wikiPages?.length ?? 0} page(s)`);
      // Reload after a short delay so the user sees the success message
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Re-ingest failed");
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleReingest}
        disabled={state === "loading"}
        className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "loading" ? "Re-ingesting…" : "Re-ingest"}
      </button>
      {state === "success" && (
        <span className="text-xs text-green-600 dark:text-green-400">{message}</span>
      )}
      {state === "error" && (
        <span className="text-xs text-red-600 dark:text-red-400">{message}</span>
      )}
    </div>
  );
}
