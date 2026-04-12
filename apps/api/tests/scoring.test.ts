import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-executor.js", () => ({
  llmExecute: vi.fn(),
}));

import { buildScoringPrompt, parseScoreResult } from "../src/services/scoring.js";

describe("buildScoringPrompt", () => {
  it("builds prompt with title only", () => {
    const prompt = buildScoringPrompt("AI Breakthrough", null);
    expect(prompt).toBe("Title: AI Breakthrough");
  });

  it("builds prompt with title and summary", () => {
    const prompt = buildScoringPrompt("AI Breakthrough", "New model achieves SOTA");
    expect(prompt).toContain("Title: AI Breakthrough");
    expect(prompt).toContain("Summary: New model achieves SOTA");
  });
});

describe("parseScoreResult", () => {
  it("parses valid score result", () => {
    const result = parseScoreResult({
      score: 85,
      tags: ["ai", "llm"],
      reasoning: "Highly relevant",
    });
    expect(result).toEqual({
      score: 85,
      tags: ["ai", "llm"],
      reasoning: "Highly relevant",
    });
  });

  it("rounds fractional scores", () => {
    const result = parseScoreResult({ score: 72.6, tags: [], reasoning: "" });
    expect(result.score).toBe(73);
  });

  it("handles missing tags gracefully", () => {
    const result = parseScoreResult({ score: 40, reasoning: "Low relevance" });
    expect(result.tags).toEqual([]);
  });

  it("handles missing reasoning gracefully", () => {
    const result = parseScoreResult({ score: 90, tags: ["ai"] });
    expect(result.reasoning).toBe("");
  });

  it("throws on invalid score", () => {
    expect(() => parseScoreResult({ score: 150, tags: [] })).toThrow("Invalid score");
  });

  it("throws on negative score", () => {
    expect(() => parseScoreResult({ score: -5, tags: [] })).toThrow("Invalid score");
  });

  it("throws on non-numeric score", () => {
    expect(() => parseScoreResult({ score: "high", tags: [] })).toThrow("Invalid score");
  });

  it("converts non-string tags to strings", () => {
    const result = parseScoreResult({ score: 50, tags: [1, true, "ai"], reasoning: "" });
    expect(result.tags).toEqual(["1", "true", "ai"]);
  });
});
