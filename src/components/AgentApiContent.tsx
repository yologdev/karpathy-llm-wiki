"use client";

import { useEffect, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

/**
 * Renders the agent-API guide by fetching the static `public/agent-api.md`
 * asset and rendering it client-side. We deliberately do NOT read the file on
 * the server: the Cloudflare Workers runtime has no filesystem, so an
 * `fs.readFile` in the page handler 500s. A static asset + client fetch is
 * Workers-safe (the .md is also directly fetchable at /agent-api.md).
 */
export function AgentApiContent() {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/agent-api.md")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => active && setContent(text))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-foreground/60">
        Couldn&rsquo;t load the guide. View it directly at{" "}
        <a href="/agent-api.md" className="underline hover:text-foreground">
          /agent-api.md
        </a>
        .
      </p>
    );
  }
  if (content === null) {
    return <p className="text-foreground/60">Loading…</p>;
  }
  return <MarkdownRenderer content={content} />;
}
