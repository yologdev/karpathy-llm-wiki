import { describe, it, expect } from "vitest";
import { isAgentHandle, DEFAULT_AGENT_NAME } from "../agent-handle";

describe("isAgentHandle", () => {
  it("recognizes composite agent ids", () => {
    expect(isAgentHandle("yuanhao--yoyo")).toBe(true);
    expect(isAgentHandle("alice--scout")).toBe(true);
  });

  it("recognizes the bare default agent name (the UserLink guard hinges on this)", () => {
    expect(DEFAULT_AGENT_NAME).toBe("yoyo");
    expect(isAgentHandle("yoyo")).toBe(true);
  });

  it("treats real human handles as non-agents", () => {
    expect(isAgentHandle("yuanhao")).toBe(false);
    expect(isAgentHandle("alice")).toBe(false);
  });

  it("is false for empty/nullish", () => {
    expect(isAgentHandle(null)).toBe(false);
    expect(isAgentHandle(undefined)).toBe(false);
    expect(isAgentHandle("")).toBe(false);
  });
});
