"use client";

import { useUser, SignInButton } from "@clerk/nextjs";
import { useStreamingQuery } from "@/hooks/useStreamingQuery";
import { QueryResultPanel } from "./QueryResultPanel";
import { Alert } from "./Alert";

const EXAMPLES = [
  "What is harness engineering?",
  "How is yopedia different from RAG?",
  "What are the agentic harness patterns?",
];

/**
 * The homepage hero interaction: ask the accumulated wiki a question and get a
 * cited answer streamed in place. Querying is signed-in-only (the API 401s
 * anonymous POSTs), so signed-out visitors see the box with example prompts and
 * a "Sign in to ask" CTA — no LLM call until they're authenticated.
 */
export function HomeAsk() {
  const { isSignedIn } = useUser();
  const { question, setQuestion, result, streaming, error, submit, isProcessing } =
    useStreamingQuery();

  return (
    <div>
      <form onSubmit={isSignedIn ? submit : (e) => e.preventDefault()}>
        <div className="rounded-xl border border-border bg-surface/40 focus-within:border-accent/50 transition-colors">
          <textarea
            value={question}
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
                  onClick={() => isSignedIn && setQuestion(q)}
                  className="receipt rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-foreground transition-colors"
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

      {!isSignedIn && (
        <p className="mt-2 text-xs text-muted">
          Answers query the wiki live and cite their sources — sign in to ask.
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {result && (
        <div className="mt-6">
          <QueryResultPanel
            result={result}
            streaming={streaming}
            question={question}
            currentHistoryId={null}
          />
        </div>
      )}
    </div>
  );
}
