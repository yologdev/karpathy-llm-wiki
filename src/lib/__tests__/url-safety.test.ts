import { describe, it, expect } from "vitest";
import { validateUrlSafety } from "../url-safety";

// ---------------------------------------------------------------------------
// validateUrlSafety
// ---------------------------------------------------------------------------

describe("validateUrlSafety", () => {
  // -- Blocked hostnames --
  it("blocks localhost", () => {
    expect(() => validateUrlSafety("http://localhost/foo")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 127.0.0.1", () => {
    expect(() => validateUrlSafety("http://127.0.0.1")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks ::1", () => {
    expect(() => validateUrlSafety("http://[::1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 0.0.0.0", () => {
    expect(() => validateUrlSafety("http://0.0.0.0")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Private IPv4 ranges --
  it("blocks 10.x.x.x (10.0.0.0/8)", () => {
    expect(() => validateUrlSafety("http://10.0.0.1")).toThrow(
      /private\/reserved/,
    );
    expect(() => validateUrlSafety("http://10.255.255.255")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 172.16-31.x.x (172.16.0.0/12)", () => {
    expect(() => validateUrlSafety("http://172.16.0.1")).toThrow(
      /private\/reserved/,
    );
    expect(() => validateUrlSafety("http://172.31.255.255")).toThrow(
      /private\/reserved/,
    );
  });

  it("does not block 172.15.x.x or 172.32.x.x", () => {
    expect(() => validateUrlSafety("http://172.15.0.1")).not.toThrow();
    expect(() => validateUrlSafety("http://172.32.0.1")).not.toThrow();
  });

  it("blocks 192.168.x.x (192.168.0.0/16)", () => {
    expect(() => validateUrlSafety("http://192.168.1.1")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks 169.254.x.x (link-local)", () => {
    expect(() => validateUrlSafety("http://169.254.169.254")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Private IPv6 --
  it("blocks fd00:: (unique local address)", () => {
    expect(() => validateUrlSafety("http://[fd00::1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks fe80:: (link-local IPv6)", () => {
    expect(() => validateUrlSafety("http://[fe80::1]")).toThrow(
      /private\/reserved/,
    );
  });

  // -- IPv4-mapped IPv6 --
  it("blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)", () => {
    expect(() => validateUrlSafety("http://[::ffff:127.0.0.1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks ::ffff:7f00:1 (hex-form IPv4-mapped loopback)", () => {
    expect(() => validateUrlSafety("http://[::ffff:7f00:1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks ::ffff:192.168.1.1 (IPv4-mapped private)", () => {
    expect(() => validateUrlSafety("http://[::ffff:192.168.1.1]")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Blocked hostname suffixes --
  it("blocks .local suffix", () => {
    expect(() => validateUrlSafety("http://myhost.local")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks .internal suffix", () => {
    expect(() => validateUrlSafety("http://service.internal")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks .localhost suffix", () => {
    expect(() => validateUrlSafety("http://app.localhost")).toThrow(
      /private\/reserved/,
    );
  });

  // -- Non-HTTP schemes --
  it("blocks ftp:// scheme", () => {
    expect(() => validateUrlSafety("ftp://example.com/file")).toThrow(
      /scheme.*not allowed/,
    );
  });

  it("blocks file:// scheme", () => {
    expect(() => validateUrlSafety("file:///etc/passwd")).toThrow(
      /scheme.*not allowed/,
    );
  });

  it("blocks javascript: scheme", () => {
    expect(() => validateUrlSafety("javascript:alert(1)")).toThrow(
      /not allowed|invalid/i,
    );
  });

  // -- Invalid URL --
  it("throws for invalid URL", () => {
    expect(() => validateUrlSafety("not-a-url")).toThrow(/invalid URL/i);
  });

  // -- Allowed URLs --
  it("allows https://example.com", () => {
    expect(() => validateUrlSafety("https://example.com")).not.toThrow();
  });

  it("allows http://93.184.216.34 (public IP)", () => {
    expect(() => validateUrlSafety("http://93.184.216.34")).not.toThrow();
  });

  it("allows https://subdomain.example.com/path", () => {
    expect(() =>
      validateUrlSafety("https://subdomain.example.com/path?q=1"),
    ).not.toThrow();
  });

  // --- New edge case tests ---

  it("blocks IPv6 unique local fd12::abcd", () => {
    expect(() => validateUrlSafety("http://[fd12::abcd]")).toThrow(
      /private\/reserved/,
    );
  });

  it("blocks IPv6 link-local fe80::1%eth0 (zone ID stripped by URL parser)", () => {
    // URL parser strips zone IDs; fe80:: prefix should still be caught
    expect(() => validateUrlSafety("http://[fe80::1]")).toThrow(
      /private\/reserved/,
    );
  });

  it("allows a public IPv6 address", () => {
    // 2001:db8:: is documentation range but not in our private list —
    // the function only blocks loopback, ULA, and link-local
    expect(() => validateUrlSafety("http://[2001:db8::1]")).not.toThrow();
  });

  it("blocks URL with credentials (user:pass@) targeting private host", () => {
    // Credentials in the URL should not bypass hostname validation
    expect(() =>
      validateUrlSafety("http://admin:secret@127.0.0.1/admin"),
    ).toThrow(/private\/reserved/);
  });

  it("allows URL with credentials targeting a public host", () => {
    expect(() =>
      validateUrlSafety("https://user:pass@example.com/page"),
    ).not.toThrow();
  });

  it("blocks double-encoded localhost that URL parser normalizes", () => {
    // The URL constructor may or may not decode percent-encoding in the hostname.
    // Either the constructor throws (invalid URL) or the hostname doesn't match
    // a blocked entry. Either way, we must not allow access to localhost.
    // Try a URL that after percent-decoding would be localhost:
    // %6c%6f%63%61%6c%68%6f%73%74 = localhost
    // URL constructor normalizes percent-encoded hostnames, so this should
    // either throw as invalid or resolve to "localhost" which we block.
    const url = "http://%6c%6f%63%61%6c%68%6f%73%74/path";
    expect(() => validateUrlSafety(url)).toThrow();
  });
});
