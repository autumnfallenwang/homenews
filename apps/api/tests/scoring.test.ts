import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-client.js", () => ({
  llm: {},
  chatCompletion: vi.fn(),
}));

import { buildScoringPrompt, parseScoreResponse } from "../src/services/scoring.js";

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

describe("parseScoreResponse", () => {
  it("parses valid JSON response", () => {
    const response = '{"score": 85, "tags": ["ai", "llm"], "reasoning": "Highly relevant"}';
    const result = parseScoreResponse(response);
    expect(result).toEqual({
      score: 85,
      tags: ["ai", "llm"],
      reasoning: "Highly relevant",
    });
  });

  it("extracts JSON from surrounding text", () => {
    const response =
      'Here is the result: {"score": 50, "tags": ["tech"], "reasoning": "Somewhat relevant"} Done.';
    const result = parseScoreResponse(response);
    expect(result.score).toBe(50);
    expect(result.tags).toEqual(["tech"]);
  });

  it("rounds fractional scores", () => {
    const response = '{"score": 72.6, "tags": [], "reasoning": ""}';
    const result = parseScoreResponse(response);
    expect(result.score).toBe(73);
  });

  it("handles missing tags gracefully", () => {
    const response = '{"score": 40, "reasoning": "Low relevance"}';
    const result = parseScoreResponse(response);
    expect(result.tags).toEqual([]);
  });

  it("handles missing reasoning gracefully", () => {
    const response = '{"score": 90, "tags": ["ai"]}';
    const result = parseScoreResponse(response);
    expect(result.reasoning).toBe("");
  });

  it("throws on no JSON in response", () => {
    expect(() => parseScoreResponse("I cannot score this")).toThrow("No JSON found");
  });

  it("throws on invalid score", () => {
    expect(() => parseScoreResponse('{"score": 150, "tags": []}')).toThrow("Invalid score");
  });

  it("throws on negative score", () => {
    expect(() => parseScoreResponse('{"score": -5, "tags": []}')).toThrow("Invalid score");
  });

  it("throws on non-numeric score", () => {
    expect(() => parseScoreResponse('{"score": "high", "tags": []}')).toThrow("Invalid score");
  });
});
