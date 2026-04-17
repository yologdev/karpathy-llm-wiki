import { NextRequest, NextResponse } from "next/server";
import { lint, ALL_CHECK_TYPES } from "@/lib/lint";
import { getErrorMessage } from "@/lib/errors";
import type { LintOptions, LintIssue } from "@/lib/types";

const VALID_CHECK_TYPES = new Set<string>(ALL_CHECK_TYPES);
const VALID_SEVERITIES = new Set(["error", "warning", "info"]);

export async function POST(req: NextRequest) {
  try {
    let options: LintOptions | undefined;

    // Parse optional body (empty body is fine — runs all checks)
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        const parsed: LintOptions = {};

        if (Array.isArray(body.checks)) {
          const invalid = body.checks.filter(
            (c: unknown) => typeof c !== "string" || !VALID_CHECK_TYPES.has(c),
          );
          if (invalid.length > 0) {
            return NextResponse.json(
              { error: `Invalid check type(s): ${invalid.join(", ")}. Valid types: ${ALL_CHECK_TYPES.join(", ")}` },
              { status: 400 },
            );
          }
          parsed.checks = body.checks as LintIssue["type"][];
        }

        if (body.minSeverity !== undefined) {
          if (typeof body.minSeverity !== "string" || !VALID_SEVERITIES.has(body.minSeverity)) {
            return NextResponse.json(
              { error: `Invalid minSeverity: "${body.minSeverity}". Valid values: error, warning, info` },
              { status: 400 },
            );
          }
          parsed.minSeverity = body.minSeverity as LintOptions["minSeverity"];
        }

        if (parsed.checks || parsed.minSeverity) {
          options = parsed;
        }
      }
    } catch {
      // No body or invalid JSON — that's fine, run with defaults
    }

    const result = await lint(options);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lint error:", error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
