"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { SrcChip } from "@/components/folio/primitives";
import type { SourceEntry } from "@/lib/types";

/** One selectable source in the raw browser. */
export interface RawItem {
  /** React key + selection id. */
  key: string;
  /** snapshot = per-source raw; legacy = the single latest blob; uncaptured =
   *  a source whose raw predates per-source storage (nothing to show). */
  kind: "snapshot" | "legacy" | "uncaptured";
  /** Per-source raw id (snapshot only); null for legacy/uncaptured. */
  sourceId: string | null;
  type: SourceEntry["type"];
  url: string;
  fetched: string;
  triggeredBy: string;
}

interface Props {
  slug: string;
  items: RawItem[];
  initialKey: string;
  /** Pre-fetched content for the initial item (avoids a load flash). */
  initialContent: string | null;
  backHref: string;
}

/** Hard ceiling on how much raw content we render inline. */
const MAX_INLINE = 500 * 1024; // 500 KB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** Human label for a source: its host, or "Pasted text" / "Uploaded file". */
function sourceLabel(item: RawItem): string {
  if (item.url === "text-paste") return "Pasted text";
  if (item.url === "upload") return "Uploaded file";
  try {
    return new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    return item.url;
  }
}

/** Download URL for an item (per-source when it's a snapshot). */
function downloadHref(slug: string, item: RawItem): string {
  return item.sourceId
    ? `/api/raw/${slug}?source=${encodeURIComponent(item.sourceId)}`
    : `/api/raw/${slug}`;
}

/**
 * Does the raw content carry markdown structure worth rendering (headings,
 * images, lists, blockquotes, or paragraph breaks)? Extracted PDF / pasted text
 * is often a structureless blob — rendering THAT through markdown collapses it
 * into one giant paragraph, so we show it as faithful preformatted text instead.
 */
function looksLikeMarkdown(s: string): boolean {
  const t = s.trimStart();
  // Require actual markdown markers — NOT bare blank lines, which extracted PDF
  // text also has (rendering THAT through markdown would re-collapse its
  // layout-preserved line breaks into a wall).
  return (
    /(^|\n)#{1,6}\s/.test(t) || // headings
    /!\[[^\]]*\]\([^)]+\)/.test(t) || // images
    /\[[^\]]+\]\([^)\s]+\)/.test(t) || // links
    /(^|\n)\s*[-*+]\s/.test(t) || // bullet lists
    /(^|\n)\s*\d+\.\s/.test(t) || // numbered lists
    /(^|\n)>\s/.test(t) || // blockquotes
    /(^|\n)```/.test(t) || // code fences
    /(^|\n)\|.+\|/.test(t) // tables
  );
}

/** Render raw content: markdown when it's structured, else faithful plaintext. */
function RawContent({ text }: { text: string }) {
  if (looksLikeMarkdown(text)) {
    return <MarkdownRenderer content={text} />;
  }
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground/80">
      {text}
    </pre>
  );
}

export function RawSourceBrowser({
  slug,
  items,
  initialKey,
  initialContent,
  backHref,
}: Props) {
  const [selectedKey, setSelectedKey] = useState(initialKey);
  // Per-item content cache: undefined = not loaded, null = errored/empty.
  const [cache, setCache] = useState<Record<string, string | null>>(() =>
    initialContent !== null ? { [initialKey]: initialContent } : {},
  );
  const [loading, setLoading] = useState(false);

  const selected = items.find((i) => i.key === selectedKey) ?? items[0];

  const load = useCallback(
    async (item: RawItem) => {
      if (item.kind === "uncaptured") return;
      if (cache[item.key] !== undefined) return; // already loaded (or errored)
      setLoading(true);
      try {
        const res = await fetch(downloadHref(slug, item));
        const text = res.ok ? await res.text() : null;
        setCache((c) => ({ ...c, [item.key]: text }));
      } catch {
        setCache((c) => ({ ...c, [item.key]: null }));
      } finally {
        setLoading(false);
      }
    },
    [slug, cache],
  );

  // Fetch the selected item's content on demand (skips the pre-seeded initial).
  useEffect(() => {
    if (selected) void load(selected);
  }, [selected, load]);

  const content = selected ? cache[selected.key] : undefined;

  return (
    <main className="mx-auto max-w-6xl px-6" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <Link
        href={backHref}
        className="text-sm text-foreground/60 hover:text-foreground transition-colors"
      >
        ← Back to page
      </Link>

      <p className="fmark" style={{ margin: "22px 0 18px" }}>
        sources · {items.length}
      </p>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Source rail */}
        <aside className="lg:w-72 shrink-0">
          {/* Mobile: a select; desktop: the list below. */}
          <select
            className="lg:hidden w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm mb-4"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
          >
            {items.map((it) => (
              <option key={it.key} value={it.key}>
                {sourceLabel(it)} · {it.fetched}
              </option>
            ))}
          </select>

          <ul className="hidden lg:flex flex-col gap-1.5">
            {items.map((it) => {
              const active = it.key === selectedKey;
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(it.key)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      active
                        ? "border-foreground/40 bg-foreground/5"
                        : "border-foreground/10 hover:bg-foreground/[0.03]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <SrcChip type={it.type} />
                      <span className="truncate text-sm font-medium">
                        {sourceLabel(it)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-foreground/50">
                      {it.fetched} · @{it.triggeredBy}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Content pane */}
        <section className="flex-1 min-w-0">
          {selected && (
            <>
              <div className="mb-3 text-sm text-foreground/60 break-all">
                {selected.url !== "text-paste" && selected.url !== "upload" ? (
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
                  >
                    {selected.url}
                  </a>
                ) : (
                  <span>{sourceLabel(selected)}</span>
                )}
                {selected.kind !== "uncaptured" && (
                  <>
                    {" · "}
                    <a
                      href={downloadHref(slug, selected)}
                      className="text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
                    >
                      Download
                    </a>
                  </>
                )}
              </div>

              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4 max-h-[72vh] overflow-auto">
                {selected.kind === "uncaptured" ? (
                  <p className="text-sm text-foreground/50">
                    Raw content for this source wasn&apos;t captured (it was
                    ingested before per-source raw was stored). Only its
                    provenance is recorded.
                  </p>
                ) : content === undefined ? (
                  <p className="text-sm text-foreground/40">
                    {loading ? "Loading…" : ""}
                  </p>
                ) : content === null ? (
                  <p className="text-sm text-foreground/50">
                    Couldn&apos;t load this source.
                  </p>
                ) : content.length > MAX_INLINE ? (
                  <>
                    <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                      Source is {formatSize(content.length)} — showing the first{" "}
                      {formatSize(MAX_INLINE)}. Use{" "}
                      <a
                        href={downloadHref(slug, selected)}
                        className="underline hover:no-underline"
                      >
                        Download
                      </a>{" "}
                      for the full content.
                    </div>
                    <RawContent text={content.slice(0, MAX_INLINE)} />
                  </>
                ) : (
                  <RawContent text={content} />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
