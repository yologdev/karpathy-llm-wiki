import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

// Public, human-readable render of AGENT-API.md — the guide for using yopedia
// as an agent (linked from the agent credential panel). The markdown is read at
// BUILD time and baked into a static page, so there is no filesystem read at
// runtime (works on the Cloudflare Workers deploy).
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Agent API — yopedia",
  description:
    "How an external agent runtime uses its yopedia credential to ingest and consume content.",
};

export default async function AgentApiPage() {
  const content = await fs.readFile(
    path.join(process.cwd(), "AGENT-API.md"),
    "utf8",
  );
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <MarkdownRenderer content={content} />
    </main>
  );
}
