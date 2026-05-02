"use client";

import { useState } from "react";
import type { TalkComment } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

// ---------------------------------------------------------------------------
// Comment tree builder
// ---------------------------------------------------------------------------

export interface CommentTreeNode {
  comment: TalkComment;
  children: CommentTreeNode[];
}

/** Build a tree from flat comments using parentId linkage. */
export function buildCommentTree(comments: TalkComment[]): CommentTreeNode[] {
  const nodeMap = new Map<string, CommentTreeNode>();
  const roots: CommentTreeNode[] = [];

  // Create nodes for all comments
  for (const comment of comments) {
    nodeMap.set(comment.id, { comment, children: [] });
  }

  // Link children to parents
  for (const comment of comments) {
    const node = nodeMap.get(comment.id)!;
    if (comment.parentId && nodeMap.has(comment.parentId)) {
      nodeMap.get(comment.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Recursive comment renderer
// ---------------------------------------------------------------------------

export const MAX_VISUAL_DEPTH = 3;

export interface CommentNodeProps {
  node: CommentTreeNode;
  depth: number;
  replyingTo: string | null;
  onReplyClick: (commentId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, author: string, body: string) => Promise<void>;
  inputClasses: string;
  replying: boolean;
}

export function CommentNode({
  node,
  depth,
  replyingTo,
  onReplyClick,
  onCancelReply,
  onSubmitReply,
  inputClasses,
  replying,
}: CommentNodeProps) {
  const [replyAuthor, setReplyAuthor] = useState("");
  const [replyBody, setReplyBody] = useState("");

  // Cap visual indentation at MAX_VISUAL_DEPTH
  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
  const isNested = visualDepth > 0;

  const indentClasses = isNested
    ? "ml-4 pl-3 border-l-2 border-foreground/10"
    : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmitReply(node.comment.id, replyAuthor, replyBody);
    setReplyAuthor("");
    setReplyBody("");
  }

  const isReplyFormOpen = replyingTo === node.comment.id;

  return (
    <div className={indentClasses}>
      <div className="rounded bg-foreground/5 p-2">
        <div className="flex items-center gap-2 text-xs text-foreground/50">
          <span className="font-medium text-foreground/70">{node.comment.author}</span>
          <span>·</span>
          <span>{formatRelativeTime(node.comment.created)}</span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{node.comment.body}</p>
        <button
          type="button"
          onClick={() => onReplyClick(node.comment.id)}
          className="mt-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Reply
        </button>
      </div>

      {/* Inline reply form */}
      {isReplyFormOpen && (
        <form onSubmit={handleSubmit} className="mt-2 ml-4 space-y-2 rounded border border-foreground/10 p-2">
          <input
            type="text"
            placeholder="Your name"
            value={replyAuthor}
            onChange={(e) => setReplyAuthor(e.target.value)}
            required
            className={inputClasses}
          />
          <textarea
            placeholder={`Reply to ${node.comment.author}…`}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            required
            rows={2}
            className={inputClasses}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={replying}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {replying ? "Posting…" : "Reply"}
            </button>
            <button
              type="button"
              onClick={onCancelReply}
              className="rounded px-3 py-1 text-xs text-foreground/50 hover:text-foreground/70"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Render children recursively */}
      {node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CommentNode
              key={child.comment.id}
              node={child}
              depth={depth + 1}
              replyingTo={replyingTo}
              onReplyClick={onReplyClick}
              onCancelReply={onCancelReply}
              onSubmitReply={onSubmitReply}
              inputClasses={inputClasses}
              replying={replying}
            />
          ))}
        </div>
      )}
    </div>
  );
}
