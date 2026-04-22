import { describe, it, expect } from "vitest";
import { parseArgs } from "../../cli";

describe("CLI argument parsing", () => {
  describe("ingest command", () => {
    it("parses ingest with URL", () => {
      const result = parseArgs(["ingest", "https://example.com"]);
      expect(result).toEqual({ command: "ingest-url", url: "https://example.com" });
    });

    it("parses ingest with --text flag", () => {
      const result = parseArgs(["ingest", "--text"]);
      expect(result).toEqual({ command: "ingest-text" });
    });

    it("returns error when ingest has no URL and no --text", () => {
      const result = parseArgs(["ingest"]);
      expect(result.command).toBe("error");
    });
  });

  describe("query command", () => {
    it("parses query with question", () => {
      const result = parseArgs(["query", "what is AI?"]);
      expect(result).toEqual({ command: "query", question: "what is AI?" });
    });

    it("joins multiple words into a single question", () => {
      const result = parseArgs(["query", "what", "is", "attention?"]);
      expect(result).toEqual({ command: "query", question: "what is attention?" });
    });

    it("returns error when query has no question", () => {
      const result = parseArgs(["query"]);
      expect(result.command).toBe("error");
    });
  });

  describe("lint command", () => {
    it("parses lint without flags", () => {
      const result = parseArgs(["lint"]);
      expect(result).toEqual({ command: "lint", fix: false });
    });

    it("parses lint with --fix flag", () => {
      const result = parseArgs(["lint", "--fix"]);
      expect(result).toEqual({ command: "lint", fix: true });
    });
  });

  describe("list command", () => {
    it("parses list without flags", () => {
      const result = parseArgs(["list"]);
      expect(result).toEqual({ command: "list", raw: false });
    });

    it("parses list with --raw flag", () => {
      const result = parseArgs(["list", "--raw"]);
      expect(result).toEqual({ command: "list", raw: true });
    });
  });

  describe("status command", () => {
    it("parses status", () => {
      const result = parseArgs(["status"]);
      expect(result).toEqual({ command: "status" });
    });
  });

  describe("help command", () => {
    it("parses help", () => {
      const result = parseArgs(["help"]);
      expect(result).toEqual({ command: "help" });
    });

    it("parses --help flag", () => {
      const result = parseArgs(["--help"]);
      expect(result).toEqual({ command: "help" });
    });

    it("parses -h flag", () => {
      const result = parseArgs(["-h"]);
      expect(result).toEqual({ command: "help" });
    });

    it("shows help when no args provided", () => {
      const result = parseArgs([]);
      expect(result).toEqual({ command: "help" });
    });
  });

  describe("error handling", () => {
    it("returns error for unknown command", () => {
      const result = parseArgs(["unknown"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Unknown command");
      }
    });

    it("returns error for missing ingest argument", () => {
      const result = parseArgs(["ingest"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });

    it("returns error for missing query argument", () => {
      const result = parseArgs(["query"]);
      expect(result.command).toBe("error");
      if (result.command === "error") {
        expect(result.message).toContain("Usage");
      }
    });
  });
});
