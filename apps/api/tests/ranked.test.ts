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
  articleExtractedContent: null,
  articleExtractedAt: null,
  articleExtractionStatus: null,
  feedName: "TechCrunch",
  feedAuthorityScore: 0.7,
  freshness: 0.9,
  compositeScore: 0.75,
};

// Each test can queue up a sequence of results — first db.select() returns
// selectResults[0], second returns selectResults[1], etc. This matters for
// the list endpoint which runs the row query + a count query in parallel.
let selectResults: unknown[][] = [];
let selectCallIndex = 0;

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
    select: () => {
      const result = selectResults[selectCallIndex++] ?? [];
      return makeChain(result);
    },
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
  selectCallIndex = 0;
  // Default: list endpoint gets one row + count=1; single-id endpoint only
  // consumes the first entry.
  selectResults = [[mockAnalysisRow], [{ count: 1 }]];
});

describe("GET /ranked", () => {
  it("returns wrapped { rows, total, limit, offset } response", async () => {
    const res = await app.request("/ranked");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows[0].relevance).toBe(85);
    expect(data.rows[0].importance).toBe(70);
    expect(data.rows[0].article.title).toBe("GPT-5 Released");
    expect(data.rows[0].article.feedName).toBe("TechCrunch");
    expect(data.total).toBe(1);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
  });

  it("includes compositeScore and freshness in rows", async () => {
    const res = await app.request("/ranked");
    const data = await res.json();
    expect(data.rows[0].compositeScore).toBe(0.75);
    expect(data.rows[0].freshness).toBe(0.9);
  });

  it("exposes feedAuthorityScore in the article object", async () => {
    const res = await app.request("/ranked");
    const data = await res.json();
    expect(data.rows[0].article.feedAuthorityScore).toBe(0.7);
  });

  it("returns empty rows and total=0 when no results", async () => {
    selectResults = [[], [{ count: 0 }]];
    const res = await app.request("/ranked");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("rejects invalid sort field with 400", async () => {
    const res = await app.request("/ranked?sort=bogus");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid query");
    expect(Array.isArray(data.issues)).toBe(true);
  });

  it("rejects bare date (no timezone) with 400", async () => {
    const res = await app.request("/ranked?published_at_gte=2026-04-08");
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range limit with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const url = "/ranked?limit=500";
    const res = await app.request(url);
    expect(res.status).toBe(400);
  });

  it("omits facets when include_facets is absent", async () => {
    const res = await app.request("/ranked");
    const data = await res.json();
    expect(data.facets).toBeUndefined();
  });

  it("returns facets when include_facets=1", async () => {
    selectResults = [
      [mockAnalysisRow],
      [{ count: 1 }],
      [
        { name: "TechCrunch", count: 14 },
        { name: "DeepMind", count: 9 },
      ],
      [
        { name: "ai", count: 32 },
        { name: "llm", count: 19 },
      ],
      [{ name: "lab", count: 62 }],
    ];
    const res = await app.request("/ranked?include_facets=1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.facets).toBeDefined();
    expect(data.facets.sources[0]).toEqual({ name: "TechCrunch", count: 14 });
    expect(data.facets.tags[0]).toEqual({ name: "ai", count: 32 });
    expect(data.facets.categories[0]).toEqual({ name: "lab", count: 62 });
  });

  it("also accepts include_facets=true", async () => {
    selectResults = [
      [mockAnalysisRow],
      [{ count: 1 }],
      [{ name: "TechCrunch", count: 14 }],
      [{ name: "ai", count: 32 }],
      [{ name: "lab", count: 62 }],
    ];
    const res = await app.request("/ranked?include_facets=true");
    const data = await res.json();
    expect(data.facets).toBeDefined();
    expect(data.facets.sources).toHaveLength(1);
  });

  // ─── Task 67: Phase 13 filter coverage ───

  it("rejects offset > 10000 with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/ranked?offset=20000");
    expect(res.status).toBe(400);
  });

  it("rejects negative offset with 400", async () => {
    const res = await app.request("/ranked?offset=-1");
    expect(res.status).toBe(400);
  });

  it("rejects composite_gte > 100 with 400", async () => {
    const res = await app.request("/ranked?composite_gte=150");
    expect(res.status).toBe(400);
  });

  it("rejects negative threshold with 400", async () => {
    const res = await app.request("/ranked?relevance_gte=-5");
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric threshold with 400", async () => {
    const res = await app.request("/ranked?importance_gte=abc");
    expect(res.status).toBe(400);
  });

  const SORT_FIELDS = [
    "composite",
    "relevance",
    "importance",
    "freshness",
    "published",
    "analyzed",
  ] as const;

  for (const field of SORT_FIELDS) {
    it(`accepts sort=-${field}`, async () => {
      selectResults = [[mockAnalysisRow], [{ count: 1 }]];
      const res = await app.request(`/ranked?sort=-${field}`);
      expect(res.status).toBe(200);
    });
  }

  it("accepts ascending sort direction (no - prefix)", async () => {
    selectResults = [[mockAnalysisRow], [{ count: 1 }]];
    const res = await app.request("/ranked?sort=composite");
    expect(res.status).toBe(200);
  });

  it("accepts q + sources + categories + tags together", async () => {
    selectResults = [[mockAnalysisRow], [{ count: 1 }]];
    const url =
      // biome-ignore lint/security/noSecrets: URL, not a secret
      "/ranked?q=claude&sources=Anthropic,DeepMind&categories=lab&tags=ai-safety,model-release";
    const res = await app.request(url);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows).toHaveLength(1);
  });

  it("echoes custom limit and offset in the response", async () => {
    selectResults = [[mockAnalysisRow], [{ count: 100 }]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/ranked?limit=25&offset=75");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.limit).toBe(25);
    expect(data.offset).toBe(75);
    expect(data.total).toBe(100);
  });

  it("facets response has sources/tags/categories array shape", async () => {
    selectResults = [
      [mockAnalysisRow],
      [{ count: 1 }],
      [{ name: "Anthropic", count: 14 }],
      [{ name: "ai-safety", count: 32 }],
      [{ name: "lab", count: 62 }],
    ];
    const res = await app.request("/ranked?include_facets=1");
    const data = await res.json();
    expect(data.facets).toBeDefined();
    expect(Array.isArray(data.facets.sources)).toBe(true);
    expect(Array.isArray(data.facets.tags)).toBe(true);
    expect(Array.isArray(data.facets.categories)).toBe(true);
    expect(data.facets.sources[0]).toEqual({ name: "Anthropic", count: 14 });
    expect(data.facets.tags[0]).toEqual({ name: "ai-safety", count: 32 });
    expect(data.facets.categories[0]).toEqual({ name: "lab", count: 62 });
  });

  it("handles empty facets arrays gracefully", async () => {
    selectResults = [[], [{ count: 0 }], [], [], []];
    const res = await app.request("/ranked?include_facets=1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.facets.sources).toEqual([]);
    expect(data.facets.tags).toEqual([]);
    expect(data.facets.categories).toEqual([]);
  });

  // ─── Task 75: tags filter matches LLM tags OR user tags ───

  it("accepts tags filter that matches user_tags (via EXISTS subquery)", async () => {
    // The raw sql EXISTS subquery on article_interactions should compile and
    // run through the route without throwing. The mock doesn't exercise the
    // actual SQL — this is a smoke test that the new query builds cleanly.
    selectResults = [[mockAnalysisRow], [{ count: 1 }]];
    const res = await app.request("/ranked?tags=ai-safety");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows).toHaveLength(1);
  });

  it("tags facet query builds with the union-arrays subquery", async () => {
    selectResults = [
      [mockAnalysisRow],
      [{ count: 1 }],
      [{ name: "Anthropic", count: 5 }],
      [
        { name: "ai-safety", count: 14 },
        { name: "roadmap", count: 3 },
      ],
      [{ name: "lab", count: 5 }],
    ];
    const res = await app.request("/ranked?include_facets=1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.facets.tags).toHaveLength(2);
    expect(data.facets.tags[0].name).toBe("ai-safety");
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
    selectResults = [[]];
    const res = await app.request("/ranked/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
  });
});
