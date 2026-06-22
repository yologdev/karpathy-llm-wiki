import { callLLM, hasLLMKey } from "./llm";
import { QUERY_MAX_OUTPUT_TOKENS, LISTED_OTHER_PAGES } from "./constants";
import {
  listReadableWikiPages,
  writeWikiPageWithSideEffects,
  withPageCache,
  isAgentScopedType,
  isArtifactType,
} from "./wiki";
import { slugify } from "./slugify";
import { htmlToPlainText, stripHtmlFence } from "./html";
import { bakeYoyoIllustrations } from "./illustration";
import { extractSummary } from "./ingest";
import { loadPageConventions } from "./schema";
import { serializeFrontmatter } from "./frontmatter";
import { serializeSources, buildSourceEntry } from "./sources";
import {
  buildCorpusStats,
  bm25Score,
  type CorpusStats,
} from "./bm25";
import { extractCitedSlugs } from "./citations";
import { UNTRUSTED_CONTENT_RULE, wrapUntrusted } from "./untrusted";
import type { QueryResult } from "./types";
import type { QueryFormat } from "./query-format";

import {
  selectPagesForQuery,
  buildContext,
} from "./query-search";

import { resolveScopeSlugs } from "./search";

// Re-export BM25 helpers so existing callers (and tests) that import them
// from `./query` continue to work after the bm25 extraction.
export { buildCorpusStats, bm25Score };
export type { CorpusStats };

// Re-export search/ranking helpers from query-search.ts for backwards
// compatibility — callers that import from "./query" continue to work.
export {
  extractBestSnippet,
  reciprocalRankFusion,
  searchIndex,
  buildContext,
  selectPagesForQuery,
} from "./query-search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_TEMPLATE = `You are a wiki assistant. Answer the user's question using ONLY the wiki pages provided below.

Rules:
- Base your answer strictly on the wiki content provided
- Cite your sources using markdown links: [Page Title](slug.md)
- If the wiki doesn't contain enough information to answer, say so clearly
- Format your answer in markdown
- Prefer non-disputed pages when multiple sources cover the same topic; if you must cite a disputed page, note that its claims are under discussion
- Do not cite superseded pages without noting the replacement page
- ${UNTRUSTED_CONTENT_RULE}
{index_section}
Wiki pages:
{context}`;

/**
 * Extra system-prompt instruction appended when the caller requests a
 * table-formatted answer. Kept as a top-level constant so tests can assert on
 * its presence without duplicating the string.
 */
export const TABLE_FORMAT_INSTRUCTION =
  "Format your answer as a markdown comparison table where possible. Include a short prose lead-in (1-2 sentences) before the table. Every column header should be meaningful. Cite sources as [Page Title](slug.md) in a final 'Sources' row or paragraph.";

/**
 * Extra system-prompt instruction appended when the caller requests a
 * Marp slide deck answer format.
 */
export const SLIDES_FORMAT_INSTRUCTION = `Format your answer as a Marp slide deck. Use \`---\` to separate slides.
The first slide should be a title slide with \`# {question}\`.
Each subsequent slide should cover one key point with a heading and 2-4 bullet points.
Keep slides concise — aim for 5-8 slides total.
When a point is structural — a flow, process, architecture, hierarchy, sequence, or relationship — prefer a **Mermaid diagram** over a wall of bullets. Put it in a fenced \`\`\`mermaid code block (e.g. \`graph TD\`, \`flowchart LR\`, \`sequenceDiagram\`); it renders as a diagram. Keep node labels short.
Include **exactly one** hand-drawn **yoyo illustration** in the deck — on the single slide where a metaphor, a key judgment, a before/after, or a change-of-state lands better as a picture than text (often the title slide or the core-insight slide). Add it with a fenced \`\`\`yoyo-illustration block whose body is a short SCENE: what the yoyo octopus is doing with its tentacles to express that idea, plus 2-4 short labels. Use it for feeling/metaphor (not data, not structure) — keep it to one, never more than two.
Include a final "Sources" slide citing wiki pages as [Page Title](slug.md).
Use standard Marp markdown (no custom directives needed).
Start the response with the Marp front matter:
---
marp: true
---`;

/**
 * Extra system-prompt instruction appended when the caller requests an HTML
 * answer — a single self-contained document rendered in a sandboxed iframe.
 */
