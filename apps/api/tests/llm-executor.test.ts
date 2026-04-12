import { describe, expect, it, vi } from "vitest";

const mockChatCompletion = vi.fn();

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
        model: "test-model",
      },
      summarization: {
        name: "summarization",
        systemPrompt: "Summarize articles",
        outputFormat: "text",
        model: "test-model",
      },
    };
    return configs[task];
  },
}));

import { extractJson, llmExecute } from "../src/services/llm-executor.js";

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
    mockChatCompletion.mockResolvedValueOnce('{"score": 85, "tags": ["ai"]}');
    const result = await llmExecute("scoring", "test prompt");

    expect(result.task).toBe("scoring");
    expect(result.model).toBe("test-model");
    expect(result.parsed).toEqual({ score: 85, tags: ["ai"] });
    expect(result.raw).toContain("score");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns raw text for text outputFormat tasks", async () => {
    mockChatCompletion.mockResolvedValueOnce("This is a summary.");
    const result = await llmExecute("summarization", "test prompt");

    expect(result.task).toBe("summarization");
    expect(result.raw).toBe("This is a summary.");
    expect(result.parsed).toBeUndefined();
  });

  it("includes timing info", async () => {
    mockChatCompletion.mockResolvedValueOnce('{"score": 50}');
    const result = await llmExecute("scoring", "test");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws when LLM call fails and no fallback", async () => {
    mockChatCompletion.mockRejectedValueOnce(new Error("API error"));
    await expect(llmExecute("scoring", "test")).rejects.toThrow("API error");
  });
});
