/**
 * URL safety / SSRF protection utilities.
 *
 * Extracted from fetch.ts — contains all logic for validating that a URL
 * targets a public address (not private/reserved/loopback) before fetching.
 */

import net from "net";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Blocked hosts
// ---------------------------------------------------------------------------

/** Blocked hostname suffixes for local/internal DNS names. */
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

/** Blocked exact hostnames. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

// ---------------------------------------------------------------------------
// Private IP range checks
// ---------------------------------------------------------------------------

/**
 * Check whether an IPv4 address string falls in a private/reserved range.
 *
 *  - 10.0.0.0/8
 *  - 172.16.0.0/12
 *  - 192.168.0.0/16
 *  - 169.254.0.0/16 (link-local, cloud metadata)
 *  - 127.0.0.0/8 (loopback)
 *  - 0.0.0.0/8
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Check whether an IPv6 address string falls in a private/reserved range.
 *
 *  - ::1 (loopback)
 *  - fd00::/8 (unique local address)
 *  - fe80::/10 (link-local)
 */
function isPrivateIPv6(ip: string): boolean {
  // Normalise: lowercase, strip brackets
  const normalized = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;

  // IPv4-mapped IPv6: ::ffff:A.B.C.D or ::ffff:XXXX:XXXX (hex form)
  if (normalized.startsWith("::ffff:")) {
    const suffix = normalized.slice(7); // after "::ffff:"
    if (net.isIPv4(suffix)) {
      // Dotted-decimal form: ::ffff:127.0.0.1
      return isPrivateIPv4(suffix);
    }
    // Hex form: ::ffff:7f00:1 (URL class normalizes to this)
    const hexMatch = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const hi = parseInt(hexMatch[1], 16);
      const lo = parseInt(hexMatch[2], 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// URL safety validation
// ---------------------------------------------------------------------------

/**
 * Validate that a URL is safe to fetch — reject private/reserved addresses
 * and non-HTTP(S) schemes to prevent SSRF attacks.
 *
 * @throws Error if the URL targets a private/reserved address or uses a
 *   non-HTTP(S) scheme.
 */
export function validateUrlSafety(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    logger.warn("ingest", "URL parse failed:", err);
    throw new Error("URL blocked: invalid URL");
  }

  // Only allow http and https schemes
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `URL blocked: scheme "${parsed.protocol.replace(":", "")}" is not allowed (only http/https)`,
    );
  }

  // Extract hostname (URL class may keep brackets around IPv6 literals)
  const rawHostname = parsed.hostname.toLowerCase();
  // Strip brackets for IPv6 literals so lookups work correctly
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;

  // Check exact blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(
      "URL blocked: hostname resolves to a private/reserved address",
    );
  }

  // Check blocked suffixes
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(
        "URL blocked: hostname resolves to a private/reserved address",
      );
    }
  }

  // If the hostname is a raw IP address, check private ranges
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    throw new Error(
      "URL blocked: hostname resolves to a private/reserved address",
    );
  }
  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    throw new Error(
      "URL blocked: hostname resolves to a private/reserved address",
    );
  }
}
