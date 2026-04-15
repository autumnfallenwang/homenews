import { beforeEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/security/noSecrets: UUID constant
const HIGHLIGHT_ID = "33333333-3333-3333-3333-333333333333";
// biome-ignore lint/security/noSecrets: UUID constant
const MISSING_ID = "99999999-9999-9999-9999-999999999999";

let selectResults: unknown[][] = [];
let selectCallIndex = 0;
const mockDeleteWhere = vi.fn();

function makeChain(result: unknown[]) {
  const promise = Promise.resolve(result);
  const methods = ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset"];
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
    delete: () => ({
      where: () => {
        mockDeleteWhere();
        return Promise.resolve();
      },
    }),
    // Stubs for other methods in case app.ts imports pull them in via
    // other routes. Tests here only exercise select + delete.
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
  },
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
  selectCallIndex = 0;
  selectResults = [];
});

// biome-ignore lint/security/noSecrets: UUID constant
const ARTICLE_ID = "11111111-1111-1111-1111-111111111111";
// biome-ignore lint/security/noSecrets: UUID constant
const ANALYSIS_ID = "22222222-2222-2222-2222-222222222222";

const mockJoinRow = {
  id: HIGHLIGHT_ID,
  articleId: ARTICLE_ID,
  text: "Mixture-of-experts routing can be decoupled from the reasoning core.",
  note: "worth revisiting",
  createdAt: new Date("2026-04-14T11:00:00Z"),
  analysisId: ANALYSIS_ID,
  articleTitle: "Scaling Managed Agents",
  articleLink: "https://anthropic.com/research/scaling-managed-agents",
  articlePublishedAt: new Date("2026-04-12T14:02:00Z"),
  feedName: "Anthropic",
};

describe("GET /highlights", () => {
  it("returns empty list when no highlights exist", async () => {
    selectResults = [[]];

    const res = await app.request("/highlights");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns highlights with joined article metadata", async () => {
    selectResults = [[mockJoinRow]];

    const res = await app.request("/highlights");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(HIGHLIGHT_ID);
    expect(data[0].text).toContain("routing");
    expect(data[0].note).toBe("worth revisiting");
    expect(data[0].article.analysisId).toBe(ANALYSIS_ID);
    expect(data[0].article.title).toBe("Scaling Managed Agents");
    expect(data[0].article.feedName).toBe("Anthropic");
    expect(typeof data[0].createdAt).toBe("string");
    expect(data[0].createdAt).toContain("2026-04-14");
  });

  it("clamps out-of-range limit without 400", async () => {
    selectResults = [[]];
    // biome-ignore lint/security/noSecrets: URL, not a secret
    const res = await app.request("/highlights?limit=99999");
    // Should not 400 — limit clamped internally to 200.
    expect(res.status).toBe(200);
  });
});

describe("DELETE /highlights/:id", () => {
  it("removes an existing highlight", async () => {
    selectResults = [[{ id: HIGHLIGHT_ID }]];

    const res = await app.request(`/highlights/${HIGHLIGHT_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the highlight does not exist", async () => {
    selectResults = [[]];

    const res = await app.request(`/highlights/${MISSING_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });
});
