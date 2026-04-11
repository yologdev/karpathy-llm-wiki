"use client";

import Link from "next/link";

export default function WikiPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">Page error</h1>
      <p className="mt-2 text-foreground/60">
        Something went wrong loading this wiki page.
      </p>
      <p className="mt-4 rounded-lg border border-red-500/20 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
        {error.message}
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          Try again
        </button>
        <Link
          href="/wiki"
          className="rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
        >
          ← Back to wiki
        </Link>
      </div>
    </main>
  );
}
