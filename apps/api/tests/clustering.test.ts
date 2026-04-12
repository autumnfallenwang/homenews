import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-executor.js", () => ({
  llmExecute: vi.fn(),
}));

import { buildClusteringPrompt, parseClusterResult } from "../src/services/clustering.js";

// biome-ignore lint/security/noSecrets: false positive on function name
describe("buildClusteringPrompt", () => {
  it("formats articles with IDs and titles", () => {
    const items = [
      { id: "a1", title: "OpenAI launches GPT-5" },
      { id: "a2", title: "Google releases Gemini 3" },
    ];
    const prompt = buildClusteringPrompt(items);
    expect(prompt).toContain("[a1] OpenAI launches GPT-5");
    expect(prompt).toContain("[a2] Google releases Gemini 3");
    expect(prompt).toContain("Group these articles");
  });

  it("handles single article", () => {
    const items = [{ id: "a1", title: "Solo article" }];
    const prompt = buildClusteringPrompt(items);
    expect(prompt).toContain("[a1] Solo article");
  });

  it("handles empty input", () => {
    const prompt = buildClusteringPrompt([]);
    expect(prompt).toContain("Group these articles");
  });
});

describe("parseClusterResult", () => {
  const articleIds = ["a1", "a2", "a3"];

  it("parses valid cluster result with nested clusters key", () => {
    const parsed = { clusters: { a1: "GPT-5 Launch", a2: "GPT-5 Launch", a3: "AI Regulation" } };
    const result = parseClusterResult(parsed, articleIds);
    expect(result.get("a1")).toBe("GPT-5 Launch");
    expect(result.get("a2")).toBe("GPT-5 Launch");
    expect(result.get("a3")).toBe("AI Regulation");
  });

  it("parses flat object without clusters key", () => {
    const parsed = { a1: "Topic A", a2: "Topic A", a3: "Topic B" };
    const result = parseClusterResult(parsed, articleIds);
    expect(result.size).toBe(3);
    expect(result.get("a1")).toBe("Topic A");
  });

  it("ignores unknown article IDs", () => {
    const parsed = { a1: "Topic A", unknown_id: "Topic X", a2: "Topic B" };
    const result = parseClusterResult(parsed, articleIds);
    expect(result.size).toBe(2);
    expect(result.has("unknown_id")).toBe(false);
  });

  it("ignores empty labels", () => {
    const parsed = { a1: "Topic A", a2: "", a3: "Topic B" };
    const result = parseClusterResult(parsed, articleIds);
    expect(result.size).toBe(2);
    expect(result.has("a2")).toBe(false);
  });

  it("trims whitespace from labels", () => {
    const parsed = { a1: "  Topic A  " };
    const result = parseClusterResult(parsed, ["a1"]);
    expect(result.get("a1")).toBe("Topic A");
  });

  it("throws on invalid format", () => {
    expect(() => parseClusterResult("not an object", articleIds)).toThrow(
      "Invalid cluster response",
    );
  });
});
