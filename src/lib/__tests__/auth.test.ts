import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// auth.ts imports Clerk at module scope; stub it (getServicePrincipal doesn't
// use it, but the import must resolve).
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

import { getServicePrincipal, getPrincipal } from "../auth";
import { auth, currentUser } from "@clerk/nextjs/server";

const mockedAuth = vi.mocked(auth);
const mockedCurrentUser = vi.mocked(currentUser);

const TOKEN = "s3cr3t-service-token-abcdef";
const HANDLE = "yoyo-bot";

function reqWith(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("https://yopedia.example/api/agents/seed", {
    method: "POST",
    headers,
  });
}

let savedToken: string | undefined;
let savedHandle: string | undefined;

beforeEach(() => {
  savedToken = process.env.YOPEDIA_SERVICE_TOKEN;
  savedHandle = process.env.YOPEDIA_SERVICE_PRINCIPAL;
  process.env.YOPEDIA_SERVICE_TOKEN = TOKEN;
  process.env.YOPEDIA_SERVICE_PRINCIPAL = HANDLE;
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.YOPEDIA_SERVICE_TOKEN;
  else process.env.YOPEDIA_SERVICE_TOKEN = savedToken;
  if (savedHandle === undefined) delete process.env.YOPEDIA_SERVICE_PRINCIPAL;
  else process.env.YOPEDIA_SERVICE_PRINCIPAL = savedHandle;
});

describe("getServicePrincipal", () => {
  it("resolves a principal for the correct bearer token", () => {
    const p = getServicePrincipal(reqWith(`Bearer ${TOKEN}`));
    expect(p).toEqual({ id: `service:${HANDLE}`, handle: HANDLE });
  });

  it("accepts a case-insensitive scheme", () => {
    expect(getServicePrincipal(reqWith(`bearer ${TOKEN}`))).not.toBeNull();
  });

  it("returns null for a wrong token", () => {
    expect(getServicePrincipal(reqWith("Bearer wrong-token"))).toBeNull();
  });

  it("returns null for a token of different length (no partial match)", () => {
    expect(getServicePrincipal(reqWith(`Bearer ${TOKEN}x`))).toBeNull();
  });

  it("returns null when there is no Authorization header", () => {
    expect(getServicePrincipal(reqWith())).toBeNull();
  });

  it("returns null for a non-bearer header", () => {
    expect(getServicePrincipal(reqWith(`Basic ${TOKEN}`))).toBeNull();
  });

  it("returns null when the token env var is unset (feature off)", () => {
    delete process.env.YOPEDIA_SERVICE_TOKEN;
    expect(getServicePrincipal(reqWith(`Bearer ${TOKEN}`))).toBeNull();
  });

  it("returns null when the principal handle env var is unset", () => {
    delete process.env.YOPEDIA_SERVICE_PRINCIPAL;
    expect(getServicePrincipal(reqWith(`Bearer ${TOKEN}`))).toBeNull();
  });

  it("does not accept an empty bearer token even if env token is empty", () => {
    process.env.YOPEDIA_SERVICE_TOKEN = "";
    expect(getServicePrincipal(reqWith("Bearer "))).toBeNull();
  });
});

describe("getPrincipal", () => {
  it("returns null when signed out", async () => {
    mockedAuth.mockResolvedValue({ userId: null } as never);
    expect(await getPrincipal()).toBeNull();
  });

  it("uses the Clerk username as the handle (email/waitlist sign-ups)", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1" } as never);
    mockedCurrentUser.mockResolvedValue({
      username: "jane",
      externalAccounts: [],
    } as never);
    expect(await getPrincipal()).toEqual({ id: "user_1", handle: "jane" });
  });

  it("falls back to a connected X handle when no username is set (legacy)", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_2" } as never);
    mockedCurrentUser.mockResolvedValue({
      username: null,
      externalAccounts: [{ provider: "oauth_x", username: "xjane" }],
    } as never);
    expect(await getPrincipal()).toEqual({ id: "user_2", handle: "xjane" });
  });

  it("falls back to the user id when neither a username nor X handle exists", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_3" } as never);
    mockedCurrentUser.mockResolvedValue({
      username: null,
      externalAccounts: [],
    } as never);
    expect(await getPrincipal()).toEqual({ id: "user_3", handle: "user_3" });
  });
});
