import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFeeds = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Test Feed",
    url: "https://example.com/feed.xml",
    category: "news",
    enabled: true,
    authorityScore: 0.5,
    analyzeWeight: 0.5,
    lastFetchedAt: null,
    createdAt: new Date("2026-01-01"),
  },
];

let selectResult: unknown[] = [];
const mockReturning = vi.fn();

vi.mock("../src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => {
        const result = Promise.resolve(selectResult);
        return Object.assign(result, { where: () => selectResult });
      },
    }),
    insert: () => ({
      values: () => ({
        returning: () => mockReturning(),
        onConflictDoNothing: () => ({ returning: () => mockReturning() }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => mockReturning() }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  },
}));

vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchFeed: vi.fn().mockResolvedValue({ feedId: "1", feedName: "Test", added: 5 }),
  fetchAllFeeds: vi.fn().mockResolvedValue([{ feedId: "1", feedName: "Test", added: 5 }]),
}));

import app from "../src/app.js";

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = mockFeeds;
});

describe("GET /feeds", () => {
  it("returns list of feeds", async () => {
    const res = await app.request("/feeds");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("GET /feeds/:id", () => {
  it("returns a feed by id", async () => {
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000001");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Test Feed");
  });

  it("returns 404 for missing feed", async () => {
    selectResult = [];
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000099");
    expect(res.status).toBe(404);
  });
});

describe("POST /feeds", () => {
  it("creates a feed with valid data", async () => {
    mockReturning.mockReturnValueOnce([{ ...mockFeeds[0] }]);
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Feed", url: "https://example.com/rss" }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 400 for invalid data", async () => {
    const res = await app.request("/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /feeds/:id", () => {
  it("updates a feed", async () => {
    mockReturning.mockReturnValueOnce([{ ...mockFeeds[0], name: "Updated" }]);
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated");
  });

  it("returns 404 for missing feed", async () => {
    mockReturning.mockReturnValueOnce([]);
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000099", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /feeds/:id", () => {
  it("deletes a feed and its articles", async () => {
    selectResult = [{ id: mockFeeds[0].id }];
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000001", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
  });

  it("returns 404 for missing feed", async () => {
    selectResult = [];
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000099", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /feeds/:id/fetch", () => {
  it("triggers fetch for a single feed", async () => {
    const res = await app.request("/feeds/00000000-0000-0000-0000-000000000001/fetch", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.added).toBe(5);
  });
});

describe("POST /feeds/fetch", () => {
  it("triggers fetch for all feeds", async () => {
    const res = await app.request("/feeds/fetch", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
