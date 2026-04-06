import { callLLM, hasLLMKey } from "./llm";
import { listWikiPages, readWikiPage } from "./wiki";
import type { QueryResult } from "./types";

const SYSTEM_PROMPT_TEMPLATE = `You are a wiki assistant. Answer the user's question using ONLY the wiki pages provided below.

Rules:
- Base your answer strictly on the wiki content provided
- Cite your sources using markdown links: [Page Title](slug.md)
- If the wiki doesn't contain enough information to answer, say so clearly
- Format your answer in markdown

Wiki pages:
{context}`;

/**
 * Build a context string from all wiki pages, with clear page boundaries.
 */
async function buildContext(): Promise<{
  context: string;
  slugs: string[];
}> {
  const entries = await listWikiPages();
  if (entries.length === 0) {
    return { context: "", slugs: [] };
  }

  const slugs: string[] = [];
  const parts: string[] = [];

  for (const entry of entries) {
    const page = await readWikiPage(entry.slug);
    if (page) {
      slugs.push(page.slug);
      parts.push(
        `=== Page: ${page.title} (slug: ${page.slug}) ===\n${page.content}`,
      );
    }
  }

  return { context: parts.join("\n\n"), slugs };
}

/**
 * Extract cited wiki slugs from the LLM response.
 * Scans for markdown link patterns like `](slug.md)`.
 */
function extractCitedSlugs(
  answer: string,
  availableSlugs: string[],
): string[] {
  const pattern = /\]\(([^)]+?)\.md\)/g;
  const cited = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(answer)) !== null) {
    const slug = match[1];
    if (availableSlugs.includes(slug)) {
      cited.add(slug);
    }
  }

  return Array.from(cited);
}

/**
 * Query the wiki with a user question.
 *
 * Loads all wiki pages, sends them as context to the LLM along with the
 * question, and returns a cited answer.
 */
export async function query(question: string): Promise<QueryResult> {
  const { context, slugs } = await buildContext();

  // Empty wiki — nothing to query
  if (slugs.length === 0) {
    return {
      answer:
        "The wiki is empty. Please [ingest some content](/ingest) first so I have something to answer from.",
      sources: [],
    };
  }

  // No API key — return a helpful fallback
  if (!hasLLMKey()) {
    const pageList = slugs.map((s) => `- ${s}`).join("\n");
    return {
      answer: `**No API key configured.** Set an API key (\`ANTHROPIC_API_KEY\`, \`OPENAI_API_KEY\`, etc.) to enable querying.\n\nYour wiki currently contains these pages:\n${pageList}`,
      sources: [],
    };
  }

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{context}", context);
  const answer = await callLLM(systemPrompt, question);
  const sources = extractCitedSlugs(answer, slugs);

  return { answer, sources };
}
