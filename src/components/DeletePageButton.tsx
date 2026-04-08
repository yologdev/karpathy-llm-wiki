"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeletePageButtonProps {
  slug: string;
}

export function DeletePageButton({ slug }: DeletePageButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm("Delete this page? This cannot be undone.")
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wiki/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `delete failed (${res.status})`);
      }
      router.push("/wiki");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete page"}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-600">Error: {error}</p>
      )}
    </>
  );
}
