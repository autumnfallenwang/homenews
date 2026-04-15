import { beforeEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/security/noSecrets: UUID constant
const ARTICLE_ID = "11111111-1111-1111-1111-111111111111";
// biome-ignore lint/security/noSecrets: UUID constant
const ANALYSIS_ID = "22222222-2222-2222-2222-222222222222";
// biome-ignore lint/security/noSecrets: UUID constant
const HIGHLIGHT_ID = "33333333-3333-3333-3333-333333333333";

// Queue of result arrays for sequential `db.execute()` calls.
let executeResults: unknown[][] = [];
let executeCallIndex = 0;

vi.mock("../src/db/index.js", () => ({
  db: {
    execute: vi.fn(() => {
      const result = executeResults[executeCallIndex++] ?? [];
      return Promise.resolve(result);
    }),
    // Stubs for the other query-builder methods — other routes imported
    // via app.ts may touch them on boot. Tests here only exercise execute.
    select: () => ({
      from: () => Promise.resolve([]),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  },
}));

const mockEmbed = vi.fn();

vi.mock("../src/services/embed.js", () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  embedBatch: vi.fn(),
}));

vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchFeed: vi.fn(),
  fetchAllFeeds: vi.fn(),
}));

vi.mock("../src/services/settings.js", () => ({
  getSettingsBatch: vi.fn().mockResolvedValue({}),
  getSetting: vi.fn(),
  seedDefaults: vi.fn(),
  setSetting: vi.fn(),
  listSettings: vi.fn(),
  resetSettings: vi.fn(),
}));

import app from "../src/app.js";

beforeEach(() => {
  vi.clearAllMocks();
  executeCallIndex = 0;
  executeResults = [];
  mockEmbed.mockResolvedValue(new Array(1024).fill(0.1));
});

const articleRow = {
  article_id: ARTICLE_ID,
  analysis_id: ANALYSIS_ID,
  title: "Scaling Managed Agents",
  link: "https://anthropic.com/research/scaling-managed-agents",
  feed_name: "Anthropic",
  published_at: new Date("2026-04-12T14:02:00Z"),
  score: 0.87,
  snippet: "A new approach to <b>scaling</b> <b>managed</b> <b>agents</b> in production.",
};

const semanticArticleRow = { ...articleRow, snippet: null };

const highlightRow = {
  highlight_id: HIGHLIGHT_ID,
  text: "Mixture-of-experts routing can be decoupled from the reasoning core.",
  note: "worth revisiting",
  created_at: new Date("2026-04-14T11:00:00Z"),
  article_id: ARTICLE_ID,
  analysis_id: ANALYSIS_ID,
  article_title: "Scaling Managed Agents",
  article_link: "https://anthropic.com/research/scaling-managed-agents",
  feed_name: "Anthropic",
  article_published_at: new Date("2026-04-12T14:02:00Z"),
  score: 0.72,
  snippet: "Mixture-of-experts <b>routing</b> can be decoupled from the reasoning core.",
};

// ───────────────────── validation / 400 ─────────────────────

describe("GET /search validation", () => {
  it("rejects missing q with 400", async () => {
    const res = await app.request("/search");
    expect(res.status).toBe(400);
  });

  it("rejects empty q with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=");
    expect(res.status).toBe(400);
  });

  it("rejects invalid mode with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&mode=bogus");
    expect(res.status).toBe(400);
  });

  it("rejects invalid target with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&target=bogus");
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range limit with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&limit=500");
    expect(res.status).toBe(400);
  });

  it("rejects negative offset with 400", async () => {
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&offset=-1");
    expect(res.status).toBe(400);
  });
});

// ───────────────────── mode / embed semantics ─────────────────────

