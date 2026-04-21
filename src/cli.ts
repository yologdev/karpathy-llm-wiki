#!/usr/bin/env node
/**
 * CLI entry point for the LLM Wiki.
 *
 * Usage:
 *   pnpm cli ingest <url>         Ingest a URL into the wiki
 *   pnpm cli ingest --text        Ingest text from stdin
 *   pnpm cli query <question>     Query the wiki
 *   pnpm cli lint                 Run wiki lint checks
 *   pnpm cli lint --fix           Run lint and auto-fix issues
 *   pnpm cli help                 Show this help
 */

// ---------------------------------------------------------------------------
// Argument parsing (exported for testing)
// ---------------------------------------------------------------------------

export type ParsedCommand =
  | { command: "ingest-url"; url: string }
  | { command: "ingest-text" }
  | { command: "query"; question: string }
  | { command: "lint"; fix: boolean }
  | { command: "help" }
  | { command: "error"; message: string };

export function parseArgs(argv: string[]): ParsedCommand {
  const [sub, ...rest] = argv;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { command: "help" };
  }

  switch (sub) {
    case "ingest": {
      if (rest.includes("--text")) {
        return { command: "ingest-text" };
      }
      const url = rest.find((a) => !a.startsWith("-"));
      if (!url) {
        return { command: "error", message: "Usage: pnpm cli ingest <url>  or  pnpm cli ingest --text" };
      }
      return { command: "ingest-url", url };
    }
    case "query": {
      const question = rest.filter((a) => !a.startsWith("-")).join(" ");
      if (!question) {
        return { command: "error", message: "Usage: pnpm cli query <question>" };
      }
      return { command: "query", question };
    }
    case "lint": {
      const fix = rest.includes("--fix");
      return { command: "lint", fix };
    }
    default:
      return { command: "error", message: `Unknown command: ${sub}\nRun "pnpm cli help" for usage.` };
  }
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `
LLM Wiki CLI

Usage: pnpm cli <command> [args]

Commands:
  ingest <url>         Ingest a URL into the wiki
  ingest --text        Ingest text from stdin (pipe or type, then Ctrl-D)
  query <question>     Query the wiki
  lint                 Run wiki lint checks
  lint --fix           Run lint and auto-fix issues
  help                 Show this help

Examples:
  pnpm cli ingest https://example.com/article
  echo "Some text" | pnpm cli ingest --text
  pnpm cli query "What is attention in transformers?"
  pnpm cli lint
  pnpm cli lint --fix
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Command runners
// ---------------------------------------------------------------------------

async function runIngestUrl(url: string): Promise<void> {
  const { ingestUrl } = await import("./lib/ingest");
  const result = await ingestUrl(url);
  console.log(result.primarySlug);
  if (result.relatedUpdated.length > 0) {
    for (const slug of result.relatedUpdated) {
      console.log(slug);
    }
  }
}

async function runIngestText(): Promise<void> {
  const text = await readStdin();
  if (!text.trim()) {
    console.error("Error: no text received on stdin");
    process.exit(1);
  }
  // Use the first line (up to 80 chars) as a title, or "Untitled"
  const firstLine = text.split("\n")[0]?.trim().slice(0, 80) || "Untitled";
  const title = firstLine.replace(/^#+\s*/, ""); // strip leading markdown heading
  const { ingest } = await import("./lib/ingest");
  const result = await ingest(title, text);
  console.log(result.primarySlug);
  if (result.relatedUpdated.length > 0) {
    for (const slug of result.relatedUpdated) {
      console.log(slug);
    }
  }
}

async function runQuery(question: string): Promise<void> {
  const { query } = await import("./lib/query");
  const result = await query(question);
  // Answer to stdout (pipeable)
  console.log(result.answer);
  // Sources to stderr (informational)
  if (result.sources.length > 0) {
    console.error(`\nCited pages: ${result.sources.join(", ")}`);
  }
}

async function runLint(fix: boolean): Promise<void> {
  const { lint } = await import("./lib/lint");
  const result = await lint();

  if (result.issues.length === 0) {
    console.log("No issues found.");
    return;
  }

  // Print issues
  for (const issue of result.issues) {
    const severity = issue.severity.toUpperCase().padEnd(7);
    console.log(`[${severity}] ${issue.type}: ${issue.message} (${issue.slug})`);
  }
  console.log(`\n${result.summary}`);

  // Auto-fix if requested
  if (fix) {
    const { fixLintIssue } = await import("./lib/lint-fix");
    console.log("\nAttempting auto-fix...\n");
    let fixed = 0;
    let failed = 0;
    for (const issue of result.issues) {
      try {
        const fixResult = await fixLintIssue(
          issue.type,
          issue.slug,
          issue.target,
          issue.message,
        );
        console.log(`  ✓ Fixed ${issue.type} on ${issue.slug}: ${fixResult.message}`);
        fixed++;
      } catch {
        console.error(`  ✗ Could not fix ${issue.type} on ${issue.slug}`);
        failed++;
      }
    }
    console.log(`\nFixed: ${fixed}, Failed: ${failed}`);
    if (failed > 0) {
      process.exit(1);
    }
  } else {
    // No --fix: exit 1 if any issues were found (standard lint convention)
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // argv[0] = node/tsx, argv[1] = script path, argv[2+] = user args
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  switch (parsed.command) {
    case "help":
      console.log(HELP);
      return;
    case "error":
      console.error(parsed.message);
      process.exit(1);
      break; // unreachable but satisfies linting
    case "ingest-url":
      await runIngestUrl(parsed.url);
      return;
    case "ingest-text":
      await runIngestText();
      return;
    case "query":
      await runQuery(parsed.question);
      return;
    case "lint":
      await runLint(parsed.fix);
      return;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);

  // Friendly message for missing API key
  if (message.toLowerCase().includes("api key") || message.toLowerCase().includes("api_key")) {
    console.error(
      `Error: No LLM API key configured.\n\n` +
      `Set one of these environment variables:\n` +
      `  ANTHROPIC_API_KEY=sk-...\n` +
      `  OPENAI_API_KEY=sk-...\n` +
      `  GOOGLE_GENERATIVE_AI_API_KEY=...\n\n` +
      `Or configure a provider in the Settings UI (http://localhost:3000/settings).`,
    );
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
});
