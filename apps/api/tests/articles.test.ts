import { beforeEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/security/noSecrets: UUID constant
const ARTICLE_ID = "11111111-1111-1111-1111-111111111111";
// biome-ignore lint/security/noSecrets: UUID constant
const MISSING_ID = "99999999-9999-9999-9999-999999999999";

// Queue of results for sequential `db.select()` calls. Each SELECT returns
// the next queued array. `db.update().set().where().returning()` and
// `db.insert().values().returning()` consume from `mockReturning`.
let selectResults: unknown[][] = [];
let selectCallIndex = 0;
const mockReturning = vi.fn();

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
    insert: () => ({
      values: () => ({
        returning: () => mockReturning(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          const chain = {
            returning: () => mockReturning(),
          };
          return Object.assign(Promise.resolve(), chain);
        },
      }),
    }),
  },
}));

// feeds route imports feed-fetcher (via app.ts chain) so mock it too.
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

const interactionRow = {
  // biome-ignore lint/security/noSecrets: UUID constant
  id: "22222222-2222-2222-2222-222222222222",
  articleId: ARTICLE_ID,
  userId: null,
  viewedAt: new Date("2026-04-14T10:00:00Z"),
  readAt: null,
  starred: true,
  note: "interesting",
  userTags: ["roadmap"],
  followUp: false,
  readingSeconds: 120,
  createdAt: new Date("2026-04-14T09:00:00Z"),
  updatedAt: new Date("2026-04-14T10:00:00Z"),
};

describe("GET /articles/:id/interaction", () => {
  it("returns synthetic default when no interaction row exists", async () => {
    // 1st SELECT: article exists check
    // 2nd SELECT: findInteraction returns empty
    selectResults = [[{ id: ARTICLE_ID }], []];

    const res = await app.request(`/articles/${ARTICLE_ID}/interaction`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBeNull();
    expect(data.articleId).toBe(ARTICLE_ID);
    expect(data.starred).toBe(false);
    expect(data.userTags).toEqual([]);
    expect(data.readAt).toBeNull();
    expect(data.createdAt).toBeNull();
  });

  it("returns existing interaction when one exists", async () => {
    selectResults = [[{ id: ARTICLE_ID }], [interactionRow]];

    const res = await app.request(`/articles/${ARTICLE_ID}/interaction`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.starred).toBe(true);
    expect(data.note).toBe("interesting");
    expect(data.userTags).toEqual(["roadmap"]);
    expect(data.readingSeconds).toBe(120);
    expect(typeof data.viewedAt).toBe("string");
    expect(data.viewedAt).toContain("2026-04-14");
  });

  it("returns 404 when article not found", async () => {
    selectResults = [[]]; // article exists check returns empty

    const res = await app.request(`/articles/${MISSING_ID}/interaction`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /articles/:id/interaction", () => {
  it("creates a new interaction row when none exists", async () => {
    selectResults = [[{ id: ARTICLE_ID }], []];
    const created = { ...interactionRow, starred: true, note: null, userTags: [] };
    mockReturning.mockResolvedValueOnce([created]);

    const res = await app.request(`/articles/${ARTICLE_ID}/interaction`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: true }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.starred).toBe(true);
  });

  it("updates an existing interaction row", async () => {
    selectResults = [[{ id: ARTICLE_ID }], [interactionRow]];
    const updated = { ...interactionRow, starred: false };
    mockReturning.mockResolvedValueOnce([updated]);

    const res = await app.request(`/articles/${ARTICLE_ID}/interaction`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: false }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.starred).toBe(false);
  });

  it("translates read: true into a readAt timestamp", async () => {
    selectResults = [[{ id: ARTICLE_ID }], []];
    const created = {
      ...interactionRow,
      readAt: new Date("2026-04-14T11:00:00Z"),
      starred: false,
      note: null,
      userTags: [],
    };
    mockReturning.mockResolvedValueOnce([created]);

    const res = await app.request(`/articles/${ARTICLE_ID}/interaction`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.readAt).not.toBeNull();
    expect(data.readAt).toContain("2026-04-14");
  });

  it("rejects invalid body with 400", async () => {
    const res = await app.request(`/articles/${ARTICLE_ID}/interaction`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readingSeconds: -5 }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns 404 when article not found", async () => {
    selectResults = [[]]; // article exists check fails

    const res = await app.request(`/articles/${MISSING_ID}/interaction`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: true }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /articles/:id/interaction/view", () => {
  it("creates interaction with viewedAt when none exists", async () => {
    selectResults = [[{ id: ARTICLE_ID }], []];

    const res = await app.request(`/articles/${ARTICLE_ID}/interaction/view`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 404 when article not found", async () => {
    selectResults = [[]];

    const res = await app.request(`/articles/${MISSING_ID}/interaction/view`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
