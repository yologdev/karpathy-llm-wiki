import { NextResponse } from "next/server";
import { loadPageTemplates } from "@/lib/schema";
import { getErrorMessage } from "@/lib/errors";

interface TemplateEntry {
  name: string;
  type: string;
  content: string;
}

/**
 * Known template headings in SCHEMA.md mapped to display names and type slugs.
 */
const KNOWN_TEMPLATES: { heading: string; name: string; type: string }[] = [
  { heading: "Source summary", name: "Source summary", type: "summary" },
  { heading: "Entity page", name: "Entity page", type: "entity" },
  { heading: "Concept page", name: "Concept page", type: "concept" },
  { heading: "Comparison page", name: "Comparison page", type: "comparison" },
];

/**
 * Parse the "Page templates" section from SCHEMA.md into individual templates.
 *
 * Splits on `### ` headings, then for each known heading extracts the second
 * fenced code block (the markdown body — the first is YAML frontmatter).
 */
function parseTemplates(section: string): TemplateEntry[] {
  if (!section) return [];

  const templates: TemplateEntry[] = [];

  for (const known of KNOWN_TEMPLATES) {
    // Find the ### heading for this template
    const headingPattern = `### ${known.heading}`;
    const headingIdx = section.indexOf(headingPattern);
    if (headingIdx === -1) continue;

    // Extract from this heading to the next ### or end of section
    const afterHeading = section.slice(headingIdx);
    const nextHeading = afterHeading.slice(headingPattern.length).search(/\n### /);
    const block =
      nextHeading !== -1
        ? afterHeading.slice(0, headingPattern.length + nextHeading)
        : afterHeading;

    // Find all fenced code blocks in this section
    const codeBlockRegex = /```\w*\n([\s\S]*?)```/g;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = codeBlockRegex.exec(block)) !== null) {
      matches.push(m[1]);
    }

    // The second code block is the markdown body template
    if (matches.length >= 2) {
      const content = matches[1].trimEnd();
      if (content) {
        templates.push({ name: known.name, type: known.type, content });
      }
    }
  }

  return templates;
}

/**
 * GET /api/wiki/templates
 *
 * Returns the page templates parsed from SCHEMA.md.
 * If SCHEMA.md is missing or has no templates, returns an empty array.
 */
export async function GET() {
  try {
    const section = await loadPageTemplates();
    const templates = parseTemplates(section);
    return NextResponse.json({ templates });
  } catch (err) {
    const message = getErrorMessage(err);
    return NextResponse.json({ error: message, templates: [] }, { status: 500 });
  }
}
