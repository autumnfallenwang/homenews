import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAnalysisRow = {
  id: "00000000-0000-0000-0000-000000000010",
  articleId: "00000000-0000-0000-0000-000000000020",
  relevance: 85,
  importance: 70,
  tags: ["ai", "llm"],
  llmSummary: "A summary of the article.",
  analyzedAt: new Date("2026-01-01"),
  articleTitle: "GPT-5 Released",
  articleLink: "https://example.com/gpt5",
  articleSummary: "OpenAI launches GPT-5",
  articleAuthor: "Jane Doe",
  articlePublishedAt: new Date("2026-01-01"),
  articleFetchedAt: new Date("2026-01-01"),
  feedName: "TechCrunch",
  feedAuthorityScore: 0.7,
  freshness: 0.9,
  compositeScore: 0.75,
};

let selectResult: unknown[] = [];

function makeChain(result: unknown[]) {
  const promise = Promise.resolve(result);
  const methods = ["from", "innerJoin", "where", "orderBy", "limit", "offset", "groupBy"];
  for (const method of methods) {
    // biome-ignore lint/suspicious/noExplicitAny: test mock chaining
    (promise as any)[method] = vi.fn(() => promise);
  }
  return promise;
}

vi.mock("../src/db/index.js", () => ({
  db: {
    select: () => makeChain(selectResult),
  },
}));

// Mock feed-fetcher (imported by feeds route via app.ts)
vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchFeed: vi.fn(),
  fetchAllFeeds: vi.fn(),
}));

// Mock settings service — composite weights
vi.mock("../src/services/settings.js", () => ({
  getSettingsBatch: vi.fn().mockResolvedValue({
    weight_relevance: 0.15,
    weight_importance: 0.35,
    weight_freshness: 0.25,
    weight_authority: 0.1,
    weight_uniqueness: 0.15,
    freshness_lambda: 0.03,
  }),
  getSetting: vi.fn(),
  seedDefaults: vi.fn(),
  setSetting: vi.fn(),
  listSettings: vi.fn(),
  resetSettings: vi.fn(),
}));

import app from "../src/app.js";

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [mockAnalysisRow];
});

describe("GET /ranked", () => {
  it("returns list of ranked articles", async () => {
    const res = await app.request("/ranked");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].relevance).toBe(85);
    expect(data[0].importance).toBe(70);
    expect(data[0].article.title).toBe("GPT-5 Released");
    expect(data[0].article.feedName).toBe("TechCrunch");
  });

  it("includes compositeScore and freshness in response", async () => {
    const res = await app.request("/ranked");
    const data = await res.json();
    expect(data[0].compositeScore).toBe(0.75);
    expect(data[0].freshness).toBe(0.9);
  });

  it("exposes feedAuthorityScore in the article object", async () => {
    const res = await app.request("/ranked");
    const data = await res.json();
    expect(data[0].article.feedAuthorityScore).toBe(0.7);
  });

  it("returns empty array when no results", async () => {
    selectResult = [];
    const res = await app.request("/ranked");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});

describe("GET /ranked/:id", () => {
  it("returns a single ranked article", async () => {
    const res = await app.request("/ranked/00000000-0000-0000-0000-000000000010");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("00000000-0000-0000-0000-000000000010");
    expect(data.relevance).toBe(85);
    expect(data.compositeScore).toBe(0.75);
    expect(data.article.title).toBe("GPT-5 Released");
  });

  it("returns 404 when not found", async () => {
    selectResult = [];
    const res = await app.request("/ranked/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
  });
});
