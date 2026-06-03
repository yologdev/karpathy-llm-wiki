import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../embeddings", () => ({ getWorkersAiBinding: vi.fn() }));
vi.mock("../llm", () => ({ hasLLMKey: vi.fn(() => false), callVisionLLM: vi.fn() }));

import { getWorkersAiBinding } from "../embeddings";
import { hasLLMKey, callVisionLLM } from "../llm";
import { describeImage } from "../vision";

const mockedBinding = vi.mocked(getWorkersAiBinding);
const mockedHasLLMKey = vi.mocked(hasLLMKey);
const mockedCallVisionLLM = vi.mocked(callVisionLLM);

function bindingReturning(run: (...a: unknown[]) => unknown) {
  mockedBinding.mockReturnValue({ run } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedHasLLMKey.mockReturnValue(false); // default: exercise the Workers AI path
});

const bytes = new Uint8Array([1, 2, 3]).buffer;

describe("describeImage — LLM (multimodal) path", () => {
  it("uses the configured LLM when a key is present, and does NOT call Workers AI", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallVisionLLM.mockResolvedValue("  一只猫  ");
    const run = vi.fn();
    bindingReturning(run);

    const result = await describeImage(bytes, { mediaType: "image/png" });

    expect(result).toEqual({ text: "一只猫" });
    expect(mockedCallVisionLLM).toHaveBeenCalledWith(
      expect.any(String),
      bytes,
      expect.objectContaining({ mediaType: "image/png" }),
    );
    expect(run).not.toHaveBeenCalled(); // Workers AI not used when the LLM succeeds
  });

  it("falls back to Workers AI when the LLM vision call throws", async () => {
    mockedHasLLMKey.mockReturnValue(true);
    mockedCallVisionLLM.mockRejectedValue(new Error("not multimodal"));
    const run = vi.fn().mockResolvedValue({ description: "a cat" });
    bindingReturning(run);

    expect(await describeImage(bytes)).toEqual({ text: "a cat" });
    expect(run).toHaveBeenCalled();
  });
});

describe("describeImage — Workers AI fallback", () => {
  it("returns null when neither the LLM nor the AI binding is available", async () => {
    mockedBinding.mockReturnValue(null);
    expect(await describeImage(bytes)).toBeNull();
  });

  it("calls the binding with the llava fallback model and image bytes as a number[]", async () => {
    const run = vi.fn().mockResolvedValue({ description: "a red square" });
    bindingReturning(run);

    const result = await describeImage(bytes);

    expect(result).toEqual({ text: "a red square" });
    const [model, input] = run.mock.calls[0];
    expect(model).toContain("llava");
    expect(input.image).toEqual([1, 2, 3]);
  });

  it("reads the `response` field too (model variance)", async () => {
    bindingReturning(vi.fn().mockResolvedValue({ response: "desc" }));
    expect(await describeImage(bytes)).toEqual({ text: "desc" });
  });

  it("returns null on an empty description", async () => {
    bindingReturning(vi.fn().mockResolvedValue({ response: "   " }));
    expect(await describeImage(bytes)).toBeNull();
  });

  it("fails soft (null) when the binding run throws", async () => {
    bindingReturning(vi.fn().mockRejectedValue(new Error("model error")));
    expect(await describeImage(bytes)).toBeNull();
  });

  it("honors the VISION_MODEL override for the Workers AI model", async () => {
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