export const HTML_FORMAT_INSTRUCTION = `Format your answer as a SINGLE, SELF-CONTAINED HTML document that reads like a polished, visual blog post — far richer and more skimmable than markdown. Aim for something a reader would want to SHARE.

OUTPUT
- Output ONLY HTML: start your reply with \`<!doctype html>\` and a full \`<html>\`/\`<head>\`/\`<body>\`. No markdown code fence (no \`\`\`html), no prose before or after.
- A polished baseline stylesheet AND the Chart.js library are ALREADY INJECTED for you. Do NOT add any \`<link>\`, \`<script src>\`, CDN URL, or web font — the document must stay fully self-contained (it renders offline and is shareable). You MAY add your own inline \`<style>\` to extend/override the baseline.

STRUCTURE — make it a real article
- Open with an \`<h1>\` title and a \`<p class="lead">\` one-sentence summary. Use \`<h2>\`/\`<h3>\` sections, short paragraphs, and **bold** keywords so it skims well.
- Use the PREBUILT components for visual density (all already styled — just use the class names):
  - \`<p class="lead">…</p>\` — standfirst intro.
  - \`<div class="callout">…</div>\` — a highlighted insight/aside.
  - \`<div class="grid"> <div class="card">…</div> … </div>\` — responsive card grid.
  - \`<div class="stat"><span class="num">87%</span><span class="label">caption</span></div>\` — big-number stats (put several in a \`.grid\`).
  - \`<span class="badge">tag</span>\`, \`<blockquote>\` pull quotes, and real \`<table>\`s for comparisons.
  - \`<details><summary>Heading</summary>…</details>\` — collapsible accordion (native, no JS needed).
  - Tabs (JS already wired — just use this exact markup):
    \`<div class="tabs"><div class="tablist"><button data-tab="a" class="active">First</button><button data-tab="b">Second</button></div><div class="tabpanel active" data-tab="a">…</div><div class="tabpanel" data-tab="b">…</div></div>\`

CHARTS — use Chart.js, never hand-drawn SVG
- Whenever data can be visualized (comparisons, trends, breakdowns, distributions), include a chart. \`Chart\` is a global; do NOT import it.
- Use this pattern (one canvas per chart, inside a sized \`.chart\` box):
  \`<figure><div class="chart"><canvas id="c1"></canvas></div><figcaption>What this shows</figcaption></figure>\`
  then in an inline \`<script>\`:
  \`new Chart(document.getElementById('c1'),{type:'bar',data:{labels:['A','B','C'],datasets:[{label:'Score',data:[12,19,7],backgroundColor:'#4d6bfe'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});\`
- ALWAYS set \`options.responsive:true\` and \`options.maintainAspectRatio:false\` (the \`.chart\` box controls height). Use \`type\` of bar/line/pie/doughnut/radar/scatter as fits the data.
- Use this on-brand palette for series: \`#4d6bfe\`, \`#11a36b\`, \`#e8893a\`, \`#9b59d0\`, \`#d24d6b\`, \`#3aa6c4\`. Keep charts clean (concise labels, light gridlines).

DIAGRAMS — use Mermaid for structure (Chart.js is for data)
- For a flow, process, architecture, hierarchy, sequence, state, or relationship, embed a **Mermaid** diagram — it pre-renders to a clean, on-brand SVG. Charts visualize DATA; Mermaid visualizes STRUCTURE.
- Use this exact block (the \`mermaid\` class is required) — write the graph definition inside, no \`<script>\`, no code fence:
  \`<pre class="mermaid">\nflowchart LR\n  A[Source] --> B[Ingest] --> C[Cited page]\n</pre>\`
- Supports \`flowchart\`/\`graph\`, \`sequenceDiagram\`, \`classDiagram\`, \`stateDiagram\`, \`erDiagram\`, and more. Keep node labels short; it's themed automatically — do not set colors.

ILLUSTRATIONS — a hand-drawn yoyo picture, sparingly (feeling, not data/structure)
- Include **at least one** hand-drawn brand illustration (and up to 3, for the places where a metaphor, a key judgment, a before/after, or a change-of-state lands better as a PICTURE than prose). Request each with an EMPTY figure that carries the scene:
  \`<figure class="yoyo-illustration" data-scene="A short scene: what the yoyo octopus is doing with its tentacles to express the idea, plus 2-4 short labels"></figure>\`
- It renders to a generated image automatically (leave the figure empty — no \`<img>\`). Use it for FEELING/METAPHOR; use Chart.js for data and Mermaid for structure. Never more than 3.

INTERACTIVITY (optional, encouraged where it adds insight)
- You MAY add small inline \`<script>\` for sliders/toggles that recompute and update a chart (mutate \`chart.data\` then call \`chart.update()\`). It runs in a locked-down sandbox: no network, no access outside the document.

SOURCES
- Cite inline as \`<a href="slug.md">Page Title</a>\`, and end with a \`<section class="sources"><h2>Sources</h2>…</section>\` listing them, so citations stay traceable.`;

