import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));

import { normalizeTitle, titleSimilarity } from "../src/services/dedup.js";

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("OpenAI Launches GPT-5!")).toBe("openai launches gpt5");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("Hello   World")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });

  it("preserves unicode letters", () => {
    expect(normalizeTitle("Über AI: Résumé")).toBe("über ai résumé");
  });

  it("strips special characters", () => {
    expect(normalizeTitle("[Update] AI — The Future?")).toBe("update ai the future");
  });
});

describe("titleSimilarity", () => {
  it("returns 1.0 for identical titles", () => {
    expect(titleSimilarity("OpenAI Launches GPT-5", "OpenAI Launches GPT-5")).toBe(1);
  });

  it("returns 1.0 for titles differing only in punctuation/case", () => {
    expect(titleSimilarity("OpenAI Launches GPT-5!", "openai launches gpt5")).toBe(1);
  });

  it("returns high similarity for same story different wording", () => {
    const a = "OpenAI announces GPT-5 with major improvements";
    const b = "OpenAI unveils GPT-5 featuring major improvements";
    expect(titleSimilarity(a, b)).toBeGreaterThan(0.6);
  });

  it("returns low similarity for unrelated titles", () => {
    const a = "OpenAI announces GPT-5";
    const b = "Apple releases new MacBook Pro";
    expect(titleSimilarity(a, b)).toBeLessThan(0.3);
  });

  it("returns 0 for empty strings", () => {
    expect(titleSimilarity("", "hello")).toBe(0);
    expect(titleSimilarity("hello", "")).toBe(0);
    expect(titleSimilarity("", "")).toBe(0);
  });

  it("returns 0 for single character titles", () => {
    expect(titleSimilarity("a", "b")).toBe(0);
  });

  it("handles very similar titles from different sources", () => {
    const a = "Google DeepMind unveils Gemini 2.0";
    const b = "Google's DeepMind announces Gemini 2.0 launch";
    expect(titleSimilarity(a, b)).toBeGreaterThan(0.5);
  });
});
