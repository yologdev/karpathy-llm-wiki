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
  onSubmitReply: (parentId: string, author: string, body: string) => Promise<void>;
  onResolve: (status: "resolved" | "wontfix") => void;
  onAddComment: (author: string, body: string) => Promise<void>;
  inputClasses: string;
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
  inputClasses,
}: ThreadViewProps) {
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    setCommenting(true);
    try {
      await onAddComment(commentAuthor, commentBody);
      setCommentAuthor("");
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
          />
        ))}
      </div>

      {/* Resolve / Won't Fix buttons for open threads */}
      {thread.status === "open" && (
        <div className="flex gap-2">
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
        </div>
      )}

      {/* Top-level comment form */}
      <form onSubmit={handleAddComment} className="space-y-2 border-t border-foreground/10 pt-3">
        <p className="text-xs font-medium text-foreground/50 uppercase tracking-wide">Add a comment</p>
        <input type="text" placeholder="Your name" value={commentAuthor} onChange={(e) => setCommentAuthor(e.target.value)} required className={inputClasses} />
        <textarea placeholder="Write a comment…" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} required rows={2} className={inputClasses} />
        <button type="submit" disabled={commenting} className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {commenting ? "Posting…" : "Comment"}
        </button>
      </form>
    </div>
  );
}