/** Answer format hint supported by `query()` / `buildQuerySystemPrompt()`. */
export type { QueryFormat };

// ---------------------------------------------------------------------------
// BM25 sparse index search
// ---------------------------------------------------------------------------
//
// Tokenization, corpus-stat construction, and BM25 scoring live in
// `./bm25`. They are re-exported at the top of this file for backwards
// compatibility with callers that still import them from `./query`.

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

// Re-export extractCitedSlugs from the shared citations module so existing
// consumers that import from "./query" continue to work.
export { extractCitedSlugs };

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt used for wiki queries.
 *
 * Exported so the streaming endpoint can reuse the same prompt construction
 * without duplicating logic.
 */
export async function buildQuerySystemPrompt(
  context: string,
  entries: { slug: string; title: string; summary: string }[],
  selectedSlugs: string[],
  format: QueryFormat = "prose",
): Promise<string> {
  // List the OTHER pages (those not loaded in full) so the LLM knows what else
  // exists. On a large wiki this would be O(pages) of prompt tokens every query,
  // so cap it at LISTED_OTHER_PAGES and summarise the remainder as a count. The
  // loaded pages live in `context`; the answer is grounded there and citations
  // are validated against the full slug set by the caller, so capping the
  // "what else exists" hint costs awareness, not correctness.
  const selectedSet = new Set(selectedSlugs);
  const others = entries.filter((e) => !selectedSet.has(e.slug));
  let indexSection = "";
  if (others.length > 0) {
    const listed = others.slice(0, LISTED_OTHER_PAGES);
    const indexListing = listed
      .map((e) => `- [${e.title}](${e.slug}.md) — ${e.summary}`)
      .join("\n");
    const remainder = others.length - listed.length;
    const moreLine =
      remainder > 0 ? `\n…and ${remainder} more pages not listed here.\n` : "\n";
    // The titles/summaries are collectively-editable, frontmatter-derived data
    // (an attacker can plant instructions in a page title/summary), so the
    // listing goes inside the same untrusted-content boundary as page bodies —
    // the model may use the titles/slugs to cite, never obey text within.
    indexSection = `\nThe wiki also contains these other pages (not loaded in full):\n${wrapUntrusted(
      indexListing,
      { source: "page index (titles + summaries)" },
    )}\n${moreLine}`;
  }

  let systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace("{context}", context)
    .replace("{index_section}", indexSection);

  // Append SCHEMA.md conventions so the query prompt stays in sync with the
  // wiki's page conventions — same pattern used by ingest.
  const conventions = await loadPageConventions();
  if (conventions) {
    systemPrompt += `\n\nThe wiki you are querying follows these conventions (from SCHEMA.md):\n\n${conventions}`;
  }

  // Append format-specific instructions. Prose is the default and adds
  // nothing, so existing callers see identical output.
  if (format === "table") {
    systemPrompt += `\n\n${TABLE_FORMAT_INSTRUCTION}`;
  } else if (format === "slides") {
    systemPrompt += `\n\n${SLIDES_FORMAT_INSTRUCTION}`;
  } else if (format === "html") {
    systemPrompt += `\n\n${HTML_FORMAT_INSTRUCTION}`;
  }

  return systemPrompt;
}

// ---------------------------------------------------------------------------
// Main query function
// ---------------------------------------------------------------------------

