import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../embeddings", () => ({ getWorkersAiBinding: vi.fn() }));

import { getWorkersAiBinding } from "../embeddings";
import { describeImage } from "../vision";

const mockedBinding = vi.mocked(getWorkersAiBinding);

function bindingReturning(run: (...a: unknown[]) => unknown) {
  mockedBinding.mockReturnValue({ run } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("describeImage", () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;

  it("returns null when the AI binding is unavailable (off-Workers)", async () => {
    mockedBinding.mockReturnValue(null);
    expect(await describeImage(bytes)).toBeNull();
  });

  it("reads the `response` field (llama-vision) and passes image bytes as a number[]", async () => {
    const run = vi.fn().mockResolvedValue({ response: "  a red square  " });
    bindingReturning(run);

    const result = await describeImage(bytes);

    expect(result).toEqual({ text: "a red square" });
    const [model, input] = run.mock.calls[0];
    expect(model).toContain("vision");
    expect(input.image).toEqual([1, 2, 3]);
    expect(typeof input.prompt).toBe("string");
  });

  it("falls back to the `description` field (llava)", async () => {
    bindingReturning(vi.fn().mockResolvedValue({ description: "a cat" }));
    expect(await describeImage(bytes)).toEqual({ text: "a cat" });
  });

  it("returns null on an empty description", async () => {
    bindingReturning(vi.fn().mockResolvedValue({ response: "   " }));
    expect(await describeImage(bytes)).toBeNull();
  });

  it("fails soft (null) when the model run throws", async () => {
    bindingReturning(vi.fn().mockRejectedValue(new Error("model error")));
    expect(await describeImage(bytes)).toBeNull();
  });

  it("honors the VISION_MODEL override", async () => {
    const prev = process.env.VISION_MODEL;
    process.env.VISION_MODEL = "@cf/custom/model";
    const run = vi.fn().mockResolvedValue({ response: "x" });
    bindingReturning(run);

    await describeImage(bytes);

    expect(run.mock.calls[0][0]).toBe("@cf/custom/model");
    if (prev === undefined) delete process.env.VISION_MODEL;
    else process.env.VISION_MODEL = prev;
  });
});
