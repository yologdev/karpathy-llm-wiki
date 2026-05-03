import { NextResponse } from "next/server";
import { seedAgent } from "@/lib/agents";
import { getErrorMessage } from "@/lib/errors";

const VALID_SECTION_TYPES = new Set(["identity", "learnings", "social"]);

/**
 * POST /api/agents/seed
 *
 * Seed an agent by creating wiki pages for each content section and registering
 * the agent profile. Idempotent — re-seeding an existing agent updates its
 * pages (seedAgent preserves original registration date).
 *
 * Body: { id, name, description, sections: [{ slug, title, type, content }] }
 * Returns 201 with { agent: AgentProfile } on success.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // --- Validate top-level fields ---
    const { id, name, description, sections } = body ?? {};

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'id' — must be a non-empty string" },
        { status: 400 },
      );
    }
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'name' — must be a non-empty string" },
        { status: 400 },
      );
    }
    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'description' — must be a non-empty string" },
        { status: 400 },
      );
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'sections' — must be a non-empty array" },
        { status: 400 },
      );
    }

    // --- Validate each section ---
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (!s || typeof s !== "object") {
        return NextResponse.json(
          { error: `Section at index ${i} is invalid` },
          { status: 400 },
        );
      }
      if (!s.slug || typeof s.slug !== "string") {
        return NextResponse.json(
          { error: `Section at index ${i} is missing 'slug'` },
          { status: 400 },
        );
      }
      if (!s.title || typeof s.title !== "string") {
        return NextResponse.json(
          { error: `Section at index ${i} is missing 'title'` },
          { status: 400 },
        );
      }
      if (!s.type || !VALID_SECTION_TYPES.has(s.type)) {
        return NextResponse.json(
          {
            error: `Section at index ${i} has invalid 'type' — must be one of: identity, learnings, social`,
          },
          { status: 400 },
        );
      }
      if (!s.content || typeof s.content !== "string") {
        return NextResponse.json(
          { error: `Section at index ${i} is missing 'content'` },
          { status: 400 },
        );
      }
    }

    // --- Call seedAgent ---
    const profile = await seedAgent({ id, name, description, sections });

    return NextResponse.json({ agent: profile }, { status: 201 });
  } catch (err) {
    const message = getErrorMessage(err);
    // Surface validation errors from the lib layer as 400s
    if (
      message.includes("Invalid agent ID") ||
      message.includes("requires a non-empty")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