/**
 * Query the wiki with a user question.
 *
 * Index-first approach: reads the index to find relevant pages, then loads
 * only those pages for context. For small wikis (<= 5 pages), loads all.
 *
 * The optional `format` controls how the LLM is asked to shape its answer.
 * `"prose"` (the default) is the current free-form markdown behavior;
 * `"table"` adds a system-prompt hint asking for a markdown comparison table;
 * `"slides"` asks for a Marp slide deck.
 *
 * The optional `scope` filters search to a subset of pages (e.g.
 * `"agent:yoyo"` limits to that agent's pages).
 */
export async function query(
  question: string,
  format: QueryFormat = "prose",
  scope?: string,
  principal: import("./auth").Principal | null = null,
): Promise<QueryResult> {
  // Restrict to readable pages BEFORE entering the per-request page cache, so a
  // private page never enters the LLM context, citations, or sources.
  const readable = await listReadableWikiPages(principal);
  return withPageCache(async () => {
    let entries = readable;

    // Resolve scope to a set of slugs (handles the "mine" lens; empty "mine"
    // falls back to the full commons). Errors surface as a friendly answer.
    const { scopeSlugs, error: scopeError } = await resolveScopeSlugs(
      scope,
      principal,
    );
    if (scopeError) {
      return { answer: scopeError, sources: [] };
    }

    // General (unscoped) query excludes agent-scoped pages (agent knowledge
    // surfaces only via an `agent:` scope) and saved HTML artifacts (rendered
    // outputs, not knowledge — their markup must never enter the LLM context).
    if (!scopeSlugs) {
      entries = entries.filter(
        (e) => !isAgentScopedType(e.type) && !isArtifactType(e.type),
      );
    }

    // Empty wiki — nothing to query
    if (entries.length === 0) {
      return {
        answer:
          "The wiki is empty. Please [ingest some content](/ingest) first so I have something to answer from.",
        sources: [],
      };
    }

    // Determine which pages to load
    const selectedSlugs = await selectPagesForQuery(question, entries, scopeSlugs);

    const { context } = await buildContext(selectedSlugs);

    // No API key — return a helpful fallback
    if (!hasLLMKey()) {
      const allSlugs = entries.map((e) => e.slug);
      const pageList = allSlugs.map((s) => `- ${s}`).join("\n");
      return {
        answer: `**No API key configured.** Set an API key (\`ANTHROPIC_API_KEY\`, \`OPENAI_API_KEY\`, etc.) to enable querying.\n\nYour wiki currently contains these pages:\n${pageList}`,
        sources: [],
      };
    }

    const systemPrompt = await buildQuerySystemPrompt(
      context,
      entries,
      selectedSlugs,
      format,
    );

    const raw = await callLLM(systemPrompt, question, {
      maxOutputTokens: QUERY_MAX_OUTPUT_TOKENS,
    });

    // Bake yoyo illustrations into slides/HTML answers now, server-side: each
    // scene is generated once, stored in R2, and the directive is replaced with
    // its `/api/assets/…` URL. This is the single generation point — every
    // viewer (including anonymous shares) then loads the finished image by URL
    // with no per-view fetch. Prose/table carry no directives, so they skip it.
    const answer =
      format === "slides" || format === "html"
        ? await bakeYoyoIllustrations(raw, format === "html")
        : raw;

    // All slugs in the wiki are valid citation targets
    const allSlugs = entries.map((e) => e.slug);
    const sources = extractCitedSlugs(answer, allSlugs);

    return { answer, sources };
  });
}

// ---------------------------------------------------------------------------
// Save answer to wiki
// ---------------------------------------------------------------------------

/**
 * Save a query answer as a new wiki page.
 *
 * Unlike the full `ingest()` pipeline, this writes the answer markdown
 * directly — it's already a well-formatted page with citations. The actual
 * write/index/cross-ref/log dance is delegated to
 * {@link writeWikiPageWithSideEffects} so this path can never drift from
 * `ingest()` again (see `.yoyo/learnings.md` — "Parallel write-paths drift").
 *
 * The optional `sources` parameter accepts an array of wiki page slugs cited
 * in the answer. These are stored as `wiki-ref` provenance entries in the
 * page's frontmatter, fulfilling yopedia's provenance contract.
 *
 * Returns the slug of the newly created wiki page.
 */
