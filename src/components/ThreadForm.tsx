"use client";

import { useState } from "react";

interface ThreadFormProps {
  onSubmit: (title: string, author: string, body: string) => Promise<void>;
  onCancel: () => void;
  creating: boolean;
  inputClasses: string;
}

export function ThreadForm({ onSubmit, onCancel, creating, inputClasses }: ThreadFormProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(title, author, body);
    setTitle("");
    setAuthor("");
    setBody("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded border border-foreground/10 p-3">
      <input type="text" placeholder="Thread title" value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClasses} />
      <input type="text" placeholder="Your name" value={author} onChange={(e) => setAuthor(e.target.value)} required className={inputClasses} />
      <textarea placeholder="What would you like to discuss?" value={body} onChange={(e) => setBody(e.target.value)} required rows={3} className={inputClasses} />
      <div className="flex gap-2">
        <button type="submit" disabled={creating} className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {creating ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="rounded px-3 py-1 text-sm text-foreground/50 hover:text-foreground/70">
          Cancel
        </button>
      </div>
    </form>
  );
}
