// ---------------------------------------------------------------------------
// YAML frontmatter (constrained subset)
// ---------------------------------------------------------------------------
//
// We intentionally DO NOT use a real YAML library. The set of values we need
// to persist on a wiki page is tiny (a handful of string scalars plus an
// inline array of tag strings), and a full YAML parser invites schema drift
// and subtle round-trip bugs. Instead we support exactly three value kinds:
//
//   key: value              → string (trimmed, surrounding quotes stripped)
//   key: "value with :"     → quoted string
//   key: [a, b, "c d"]      → inline string array
//
// Anything else — block scalars, nested objects, anchors, multi-line strings,
// block arrays — throws. This is by design.

/** A parsed frontmatter object. Values are either strings or string arrays. */
export interface Frontmatter {
  [key: string]: string | string[];
}

/** Result of {@link parseFrontmatter}: the frontmatter object plus body. */
export interface ParsedPage {
  data: Frontmatter;
  body: string;
}

/**
 * Strip surrounding single or double quotes from a scalar string, if present.
 * Only strips matching pairs.
 */
function unquoteScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Split an inline YAML array body like `a, b, "c, d"` into its elements,
 * respecting quoted substrings so commas inside quotes don't split.
 */
function splitInlineArray(inner: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ",") {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (quote) {
    throw new Error("Invalid frontmatter: unterminated quoted string in array");
  }
  // Allow a trailing empty element only when the input was entirely empty
  // (i.e. `[]`); otherwise push the last accumulated buffer.
  if (inner.trim().length > 0 || parts.length > 0) {
    parts.push(buf);
  }
  return parts
    .map((p) => unquoteScalar(p))
    .filter((p, idx, arr) => !(p === "" && arr.length === 1));
}

/**
 * Parse a markdown document that may begin with a `---\n...\n---\n` YAML
 * frontmatter block. Returns empty data and the full content as body when
 * no frontmatter is present. Throws on malformed frontmatter.
 *
 * Supported value types (see module comment above):
 *   - Scalars: `key: value` or `key: "quoted"`
 *   - Inline arrays: `tags: [a, b, "c d"]`
 *
 * Unsupported (throws):
 *   - Block scalars (`|` or `>`)
 *   - Nested mappings (`key:` followed by indented children)
 *   - Block arrays (`- item` on subsequent lines)
 *   - YAML anchors or references
 */
export function parseFrontmatter(content: string): ParsedPage {
  // Fast path: no frontmatter marker.
  if (!content.startsWith("---\n") && content !== "---" && !content.startsWith("---\r\n")) {
    return { data: {}, body: content };
  }

  // Normalize the opening delimiter line end so indexOf works.
  const rest = content.slice(content.indexOf("\n") + 1);
  // Find the closing `---` line (must be on its own line).
  const closeMatch = rest.match(/^---\s*$/m);
  if (!closeMatch || closeMatch.index === undefined) {
    throw new Error("Invalid frontmatter: missing closing `---` delimiter");
  }
  const yamlBlock = rest.slice(0, closeMatch.index);
  // Body starts after the closing delimiter line.
  let bodyStart = closeMatch.index + closeMatch[0].length;
  // Consume the newline that follows the closing delimiter, if any.
  if (rest[bodyStart] === "\n") bodyStart += 1;
  else if (rest[bodyStart] === "\r" && rest[bodyStart + 1] === "\n") bodyStart += 2;
  // And optionally a single blank line separator.
  if (rest[bodyStart] === "\n") bodyStart += 1;
  const body = rest.slice(bodyStart);

  const data: Frontmatter = {};
  const lines = yamlBlock.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip blank lines and comments.
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    // Reject block scalars and block arrays upfront — they start with `- ` or
    // have indented continuation.
    if (/^\s+\S/.test(line)) {
      throw new Error(
        `Invalid frontmatter: indented/nested values are not supported ("${line.trim()}")`,
      );
    }
    if (line.trimStart().startsWith("- ")) {
      throw new Error(
        "Invalid frontmatter: block arrays (`- item`) are not supported",
      );
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      throw new Error(`Invalid frontmatter: missing \`:\` in line "${line}"`);
    }
    const key = line.slice(0, colonIdx).trim();
    const valueRaw = line.slice(colonIdx + 1).trim();

    if (key === "") {
      throw new Error(`Invalid frontmatter: empty key in line "${line}"`);
    }

    // Reject block scalars and empty-value-with-children (nested objects).
    if (valueRaw === "" || valueRaw === "|" || valueRaw === ">") {
      // If the next non-blank line is indented, this is a nested object or
      // block scalar — both unsupported.
      const next = lines[i + 1];
      if (next !== undefined && /^\s+\S/.test(next)) {
        throw new Error(
          "Invalid frontmatter: nested objects and block scalars are not supported",
        );
      }
      if (valueRaw === "|" || valueRaw === ">") {
        throw new Error(
          "Invalid frontmatter: block scalars (`|`, `>`) are not supported",
        );
      }
      // Bare `key:` with nothing after — treat as empty string.
      data[key] = "";
      continue;
    }

    // Reject YAML anchors/aliases.
    if (valueRaw.startsWith("&") || valueRaw.startsWith("*")) {
      throw new Error(
        "Invalid frontmatter: YAML anchors and aliases are not supported",
      );
    }

    // Inline array?
    if (valueRaw.startsWith("[")) {
      if (!valueRaw.endsWith("]")) {
        throw new Error(
          `Invalid frontmatter: malformed inline array in line "${line}"`,
        );
      }
      const inner = valueRaw.slice(1, -1);
      data[key] = splitInlineArray(inner);
      continue;
    }

    // Plain scalar.
    data[key] = unquoteScalar(valueRaw);
  }

  return { data, body };
}

/**
 * Serialize a frontmatter object + body back into a markdown document.
 * The frontmatter block is omitted when `data` is empty.
 *
 * Serialization rules (intentionally simple):
 *   - Keys emitted in insertion order.
 *   - Arrays always use inline `[a, b, c]` form. Array elements are quoted
 *     with `"..."` when they contain a comma, quote, or leading/trailing
 *     whitespace.
 *   - Scalar strings are quoted only when they contain `:` or start with `[`
 *     or `"` or `'` (characters that would otherwise confuse the parser).
 */
export function serializeFrontmatter(
  data: Frontmatter,
  body: string,
): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return body;

  const needsScalarQuoting = (s: string): boolean =>
    s.includes(":") ||
    s.startsWith("[") ||
    s.startsWith('"') ||
    s.startsWith("'") ||
    s.startsWith("#") ||
    s.startsWith("&") ||
    s.startsWith("*") ||
    s !== s.trim();

  const quoteArrayElement = (s: string): string => {
    if (
      s.includes(",") ||
      s.includes('"') ||
      s.includes("[") ||
      s.includes("]") ||
      s !== s.trim() ||
      s === ""
    ) {
      // Escape embedded double quotes.
      return `"${s.replace(/"/g, '\\"')}"`;
    }
    return s;
  };

  const lines: string[] = ["---"];
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      const parts = value.map(quoteArrayElement);
      lines.push(`${key}: [${parts.join(", ")}]`);
    } else {
      const str = String(value);
      if (needsScalarQuoting(str)) {
        lines.push(`${key}: "${str.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${str}`);
      }
    }
  }
  lines.push("---");
  // Blank line separator between frontmatter and body so downstream markdown
  // renderers treat the body as a fresh document.
  return `${lines.join("\n")}\n\n${body}`;
}