export async function saveAnswerToWiki(
  title: string,
  rawContent: string,
  explicitSlug?: string,
  sources?: string[],
  contentType: "markdown" | "html" | "slides" = "markdown",
  owner?: string,
  author?: string,
): Promise<{ slug: string }> {
  const slug = explicitSlug || slugify(title);

  if (!slug) {
    throw new Error("Title must produce a valid slug");
  }

  const isHtml = contentType === "html";
  // HTML and slides are personal rendered artifacts (owned, typed, kept out of
  // the commons/search corpus); plain markdown is a system-owned commons page.
  const isArtifact = contentType !== "markdown";

  // Bake illustrations as an idempotent safety net. Answers from `query()`
  // already have their `yoyo-illustration` directives baked into `/api/assets/…`
  // refs (a no-op here), but a directly-supplied/edited body might still carry
  // one — generate it server-side, store it in R2, embed the URL. A directive
  // that can't be generated is dropped. No-op when there are none. Mermaid stays
  // client-rendered (it's free). (Slides bake as markdown.)
  const content = await bakeYoyoIllustrations(rawContent, isHtml);

  // Body, by type:
  //  - HTML: strip a wrapping ```html fence; store verbatim, no H1 (the title
  //    shows via ArticleView's <h1> outside the iframe).
  //  - slides: store the Marp markdown verbatim, no H1 (it renders as a deck).
  //  - markdown: prepend an H1 if missing.
  const html = isHtml ? stripHtmlFence(content) : content;
  const needsH1 = !isArtifact && !content.trimStart().startsWith("# ");
  const pageContent = isHtml
    ? html
    : needsH1
      ? `# ${title}\n\n${content}`
      : content;

  // Summary comes from plain text: tag-stripped for HTML; for markdown/slides,
  // heading-stripped — and with baked illustration images stripped so an image
  // ref (an `/api/assets` URL, or a `data:` URI) never leaks into the summary/index.
  const plainContent = isHtml
    ? htmlToPlainText(html)
    : content
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/^#.*$/gm, "")
        .trim();
  const summary = extractSummary(plainContent) || title;

  // Wrap in YAML frontmatter so saved answers have the same metadata as
  // ingested pages (created/updated dates, source type, tags).
  // Include confidence, expiry, and authors so the page passes
  // checkUnmigratedPages() — see #106.
  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const expiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Build frontmatter metadata, optionally including structured provenance
  // entries for wiki page sources cited in the answer.
  const frontmatterData: Record<string, string | string[] | number | boolean> = {
    created: now,
    updated: now,
    source: "query",
    tags: ["query-answer"],
    confidence: 0.5,
    expiry,
    authors: [author ?? owner ?? "system"],
  };

  // HTML/slides outputs are personal artifacts: mark the type (so the page
  // renders with the right surface — sandboxed iframe / slide deck — and is
  // excluded from the commons/search/query corpus) and attribute it to the asker
  // so it lives in THEIR silo + vault lens and is reachable at /u/<handle>/<slug>.
  // Plain markdown saves keep the legacy system-owned commons behavior.
  if (isArtifact) {
    frontmatterData.type = contentType;
    if (owner) {
      frontmatterData.owner = owner;
      frontmatterData.authors = [owner];
    }
  }

  const triggeredBy = author ?? owner ?? "system";
  if (sources && sources.length > 0) {
    const sourceEntries = sources.map((slug) =>
      buildSourceEntry(slug, "wiki-ref", triggeredBy),
    );
    frontmatterData.sources = serializeSources(sourceEntries);
  }

  const contentWithFm = serializeFrontmatter(
    frontmatterData,
    pageContent,
  );

  // Hand off to the unified write pipeline. For markdown we pass the original
  // answer `content` as the cross-ref source so the related-pages prompt sees
  // what the user saw. HTML/slides artifacts are personal outputs — skip
  // cross-ref (null source) so commons pages don't backlink to them.
  const { slug: writtenSlug } = await writeWikiPageWithSideEffects({
    slug,
    title,
    content: contentWithFm,
    summary,
    logOp: "save",
    crossRefSource: isArtifact ? null : content,
    author: author ?? owner ?? "system",
    logDetails: ({ updatedSlugs }) =>
      `query answer saved as ${slug} · linked ${updatedSlugs.length} related page(s)`,
  });

  return { slug: writtenSlug };
}
