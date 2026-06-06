"use client";

import { useEffect, useRef, useState } from "react";
import { useUser, useClerk, SignInButton } from "@clerk/nextjs";
import { useStreamingQuery } from "@/hooks/useStreamingQuery";
import { QueryResultPanel } from "./QueryResultPanel";
import { Alert } from "./Alert";
import { Icon } from "./folio/icons";

const EXAMPLES = [
  "What is harness engineering?",
  "How is yopedia different from RAG?",
  "What are the agentic harness patterns?",
];

// One free taste per browser: after a signed-out visitor sees one demo answer,
// the next interaction prompts sign-in.
const DEMO_USED_KEY = "yopedia_demo_used";

/**
 * The homepage hero. Signed-in: ask the wiki live, streamed in place. Signed
 * OUT: clicking a sample question shows a cached, pre-computed answer (a "taste"
 * — no LLM cost, served from /api/query/demo) with a simulated stream; the next
 * question enforces sign-in.
 */
export function HomeAsk({ showExamples = true }: { showExamples?: boolean }) {
  const { isSignedIn } = useUser();
  const { openSignIn } = useClerk();
  const { question, setQuestion, result, streaming, error, submit, isProcessing } =
    useStreamingQuery();

  // Signed-out demo state.
  const [demo, setDemo] = useState<{ answer: string; sources: string[] } | null>(
    null,
  );
  const [demoStreaming, setDemoStreaming] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoQuestion, setDemoQuestion] = useState("");
  const revealRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (revealRef.current) clearInterval(revealRef.current);
    },
    [],
  );

  function demoUsed(): boolean {
    try {
      return localStorage.getItem(DEMO_USED_KEY) === "1";
    } catch {
      return false;
    }
  }

  async function runDemo(q: string) {
    if (revealRef.current) clearInterval(revealRef.current);
    setDemoQuestion(q);
    setDemoError(null);
    setDemo(null);
    setDemoStreaming(false);
    setDemoLoading(true);
    try {
      const res = await fetch(`/api/query/demo?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setDemoError(data.error ?? "Demo unavailable right now.");
        setDemoLoading(false);
        return;
      }
      try {
        localStorage.setItem(DEMO_USED_KEY, "1");
      } catch {
        /* private mode — fine, just no persistence */
      }
      const full: string = data.answer ?? "";
      const sources: string[] = Array.isArray(data.sources) ? data.sources : [];
      // Simulate a live stream by revealing the cached answer progressively.
      setDemoLoading(false);
      setDemoStreaming(true);
      setDemo({ answer: "", sources });
      let i = 0;
      const step = Math.max(2, Math.ceil(full.length / 110));
      revealRef.current = setInterval(() => {
        i = Math.min(full.length, i + step);
        setDemo({ answer: full.slice(0, i), sources });
        if (i >= full.length) {
          if (revealRef.current) clearInterval(revealRef.current);
          setDemoStreaming(false);
        }
      }, 16);
    } catch {
      setDemoError("Failed to load the demo answer.");
      setDemoLoading(false);
    }
  }

  function onChip(q: string) {
    if (isSignedIn) {
      setQuestion(q);
      return;
    }
    // Signed-out: one free demo, then enforce sign-in.
    if (demoUsed()) {
      openSignIn();
      return;
    }
    runDemo(q);
  }

  const guestBusy = demoLoading || demoStreaming;

  return (
    <div>
      <form
        onSubmit={
          isSignedIn
            ? submit
            : (e) => {
                e.preventDefault();
                openSignIn();
              }
        }
      >
        <div
          style={{
            border: "1px solid var(--rule-strong)",
            borderRadius: 18,
            background: "var(--paper-2)",
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          <div
            className="row"
            style={{ gap: 14, padding: "20px 22px 6px", alignItems: "flex-start" }}
          >
            <span style={{ color: "var(--accent)", paddingTop: 3 }}>
              <Icon.spark width="22" height="22" />
            </span>
            <textarea
              value={isSignedIn ? question : demoQuestion}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Consult the commons — ask, and get an answer cited to the pages it stands on…"
              rows={2}
              disabled={!isSignedIn || isProcessing}
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                resize: "none",
                background: "transparent",
                fontFamily: "var(--font-read)",
                fontSize: 20,
                lineHeight: 1.4,
                color: "var(--ink)",
                paddingTop: 2,
              }}
              className="placeholder:text-faint disabled:opacity-70"
            />
          </div>
          <div
            className="spread"
            style={{
              padding: "12px 16px 14px 22px",
              borderTop: "1px solid var(--rule)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* Example questions reference existing pages — hide them on an empty
                commons (they'd ask about content that isn't there yet). */}
            <div
              className="row"
              style={{ gap: 8, flexWrap: "wrap", flex: "1 1 320px", minWidth: 0 }}
            >
              {showExamples &&
                EXAMPLES.map((q) => (
                  <button
                    type="button"
                    key={q}
                    onClick={() => onChip(q)}
                    disabled={guestBusy}
                    className="receipt folio-chip disabled:opacity-50"
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted)",
                      background: "transparent",
                      whiteSpace: "nowrap",
                      border: "1px solid var(--rule)",
                      borderRadius: 999,
                      padding: "5px 11px",
                    }}
                  >
                    {q}
                  </button>
                ))}
            </div>
            {isSignedIn ? (
              <button
                type="submit"
                disabled={isProcessing || !question.trim()}
                className="btn primary shrink-0 disabled:opacity-50"
              >
                {isProcessing ? "Thinking…" : "Ask"}
                {!isProcessing && <Icon.arrow width="16" height="16" />}
              </button>
            ) : (
              <SignInButton mode="modal">
                <button className="btn primary shrink-0">
                  Ask <Icon.arrow width="16" height="16" />
                </button>
              </SignInButton>
            )}
          </div>
        </div>
        <p
          className="receipt"
          style={{ fontSize: 11.5, color: "var(--faint)", margin: "10px 2px 0" }}
        >
          Answers query the wiki live and cite their sources. ⌘↵ to ask.
        </p>
      </form>

      {showExamples && !isSignedIn && !demo && !demoLoading && !demoError && (
        <p className="mt-2 text-xs text-muted">
          Try a sample question for a taste — sign in to ask your own.
        </p>
      )}

      {(error || demoError) && (
        <div className="mt-4">
          <Alert variant="error">{error ?? demoError}</Alert>
        </div>
      )}

      {!isSignedIn && demoLoading && (
        <p className="mt-4 text-sm text-muted">Thinking…</p>
      )}

      {/* Signed-in live result */}
      {isSignedIn && result && (
        <div className="mt-6">
          <QueryResultPanel
            result={result}
            streaming={streaming}
            question={question}
            currentHistoryId={null}
          />
        </div>
      )}

      {/* Signed-out demo result (read-only — no save) */}
      {!isSignedIn && demo && (
        <div className="mt-6">
          <QueryResultPanel
            result={demo}
            streaming={demoStreaming}
            question={demoQuestion}
            currentHistoryId={null}
            readOnly
          />
          {!demoStreaming && (
            <button
              type="button"
              onClick={() => openSignIn()}
              className="mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors"
            >
              Sign in to ask your own →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
