import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-executor.js", () => ({
  llmExecute: vi.fn(),
}));
vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn(),
}));

import { buildAnalyzePrompt, parseAnalyzeResult } from "../src/services/analyze.js";

// biome-ignore lint/security/noSecrets: false positive on function name
describe("buildAnalyzePrompt", () => {
  it("builds prompt with title only", () => {
    const prompt = buildAnalyzePrompt("AI Breakthrough", null);
    expect(prompt).toBe("Title: AI Breakthrough");
  });

  it("builds prompt with title and summary", () => {
    const prompt = buildAnalyzePrompt("AI Breakthrough", "New model achieves SOTA");
    expect(prompt).toContain("Title: AI Breakthrough");
    expect(prompt).toContain("Summary: New model achieves SOTA");
  });
});

describe("parseAnalyzeResult", () => {
  const allowedTags = ["ai-research", "model-release", "openai", "anthropic"] as const;

  it("parses valid result", () => {
    const result = parseAnalyzeResult(
      { relevance: 85, importance: 70, tags: ["ai-research", "openai"] },
      allowedTags,
    );
    expect(result).toEqual({
      relevance: 85,
      importance: 70,
      tags: ["ai-research", "openai"],
    });
  });

  it("rounds fractional relevance and importance", () => {
    const result = parseAnalyzeResult({ relevance: 72.6, importance: 55.3, tags: [] }, allowedTags);
    expect(result.relevance).toBe(73);
    expect(result.importance).toBe(55);
  });

  it("filters tags to allowed vocabulary", () => {
    const result = parseAnalyzeResult(
      { relevance: 50, importance: 50, tags: ["ai-research", "chatgpt", "openai"] },
      allowedTags,
    );
    expect(result.tags).toEqual(["ai-research", "openai"]);
  });

  it("drops all unknown tags", () => {
    const result = parseAnalyzeResult(
      { relevance: 50, importance: 50, tags: ["chatgpt", "bard", "dall-e"] },
      allowedTags,
    );
    expect(result.tags).toEqual([]);
  });

  it("handles missing tags array", () => {
    const result = parseAnalyzeResult({ relevance: 50, importance: 50 }, allowedTags);
    expect(result.tags).toEqual([]);
  });

  it("throws on invalid relevance (out of range)", () => {
    expect(() =>
      parseAnalyzeResult({ relevance: 150, importance: 50, tags: [] }, allowedTags),
    ).toThrow("Invalid relevance");
  });

  it("throws on missing relevance", () => {
    expect(() => parseAnalyzeResult({ importance: 50, tags: [] }, allowedTags)).toThrow(
      "Invalid relevance",
    );
  });

  it("throws on invalid importance (negative)", () => {
    expect(() =>
      parseAnalyzeResult({ relevance: 50, importance: -5, tags: [] }, allowedTags),
    ).toThrow("Invalid importance");
  });

  it("throws on non-numeric relevance", () => {
    expect(() =>
      parseAnalyzeResult({ relevance: "high", importance: 50, tags: [] }, allowedTags),
    ).toThrow("Invalid relevance");
  });
});
