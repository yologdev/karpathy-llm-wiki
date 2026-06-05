"use client";

import { useEffect, useRef, useState } from "react";
import { useUser, useClerk, SignInButton } from "@clerk/nextjs";
import { useStreamingQuery } from "@/hooks/useStreamingQuery";
import { QueryResultPanel } from "./QueryResultPanel";
import { Alert } from "./Alert";

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
export function HomeAsk() {
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
        <div className="rounded-xl border border-border bg-surface/40 focus-within:border-accent/50 transition-colors">
          <textarea
            value={isSignedIn ? question : demoQuestion}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the accumulated brain a question…"
            rows={2}
            disabled={!isSignedIn || isProcessing}
            className="w-full resize-none bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-muted disabled:opacity-70"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => onChip(q)}
                  disabled={guestBusy}
                  className="receipt rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
            {isSignedIn ? (
              <button
                type="submit"
                disabled={isProcessing || !question.trim()}
                className="shrink-0 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {isProcessing ? "Thinking…" : "Ask →"}
              </button>
            ) : (
              <SignInButton mode="modal">
                <button className="shrink-0 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover transition-colors">
                  Sign in to ask
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </form>

      {!isSignedIn && !demo && !demoLoading && !demoError && (
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
