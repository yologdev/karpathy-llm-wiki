import { describe, it, expect } from "vitest";
import {
  isAgentHandle,
  DEFAULT_AGENT_NAME,
  normalizeActor,
  isAutomationActor,
} from "../agent-handle";

describe("automation actors", () => {
  it("recognizes system/lint-fix/yopedia as automation (case-insensitive)", () => {
    expect(isAutomationActor("system")).toBe(true);
    expect(isAutomationActor("lint-fix")).toBe(true);
    expect(isAutomationActor("yopedia")).toBe(true);
    expect(isAutomationActor("Lint-Fix")).toBe(true);
    expect(isAutomationActor("yuanhao")).toBe(false);
    expect(isAutomationActor("yoyo")).toBe(false);
    expect(isAutomationActor("")).toBe(false);
  });

  it("normalizeActor folds automation into the agent, passes people through", () => {
    expect(normalizeActor("system")).toBe(DEFAULT_AGENT_NAME);
    expect(normalizeActor("lint-fix")).toBe(DEFAULT_AGENT_NAME);
    expect(normalizeActor("yopedia")).toBe(DEFAULT_AGENT_NAME);
    expect(normalizeActor("yuanhao")).toBe("yuanhao");
    expect(normalizeActor("yuanhao--yoyo")).toBe("yuanhao--yoyo");
  });
});

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
