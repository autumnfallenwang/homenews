import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-client.js", () => ({
  llm: {},
  chatCompletion: vi.fn(),
}));

import { buildClusteringPrompt, parseClusterResponse } from "../src/services/clustering.js";

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

describe("parseClusterResponse", () => {
  const articleIds = ["a1", "a2", "a3"];

  it("parses valid cluster response with nested clusters key", () => {
    const response =
      '{"clusters": {"a1": "GPT-5 Launch", "a2": "GPT-5 Launch", "a3": "AI Regulation"}}';
    const result = parseClusterResponse(response, articleIds);
    expect(result.get("a1")).toBe("GPT-5 Launch");
    expect(result.get("a2")).toBe("GPT-5 Launch");
    expect(result.get("a3")).toBe("AI Regulation");
  });

  it("parses flat object response without clusters key", () => {
    const response = '{"a1": "Topic A", "a2": "Topic A", "a3": "Topic B"}';
    const result = parseClusterResponse(response, articleIds);
    expect(result.size).toBe(3);
    expect(result.get("a1")).toBe("Topic A");
  });

  it("ignores unknown article IDs", () => {
    const response = '{"a1": "Topic A", "unknown_id": "Topic X", "a2": "Topic B"}';
    const result = parseClusterResponse(response, articleIds);
    expect(result.size).toBe(2);
    expect(result.has("unknown_id")).toBe(false);
  });

  it("ignores empty labels", () => {
    const response = '{"a1": "Topic A", "a2": "", "a3": "Topic B"}';
    const result = parseClusterResponse(response, articleIds);
    expect(result.size).toBe(2);
    expect(result.has("a2")).toBe(false);
  });

  it("extracts JSON from surrounding text", () => {
    const response = 'Here are the clusters: {"a1": "AI News", "a2": "AI News"} end';
    const result = parseClusterResponse(response, ["a1", "a2"]);
    expect(result.get("a1")).toBe("AI News");
  });

  it("throws on no JSON in response", () => {
    expect(() => parseClusterResponse("No JSON here", articleIds)).toThrow("No JSON found");
  });

  it("throws on invalid format", () => {
    expect(() => parseClusterResponse('{"clusters": "not an object"}', articleIds)).toThrow(
      "Invalid cluster response",
    );
  });

  it("trims whitespace from labels", () => {
    const response = '{"a1": "  Topic A  "}';
    const result = parseClusterResponse(response, ["a1"]);
    expect(result.get("a1")).toBe("Topic A");
  });
});
