import type { Metadata } from "next";
import { AgentApiContent } from "@/components/AgentApiContent";

// Public guide for using yopedia as an agent. The markdown lives as a static
// asset (public/agent-api.md) and is rendered client-side — NOT read from the
// filesystem on the server, which would 500 on the Cloudflare Workers runtime.
export const metadata: Metadata = {
  title: "Agent API — yopedia",
  description:
    "How an external agent runtime uses its yopedia credential to ingest and consume content.",
};

export default function AgentApiPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <AgentApiContent />
    </main>
  );
}
