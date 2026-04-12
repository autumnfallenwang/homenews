import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the settings service directly — route tests verify wiring, not DB logic
vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn(),
  listSettings: vi.fn(),
  setSetting: vi.fn(),
  resetSettings: vi.fn(),
  seedDefaults: vi.fn().mockResolvedValue({ seeded: 0 }),
  getSettingsBatch: vi.fn(),
}));

// Mock feed-fetcher since app.ts pulls in routes that import services
vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchFeed: vi.fn(),
  fetchAllFeeds: vi.fn(),
}));

vi.mock("../src/db/index.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

import app from "../src/app.js";
import { getSetting, listSettings, resetSettings, setSetting } from "../src/services/settings.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /settings", () => {
  it("returns list of settings with defaults filled in", async () => {
    vi.mocked(listSettings).mockResolvedValueOnce([]);
    const res = await app.request("/settings");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    // Should include defaults even when listSettings returns empty
    expect(data.length).toBeGreaterThan(0);
    expect(data.some((s: { key: string }) => s.key === "weight_relevance")).toBe(true);
  });
});

describe("GET /settings/:key", () => {
  it("returns a single setting value", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(0.42);
    const res = await app.request("/settings/weight_relevance");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBe("weight_relevance");
    expect(data.value).toBe(0.42);
    expect(data.valueType).toBe("number");
  });

  it("returns 404 for unknown key", async () => {
    vi.mocked(getSetting).mockRejectedValueOnce(new Error("Unknown setting key: foo"));
    const res = await app.request("/settings/unknown_key");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /settings/:key", () => {
  it("updates a setting", async () => {
    vi.mocked(setSetting).mockResolvedValueOnce();
    vi.mocked(getSetting).mockResolvedValueOnce(0.5);

    const res = await app.request("/settings/weight_relevance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 0.5 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.value).toBe(0.5);
    expect(setSetting).toHaveBeenCalledWith("weight_relevance", 0.5, undefined, undefined);
  });

  it("returns 400 for invalid body", async () => {
    const res = await app.request("/settings/weight_relevance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notValue: "bogus" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /settings/reset", () => {
  it("resets settings to defaults", async () => {
    vi.mocked(resetSettings).mockResolvedValueOnce({ reset: 14 });
    const res = await app.request("/settings/reset", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reset).toBe(14);
  });
});
