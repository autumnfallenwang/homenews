import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChatCompletion = vi.fn();
const mockGetModelForTask = vi.fn();
const mockGetFallbackModelForTask = vi.fn();

vi.mock("../src/services/llm-client.js", () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
}));

vi.mock("../src/services/llm-registry.js", () => ({
  getTaskConfig: (task: string) => {
    const configs: Record<string, unknown> = {
      scoring: {
        name: "scoring",
        systemPrompt: "Score articles",
        outputFormat: "json",
      },
      summarization: {
        name: "summarization",
        systemPrompt: "Summarize articles",
        outputFormat: "text",
      },
    };
    return configs[task];
  },
  getModelForTask: (task: string) => mockGetModelForTask(task),
  getFallbackModelForTask: (task: string) => mockGetFallbackModelForTask(task),
}));

import { extractJson, llmExecute } from "../src/services/llm-executor.js";

beforeEach(() => {
  mockChatCompletion.mockReset();
  mockGetModelForTask.mockReset();
  mockGetFallbackModelForTask.mockReset();
});

describe("extractJson", () => {
  it("extracts JSON object from plain response", () => {
    const result = extractJson('{"score": 85}');
    expect(result).toEqual({ score: 85 });
  });

  it("extracts JSON from surrounding text", () => {
    const result = extractJson('Here is the result: {"score": 50} done.');
    expect(result).toEqual({ score: 50 });
  });

  it("extracts JSON from markdown code blocks", () => {
    // biome-ignore lint/security/noSecrets: false positive on test fixture
    const result = extractJson('```json\n{"score": 90}\n```');
    expect(result).toEqual({ score: 90 });
  });

  it("throws on no JSON", () => {
    expect(() => extractJson("No JSON here")).toThrow("No JSON found");
  });
});

describe("llmExecute", () => {
  it("returns parsed JSON for json outputFormat tasks", async () => {
    mockGetModelForTask.mockResolvedValueOnce("primary-model");
    mockGetFallbackModelForTask.mockResolvedValueOnce(null);
    mockChatCompletion.mockResolvedValueOnce('{"score": 85, "tags": ["ai"]}');
    const result = await llmExecute("scoring", "test prompt");

    expect(result.task).toBe("scoring");
    expect(result.model).toBe("primary-model");
    expect(result.parsed).toEqual({ score: 85, tags: ["ai"] });
    expect(result.raw).toContain("score");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns raw text for text outputFormat tasks", async () => {
    mockGetModelForTask.mockResolvedValueOnce("primary-model");
    mockGetFallbackModelForTask.mockResolvedValueOnce(null);
    mockChatCompletion.mockResolvedValueOnce("This is a summary.");
    const result = await llmExecute("summarization", "test prompt");

    expect(result.task).toBe("summarization");
    expect(result.raw).toBe("This is a summary.");
    expect(result.parsed).toBeUndefined();
  });

  it("includes timing info", async () => {
    mockGetModelForTask.mockResolvedValueOnce("primary-model");
    mockGetFallbackModelForTask.mockResolvedValueOnce(null);
    mockChatCompletion.mockResolvedValueOnce('{"score": 50}');
    const result = await llmExecute("scoring", "test");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws when LLM call fails and no fallback", async () => {
    mockGetModelForTask.mockResolvedValueOnce("primary-model");
    mockGetFallbackModelForTask.mockResolvedValueOnce(null);
    mockChatCompletion.mockRejectedValueOnce(new Error("API error"));
    await expect(llmExecute("scoring", "test")).rejects.toThrow("API error");
  });

  it("retries with fallback model when primary fails", async () => {
    mockGetModelForTask.mockResolvedValueOnce("primary-model");
    mockGetFallbackModelForTask.mockResolvedValueOnce("fallback-model");
    mockChatCompletion
      .mockRejectedValueOnce(new Error("Primary failed"))
      .mockResolvedValueOnce('{"score": 42}');

    const result = await llmExecute("scoring", "test");
    expect(result.model).toBe("fallback-model");
    expect(result.parsed).toEqual({ score: 42 });
    expect(mockChatCompletion).toHaveBeenCalledTimes(2);
  });

  it("throws when both primary and fallback fail", async () => {
    mockGetModelForTask.mockResolvedValueOnce("primary-model");
    mockGetFallbackModelForTask.mockResolvedValueOnce("fallback-model");
    mockChatCompletion
      .mockRejectedValueOnce(new Error("Primary failed"))
      .mockRejectedValueOnce(new Error("Fallback failed"));

    await expect(llmExecute("scoring", "test")).rejects.toThrow("Fallback failed");
  });
});
