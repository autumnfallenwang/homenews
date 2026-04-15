import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockGetSetting = vi.fn();

vi.mock("../src/services/llm-client.js", () => ({
  llm: {
    embeddings: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("../src/services/settings.js", () => ({
  getSetting: (key: string) => mockGetSetting(key),
}));

import { embed, embedBatch } from "../src/services/embed.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSetting.mockResolvedValue("bge-m3");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const sampleVector = Array.from({ length: 1024 }, (_, i) => i / 1024);

describe("embed", () => {
  it("returns the vector from the response", async () => {
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: sampleVector }],
    });

    const result = await embed("hello world");
    expect(result).toEqual(sampleVector);
    expect(result).toHaveLength(1024);
  });

  it("reads the model name from settings on every call", async () => {
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: sampleVector }],
    });
    mockGetSetting.mockResolvedValueOnce("nomic-embed-text-v1.5");

    await embed("hello");
    expect(mockGetSetting).toHaveBeenCalledWith("embedding_model_name");
    expect(mockCreate).toHaveBeenCalledWith({
      model: "nomic-embed-text-v1.5",
      input: "hello",
    });
  });

  it("falls back to the default model when the setting is missing", async () => {
    mockGetSetting.mockRejectedValueOnce(new Error("not found"));
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: sampleVector }],
    });

    await embed("hello");
    expect(mockCreate).toHaveBeenCalledWith({ model: "bge-m3", input: "hello" });
  });

  it("throws when the gateway returns an error", async () => {
    mockCreate.mockRejectedValueOnce(new Error("gateway timeout"));
    await expect(embed("hello")).rejects.toThrow("gateway timeout");
  });

  it("throws when response.data is empty", async () => {
    mockCreate.mockResolvedValueOnce({ data: [] });
    await expect(embed("hello")).rejects.toThrow(/no data/);
  });
});

describe("embedBatch", () => {
  it("returns one vector per input in the same order", async () => {
    const v0 = Array.from({ length: 1024 }, () => 0);
    const v1 = Array.from({ length: 1024 }, () => 1);
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 0, embedding: v0 },
        { index: 1, embedding: v1 },
      ],
    });

    const result = await embedBatch(["first", "second"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(v0);
    expect(result[1]).toEqual(v1);
  });

  it("passes all inputs in a single API call", async () => {
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 0, embedding: sampleVector },
        { index: 1, embedding: sampleVector },
        { index: 2, embedding: sampleVector },
      ],
    });

    await embedBatch(["a", "b", "c"]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      model: "bge-m3",
      input: ["a", "b", "c"],
    });
  });

  it("reorders out-of-order responses by index", async () => {
    const v0 = Array.from({ length: 1024 }, () => 0);
    const v1 = Array.from({ length: 1024 }, () => 1);
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 1, embedding: v1 },
        { index: 0, embedding: v0 },
      ],
    });

    const result = await embedBatch(["first", "second"]);
    expect(result[0]).toEqual(v0);
    expect(result[1]).toEqual(v1);
  });

  it("returns an empty array without hitting the gateway on empty input", async () => {
    const result = await embedBatch([]);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws when vector count mismatches input count", async () => {
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: sampleVector }],
    });
    await expect(embedBatch(["a", "b"])).rejects.toThrow(/got 1 vectors for 2/);
  });
});
