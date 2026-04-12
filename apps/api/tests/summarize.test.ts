import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-executor.js", () => ({
  llmExecute: vi.fn(),
}));

import { buildSummaryPrompt, parseSummaryResponse } from "../src/services/summarize.js";

describe("buildSummaryPrompt", () => {
  it("builds prompt with title only", () => {
    const prompt = buildSummaryPrompt("AI Breakthrough", null, null);
    expect(prompt).toBe("Title: AI Breakthrough");
  });

  it("builds prompt with title and summary", () => {
    const prompt = buildSummaryPrompt("AI Breakthrough", "New model achieves SOTA", null);
    expect(prompt).toContain("Title: AI Breakthrough");
    expect(prompt).toContain("Summary: New model achieves SOTA");
    expect(prompt).not.toContain("Content:");
  });

  it("builds prompt with all fields", () => {
    const prompt = buildSummaryPrompt("AI Breakthrough", "New model", "Full article text here");
    expect(prompt).toContain("Title: AI Breakthrough");
    expect(prompt).toContain("Summary: New model");
    expect(prompt).toContain("Content: Full article text here");
  });

  it("truncates content to 2000 characters", () => {
    const longContent = "a".repeat(3000);
    const prompt = buildSummaryPrompt("Title", null, longContent);
    expect(prompt).toContain("Content:");
    const contentPart = prompt.split("Content: ")[1];
    expect(contentPart).toHaveLength(2000);
  });
});

describe("parseSummaryResponse", () => {
  it("returns trimmed response", () => {
    const result = parseSummaryResponse("This is a summary of the article.");
    expect(result).toBe("This is a summary of the article.");
  });

  it("trims whitespace", () => {
    const result = parseSummaryResponse("  Summary with spaces.  \n");
    expect(result).toBe("Summary with spaces.");
  });

  it("throws on empty response", () => {
    expect(() => parseSummaryResponse("")).toThrow("Empty summary response");
  });

  it("throws on whitespace-only response", () => {
    expect(() => parseSummaryResponse("   \n  ")).toThrow("Empty summary response");
  });

  it("preserves multi-sentence summaries", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const result = parseSummaryResponse(text);
    expect(result).toBe(text);
  });
});
