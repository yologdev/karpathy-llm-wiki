"use client";

import { useState } from "react";
import { Icon } from "@/components/folio/icons";
import { logger } from "@/lib/logger";

/**
 * "Share this page" — copies the page's full-screen share URL (`/share/...`) to
 * the clipboard. The full-screen view is the clean, chrome-less surface meant
 * for sharing, so that's the link we hand out (not the in-app article URL).
 */
export function SharePageButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    const url =
      typeof window !== "undefined" ? window.location.origin + path : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("share", "copy share link failed", err);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy a shareable full-screen link to this page"
      // Match the sibling "Ask about this page" button exactly (.btn pill).
      className="btn"
      style={{
        width: "100%",
        justifyContent: "center",
        fontSize: 13,
        marginTop: 10,
        cursor: "pointer",
      }}
    >
      {copied ? (
        <>
          <Icon.check width="15" height="15" /> Link copied
        </>
      ) : (
        <>
          <Icon.link width="15" height="15" /> Share this page
        </>
      )}
    </button>
  );
}
