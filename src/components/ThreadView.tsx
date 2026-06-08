"use client";

import { useState } from "react";
import type { TalkThread } from "@/lib/types";
import { CommentNode, buildCommentTree } from "./CommentNode";

interface ThreadViewProps {
  thread: TalkThread;
  replyingTo: string | null;
  replySubmitting: boolean;
  onReplyClick: (commentId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, body: string) => Promise<void>;
  onResolve: (status: "open" | "resolved" | "wontfix") => void;
  onAddComment: (body: string) => Promise<void>;
  /** Ask yoyo to address this thread (enqueue a reconcile task). Omitted when
   *  the viewer isn't signed in. */
  onAskYoyo?: () => Promise<void>;
  inputClasses: string;
  /** The authenticated user's handle, shown as a read-only author badge. Null when not signed in. */
  userHandle: string | null;
  /** The page owner's handle — used to gate resolve/reopen button visibility. */
  pageOwner: string;
}

export function ThreadView({
  thread,
  replyingTo,
  replySubmitting,
  onReplyClick,
  onCancelReply,
  onSubmitReply,
  onResolve,
  onAddComment,
  onAskYoyo,
  inputClasses,
  userHandle,
  pageOwner,
}: ThreadViewProps) {
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [asking, setAsking] = useState(false);

  // Only the thread author (first comment's author), page owner, or admin may
  // change thread status. Hide the buttons entirely for everyone else so they
  // don't get a confusing 403 on click.
  const threadAuthor = thread.comments[0]?.author;
  const canResolve =
    !!userHandle &&
    (userHandle === threadAuthor || userHandle === pageOwner);

  async function handleAskYoyo() {
    if (!onAskYoyo) return;
    setAsking(true);
    try {
      await onAskYoyo();
    } finally {
      setAsking(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    setCommenting(true);
    try {
      await onAddComment(commentBody);
      setCommentBody("");
    } finally {
      setCommenting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-foreground/10 pt-3">
      {/* Comments — nested tree */}
      <div className="space-y-2">
        {buildCommentTree(thread.comments).map((rootNode) => (
          <CommentNode
            key={rootNode.comment.id}
            node={rootNode}
            depth={0}
            replyingTo={replyingTo}
            onReplyClick={onReplyClick}
            onCancelReply={onCancelReply}
            onSubmitReply={onSubmitReply}
            inputClasses={inputClasses}
            replying={replySubmitting}
            userHandle={userHandle}
          />
        ))}
      </div>

      {/* Resolve / Won't Fix / Ask-yoyo buttons for open threads */}
      {thread.status === "open" && (onAskYoyo || canResolve) && (
        <div className="flex flex-wrap gap-2">
          {onAskYoyo && (
            <button
              type="button"
              onClick={handleAskYoyo}
              disabled={asking}
              title="Ask yoyo to read this thread and update the page"
              className="rounded bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {asking ? "Queuing…" : "🛠 Ask yoyo to address this"}
            </button>
          )}
          {canResolve && (
            <>
              <button
                type="button"
                onClick={() => onResolve("resolved")}
                className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
              >
                Resolve
              </button>
              <button
                type="button"
                onClick={() => onResolve("wontfix")}
                className="rounded bg-gray-500 px-3 py-1 text-xs text-white hover:bg-gray-600"
              >
                Won&apos;t Fix
              </button>
            </>
          )}
        </div>
      )}

      {/* Reopen button for resolved/wontfix threads */}
      {canResolve && (thread.status === "resolved" || thread.status === "wontfix") && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onResolve("open")}
            className="rounded bg-yellow-600 px-3 py-1 text-xs text-white hover:bg-yellow-700"
          >
            Reopen
          </button>
        </div>
      )}

      {/* Top-level comment form — only for authenticated users on open threads */}
      {userHandle && thread.status === "open" ? (
        <form onSubmit={handleAddComment} className="space-y-2 border-t border-foreground/10 pt-3">
          <p className="text-xs font-medium text-foreground/50 uppercase tracking-wide">Add a comment</p>
          <p className="flex items-center gap-1.5 text-xs text-foreground/50">
            Commenting as <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-medium text-foreground/70">@{userHandle}</span>
          </p>
          <textarea placeholder="Write a comment…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} required rows={2} className={inputClasses} />
          <button type="submit" disabled={commenting} className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {commenting ? "Posting…" : "Comment"}
          </button>
        </form>
      ) : userHandle ? (
        <div className="border-t border-foreground/10 pt-3">
          <p className="text-sm text-foreground/50 italic">
            This thread is {thread.status === "wontfix" ? "closed as won\u2019t fix" : "resolved"}. Reopen it to add comments.
          </p>
        </div>
      ) : (
        <div className="border-t border-foreground/10 pt-3">
          <p className="text-sm text-foreground/50">Sign in to join the discussion.</p>
        </div>
      )}
    </div>
  );
}
