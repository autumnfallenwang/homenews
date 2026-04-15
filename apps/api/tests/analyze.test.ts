import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/index.js", () => ({ db: {} }));
vi.mock("../src/services/llm-executor.js", () => ({
  llmExecute: vi.fn(),
}));
vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn(),
}));

import {
  allocateSlots,
  buildAnalyzePrompt,
  type FeedAllocation,
  htmlToPlainText,
  parseAnalyzeResult,
} from "../src/services/analyze.js";

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

  it("includes content when provided", () => {
    const prompt = buildAnalyzePrompt(
      "AI Breakthrough",
      "Summary text",
      "Full article body with multiple paragraphs of context.",
    );
    expect(prompt).toContain("Title: AI Breakthrough");
    expect(prompt).toContain("Summary: Summary text");
    expect(prompt).toContain("Content: Full article body");
  });

  it("truncates content to 2000 chars in the prompt", () => {
    const longContent = "x".repeat(5000);
    const prompt = buildAnalyzePrompt("T", null, longContent);
    const contentSection = prompt.split("Content: ")[1] ?? "";
    expect(contentSection.length).toBe(2000);
  });
});

// biome-ignore lint/security/noSecrets: test HTML fixtures, not secrets
describe("htmlToPlainText", () => {
  it("strips HTML tags", () => {
    // biome-ignore lint/security/noSecrets: HTML fixture
    const out = htmlToPlainText("<p>Hello <b>world</b></p>", 100);
    expect(out).toBe("Hello world");
  });

  it("removes script and style blocks entirely", () => {
    // biome-ignore lint/security/noSecrets: HTML fixture
    const html = "<p>before</p><script>alert('x')</script><style>.a{color:red}</style><p>after</p>";
    const out = htmlToPlainText(html, 100);
    expect(out).not.toContain("alert");
    expect(out).not.toContain("color:red");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("decodes common HTML entities", () => {
    const out = htmlToPlainText("Tom &amp; Jerry said &quot;hi&quot; &lt;br&gt;", 100);
    expect(out).toBe(`Tom & Jerry said "hi" <br>`);
  });

  it("collapses whitespace", () => {
    const out = htmlToPlainText("<p>Hello\n\n\n   world</p>", 100);
    expect(out).toBe("Hello world");
  });

  it("truncates to maxChars", () => {
    // biome-ignore lint/security/noSecrets: HTML fixture
    const out = htmlToPlainText("<p>abcdefghij</p>", 5);
    expect(out).toBe("abcde");
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

// --- Phase 10 — allocateSlots ---

function feed(id: string, weight: number, pending: number): FeedAllocation {
  return { feedId: id, weight, pending };
}

describe("allocateSlots", () => {
  it("returns empty map for empty input", () => {
    expect(allocateSlots([], 100).size).toBe(0);
  });

  it("returns empty map when totalSlots is zero", () => {
    expect(allocateSlots([feed("a", 0.5, 10)], 0).size).toBe(0);
  });

  it("returns empty map when totalSlots is negative", () => {
    expect(allocateSlots([feed("a", 0.5, 10)], -5).size).toBe(0);
  });

  it("single feed with plenty of pending: takes all slots", () => {
    const r = allocateSlots([feed("a", 0.5, 1000)], 50);
    expect(r.get("a")).toBe(50);
    expect(r.size).toBe(1);
  });

  it("single feed pending < slots: takes all pending", () => {
    const r = allocateSlots([feed("a", 0.5, 20)], 100);
    expect(r.get("a")).toBe(20);
    expect(r.size).toBe(1);
  });

  it("equal weights + equal large pending: equal split", () => {
    const r = allocateSlots([feed("a", 0.5, 1000), feed("b", 0.5, 1000)], 100);
    expect(r.get("a")).toBe(50);
    expect(r.get("b")).toBe(50);
  });

  it("proportional split by weight", () => {
    const r = allocateSlots([feed("a", 0.8, 1000), feed("b", 0.2, 1000)], 100);
    expect(r.get("a")).toBe(80);
    expect(r.get("b")).toBe(20);
  });

  it("low-volume feed returns excess via spillover", () => {
    const r = allocateSlots([feed("a", 0.5, 5), feed("b", 0.5, 1000)], 100);
    expect(r.get("a")).toBe(5);
    expect(r.get("b")).toBe(95);
  });

  it("zero-weight feed is excluded entirely", () => {
    const r = allocateSlots([feed("a", 0, 50), feed("b", 0.5, 1000)], 100);
    expect(r.has("a")).toBe(false);
    expect(r.get("b")).toBe(100);
  });

  it("zero-pending feed is excluded entirely", () => {
    const r = allocateSlots([feed("a", 0.5, 0), feed("b", 0.5, 1000)], 100);
    expect(r.has("a")).toBe(false);
    expect(r.get("b")).toBe(100);
  });

  it("total pending < batch: every feed takes its full pending", () => {
    const r = allocateSlots([feed("a", 0.5, 5), feed("b", 0.5, 10)], 100);
    expect(r.get("a")).toBe(5);
    expect(r.get("b")).toBe(10);
    const sum = [...r.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(15);
  });

  it("realistic Phase-10 distribution: 12 feeds with mixed volumes", () => {
    // Mirrors the real diagnostic data: 3 arXiv high-volume + 9 lab/news
    // small-volume feeds, all at default weight 0.5.
    const all = [
      feed("arxiv-cs-ai", 0.5, 1133),
      feed("arxiv-cs-lg", 0.5, 592),
      feed("arxiv-cs-cl", 0.5, 411),
      feed("ars-tech", 0.5, 21),
      feed("anthropic", 0.5, 14),
      feed("nvidia-dev", 0.5, 14),
      feed("mit-tech", 0.5, 7),
      feed("meta-ai", 0.5, 5),
      feed("mistral", 0.5, 5),
      feed("ms-research", 0.5, 2),
      feed("deepmind", 0.5, 1),
      feed("openai", 0.5, 1),
    ];
    const r = allocateSlots(all, 100);

    // All 12 feeds should appear in the map
    expect(r.size).toBe(12);

    // Total allocated must equal the budget
    const total = [...r.values()].reduce((s, n) => s + n, 0);
    expect(total).toBe(100);

    // No single arXiv feed should monopolize the batch — each capped well
    // below the 99/100 it would get under the broken `ORDER BY pub DESC` query.
    for (const id of ["arxiv-cs-ai", "arxiv-cs-lg", "arxiv-cs-cl"]) {
      const slots = r.get(id) ?? 0;
      expect(slots).toBeGreaterThan(0);
      expect(slots).toBeLessThanOrEqual(20);
    }

    // Small-volume feeds should get exactly their pending count
    expect(r.get("deepmind")).toBe(1);
    expect(r.get("openai")).toBe(1);
    expect(r.get("ms-research")).toBe(2);
  });
});
