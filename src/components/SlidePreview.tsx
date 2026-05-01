"use client";

import { useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface SlidePreviewProps {
  content: string; // raw Marp markdown from LLM
}

/**
 * Strip the Marp frontmatter block and split on `---` slide separators.
 * Returns an array of slide markdown strings.
 */
function parseSlides(content: string): string[] {
  // Strip leading frontmatter (---\n...\n---\n)
  const stripped = content.replace(/^---\n[\s\S]*?\n---\n?\n?/, "");
  // Split on slide separator lines
  return stripped
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function SlidePreview({ content }: SlidePreviewProps) {
  const slides = parseSlides(content);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const total = slides.length;

  if (total === 0) {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-foreground/60 italic">No slides found.</p>
      </div>
    );
  }

  if (showAll) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground/60">
            All {total} slide{total !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowAll(false)}
            className="rounded-lg border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 transition-colors"
          >
            Single view
          </button>
        </div>
        {slides.map((slide, i) => (
          <div
            key={i}
            className="relative rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6"
          >
            <span className="absolute top-3 right-3 text-xs font-medium text-foreground/40 bg-foreground/5 rounded-full px-2 py-0.5">
              {i + 1}
            </span>
            <MarkdownRenderer content={slide} />
          </div>
        ))}
      </div>
    );
  }

  const safeIndex = Math.min(currentIndex, total - 1);

  return (
    <div className="space-y-4">
      {/* Slide card */}
      <div className="relative rounded-lg border border-foreground/10 bg-foreground/[0.02] p-6 min-h-[12rem]">
        <span className="absolute top-3 right-3 text-xs font-medium text-foreground/40 bg-foreground/5 rounded-full px-2 py-0.5">
          {safeIndex + 1}
        </span>
        <MarkdownRenderer content={slides[safeIndex]} />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={safeIndex === 0}
          aria-label="Previous slide"
          className="rounded-lg border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>

        <span
          className="text-sm text-foreground/60"
          aria-live="polite"
          aria-atomic="true"
        >
          Slide {safeIndex + 1} of {total}
        </span>

        <button
          onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
          disabled={safeIndex === total - 1}
          aria-label="Next slide"
          className="rounded-lg border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>

      {/* Show all toggle */}
      {total > 1 && (
        <div className="text-center">
          <button
            onClick={() => setShowAll(true)}
            className="text-sm text-foreground/50 hover:text-foreground/80 underline transition-colors"
          >
            Show all slides
          </button>
        </div>
      )}
    </div>
  );
}