describe("GET /search modes", () => {
  it("keyword mode does not embed the query", async () => {
    executeResults = [[articleRow], [highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&mode=keyword");
    expect(res.status).toBe(200);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("fuzzy mode does not embed the query", async () => {
    executeResults = [[articleRow], [highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&mode=fuzzy");
    expect(res.status).toBe(200);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("semantic mode embeds the query once", async () => {
    executeResults = [[articleRow], [highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&mode=semantic");
    expect(res.status).toBe(200);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockEmbed).toHaveBeenCalledWith("hello");
  });

  it("hybrid mode embeds the query once", async () => {
    executeResults = [[articleRow], [highlightRow], [highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&mode=hybrid");
    expect(res.status).toBe(200);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
  });

  it("default mode is hybrid (embed called when mode unset)", async () => {
    executeResults = [[articleRow], [highlightRow], [highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello");
    expect(res.status).toBe(200);
    expect(mockEmbed).toHaveBeenCalledTimes(1);
    const data = await res.json();
    expect(data.mode).toBe("hybrid");
  });
});

// ───────────────────── response shape ─────────────────────

describe("GET /search response shape", () => {
  it("returns wrapped shape with rows/total/limit/offset/query/mode", async () => {
    executeResults = [[articleRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=agents&mode=keyword&target=articles");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("rows");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("limit");
    expect(data).toHaveProperty("offset");
    expect(data.query).toBe("agents");
    expect(data.mode).toBe("keyword");
  });

  it("article rows have kind='article' and article fields", async () => {
    executeResults = [[articleRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=agents&mode=keyword&target=articles");
    const data = await res.json();
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].kind).toBe("article");
    expect(data.rows[0].matchedMode).toBe("keyword");
    expect(data.rows[0].article.analysisId).toBe(ANALYSIS_ID);
    expect(data.rows[0].article.articleId).toBe(ARTICLE_ID);
    expect(data.rows[0].article.title).toBe("Scaling Managed Agents");
    expect(typeof data.rows[0].article.publishedAt).toBe("string");
  });

  it("highlight rows have kind='highlight' with article context + highlight fields", async () => {
    executeResults = [[highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=routing&mode=keyword&target=highlights");
    const data = await res.json();
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].kind).toBe("highlight");
    expect(data.rows[0].article.title).toBe("Scaling Managed Agents");
    expect(data.rows[0].highlight.id).toBe(HIGHLIGHT_ID);
    expect(data.rows[0].highlight.text).toContain("routing");
    expect(data.rows[0].highlight.note).toBe("worth revisiting");
  });
});

// ───────────────────── target handling ─────────────────────

describe("GET /search target handling", () => {
  it("target=articles returns only article-kind rows", async () => {
    executeResults = [[articleRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=x&mode=keyword&target=articles");
    const data = await res.json();
    expect(data.rows.every((r: { kind: string }) => r.kind === "article")).toBe(true);
  });

  it("target=highlights returns only highlight-kind rows", async () => {
    executeResults = [[highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=x&mode=keyword&target=highlights");
    const data = await res.json();
    expect(data.rows.every((r: { kind: string }) => r.kind === "highlight")).toBe(true);
  });

  it("target=all merges article + highlight kinds, sorted by score desc", async () => {
    const higher = { ...articleRow, score: 0.95 };
    const lower = { ...highlightRow, score: 0.5 };
    executeResults = [[higher], [lower]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=x&mode=keyword&target=all");
    const data = await res.json();
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0].kind).toBe("article");
    expect(data.rows[0].score).toBeGreaterThan(data.rows[1].score);
    expect(data.rows[1].kind).toBe("highlight");
  });
});

// ───────────────────── degradation ─────────────────────

describe("GET /search snippets", () => {
  it("keyword mode returns snippet field on article results", async () => {
    executeResults = [[articleRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=agents&mode=keyword&target=articles");
    const data = await res.json();
    expect(data.rows[0].snippet).toContain("<b>scaling</b>");
  });

  it("keyword mode returns snippet field on highlight results", async () => {
    executeResults = [[highlightRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=routing&mode=keyword&target=highlights");
    const data = await res.json();
    expect(data.rows[0].snippet).toContain("<b>routing</b>");
  });

  it("semantic mode returns null snippet", async () => {
    executeResults = [[semanticArticleRow]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=agents&mode=semantic&target=articles");
    const data = await res.json();
    expect(data.rows[0].snippet).toBeNull();
  });
});

describe("GET /search degradation", () => {
  it("semantic mode returns empty rows when query embedding fails", async () => {
    mockEmbed.mockRejectedValueOnce(new Error("gateway down"));
    executeResults = [];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/search?q=hello&mode=semantic&target=all");
    expect(res.status).toBe(200);
    const data = await res.json();
    // The route falls through to empty result sets for semantic when
    // embedding fails — no 500, just a degraded response.
    expect(Array.isArray(data.rows)).toBe(true);
  });
});
