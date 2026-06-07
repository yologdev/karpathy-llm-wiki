"use client";

import { useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Alert } from "@/components/Alert";
import { Icon } from "@/components/folio/icons";
import type { IngestPreviewMeta } from "@/lib/types";

export interface PreviewData {
  slug: string;
  previewContent: string;
  relatedPages: string[];
  /** Original title used for the ingest call. */
  title: string;
  /** Original raw content used for the ingest call. */
  content: string;
  /** Original URL if using URL mode. */
  url?: string;
  /** Provenance carried through a text-path commit (PDF/image review flow). */
  sourceType?: string;
  sourceUrl?: string;
  /** Structured page metadata for the review card (from the preview response). */
  meta?: IngestPreviewMeta;
}

interface Props {
  preview: PreviewData;
  loading: boolean;
  onApprove: () => void;
  onCancel: () => void;
  error: string | null;
}

/** A small 0–1 confidence meter (5 segments) + the numeric value. */
function ConfidenceBar({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value * 5)));
  return (
    <span className="row" style={{ gap: 6, alignItems: "center" }}>
      <span className="row" style={{ gap: 2 }} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 13,
              borderRadius: 1,
              background: i < filled ? "var(--accent)" : "var(--rule-strong)",
            }}
          />
        ))}
      </span>
      <span className="receipt" style={{ fontSize: 13, color: "var(--ink)" }}>
        {value.toFixed(2)}
      </span>
    </span>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 0 }}>
      <p className="fmark" style={{ marginBottom: 8 }}>
        {label}
      </p>
      <div style={{ fontSize: 14, color: "var(--ink)" }}>{children}</div>
    </div>
  );
}

export function IngestReview({ preview, loading, onApprove, onCancel, error }: Props) {
  const [showDraft, setShowDraft] = useState(false);
  const meta = preview.meta;
  const title = meta?.title || preview.title || preview.slug;

  return (
    <div>
      <p
        className="receipt"
        style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 16px" }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: 999,
            background: "var(--accent)",
            marginRight: 9,
            verticalAlign: "middle",
          }}
        />
        synthesized · review before publishing to the commons
      </p>

      {/* The page as it will appear */}
      <div
        style={{
          border: "1px solid var(--rule-strong)",
          borderRadius: 18,
          background: "var(--paper-2)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "26px 28px 24px" }}>
          {meta && meta.tags.length > 0 && (
            <p
              className="receipt"
              style={{ fontSize: 13, color: "var(--accent)", margin: "0 0 14px" }}
            >
              {meta.tags.map((t) => `#${t}`).join("  ")}
            </p>
          )}
          <h2
            className="display"
            style={{ fontSize: "clamp(26px,3.2vw,38px)", margin: 0 }}
          >
            {title}
          </h2>
          {meta?.summary && (
            <p
              style={{
                fontFamily: "var(--font-read)",
                fontStyle: "italic",
                fontSize: 18,
                lineHeight: 1.5,
                color: "var(--ink-2)",
                margin: "16px 0 0",
              }}
            >
              {meta.summary}
            </p>
          )}
        </div>

        {/* Meta row */}
        {meta && (
          <div
            className="row"
            style={{
              gap: 24,
              flexWrap: "wrap",
              padding: "20px 28px 22px",
              borderTop: "1px solid var(--rule)",
            }}
          >
            <MetaCell label="owner">
              <span className="row" style={{ gap: 7, alignItems: "center" }}>
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "var(--accent)",
                  }}
                />
                @{meta.owner || "you"}
              </span>
            </MetaCell>
            <MetaCell label="via">
              <span className="row" style={{ gap: 7, alignItems: "center" }}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    border: "1.5px solid var(--muted)",
                  }}
                />
                yoyo
              </span>
            </MetaCell>
            <MetaCell label="confidence">
              <ConfidenceBar value={meta.confidence} />
            </MetaCell>
            <MetaCell label="review by">
              <span className="receipt" style={{ fontSize: 13.5 }}>
                {meta.reviewBy}
              </span>
            </MetaCell>
          </div>
        )}
      </div>

      {/* Inspect the full draft before publishing */}
      <button
        type="button"
        onClick={() => setShowDraft((v) => !v)}
        className="receipt"
        style={{
          marginTop: 20,
          fontSize: 12.5,
          color: "var(--muted)",
          background: "transparent",
          border: 0,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {showDraft ? "▾ Hide full draft" : "▸ View full draft"}
      </button>
      {showDraft && (
        <div
          style={{
            marginTop: 14,
            border: "1px solid var(--rule)",
            borderRadius: 12,
            padding: "20px 24px",
            background: "var(--paper)",
          }}
        >
          <MarkdownRenderer content={preview.previewContent} />
        </div>
      )}

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {/* Actions */}
      <div className="row" style={{ gap: 20, alignItems: "center", marginTop: 28 }}>
        <button
          type="button"
          onClick={onApprove}
          disabled={loading}
          className="btn primary disabled:opacity-50"
        >
          {loading ? "Publishing…" : "Publish to the commons"}
          {!loading && <Icon.arrow width="16" height="16" />}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
