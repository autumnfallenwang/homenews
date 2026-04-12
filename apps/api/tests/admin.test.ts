import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock services the admin route depends on
vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchFeed: vi.fn(),
  fetchAllFeeds: vi.fn(),
}));

vi.mock("../src/services/analyze.js", () => ({
  analyzeUnanalyzed: vi.fn(),
}));

vi.mock("../src/services/summarize.js", () => ({
  summarizeUnsummarized: vi.fn(),
}));

vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn(),
  getSettingsBatch: vi.fn().mockResolvedValue({}),
  seedDefaults: vi.fn(),
  setSetting: vi.fn(),
  listSettings: vi.fn(),
  resetSettings: vi.fn(),
}));

vi.mock("../src/db/index.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

import app from "../src/app.js";
import { analyzeUnanalyzed } from "../src/services/analyze.js";
import { fetchAllFeeds } from "../src/services/feed-fetcher.js";
import { getSetting } from "../src/services/settings.js";
import { summarizeUnsummarized } from "../src/services/summarize.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /admin/pipeline/fetch", () => {
  it("returns aggregated fetch results", async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValueOnce([
      { feedId: "1", feedName: "A", added: 5 },
      { feedId: "2", feedName: "B", added: 3, error: "oops" },
    ]);

    const res = await app.request("/admin/pipeline/fetch", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.feeds).toBe(2);
    expect(data.added).toBe(8);
    expect(data.errors).toBe(1);
    expect(Array.isArray(data.results)).toBe(true);
  });
});

describe("POST /admin/pipeline/analyze", () => {
  it("reads batch size from settings by default", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(50);
    vi.mocked(analyzeUnanalyzed).mockResolvedValueOnce({ analyzed: 42, errors: 0 });

    const res = await app.request("/admin/pipeline/analyze", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.analyzed).toBe(42);
    expect(data.errors).toBe(0);
    expect(data.limit).toBe(50);
    expect(analyzeUnanalyzed).toHaveBeenCalledWith(50);
    expect(getSetting).toHaveBeenCalledWith("analyze_batch_size");
  });

  it("uses ?limit= query param override", async () => {
    vi.mocked(analyzeUnanalyzed).mockResolvedValueOnce({ analyzed: 5, errors: 0 });

    const res = await app.request("/admin/pipeline/analyze?limit=5", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.limit).toBe(5);
    expect(analyzeUnanalyzed).toHaveBeenCalledWith(5);
    expect(getSetting).not.toHaveBeenCalled();
  });
});

describe("POST /admin/pipeline/summarize", () => {
  it("reads batch size from settings by default", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(100);
    vi.mocked(summarizeUnsummarized).mockResolvedValueOnce({ summarized: 20, errors: 0 });

    const res = await app.request("/admin/pipeline/summarize", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summarized).toBe(20);
    expect(data.limit).toBe(100);
    expect(summarizeUnsummarized).toHaveBeenCalledWith(100);
  });

  it("uses ?limit= query param override", async () => {
    vi.mocked(summarizeUnsummarized).mockResolvedValueOnce({ summarized: 3, errors: 0 });

    const res = await app.request("/admin/pipeline/summarize?limit=3", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.limit).toBe(3);
    expect(summarizeUnsummarized).toHaveBeenCalledWith(3);
  });
});

describe("POST /admin/pipeline/run-all", () => {
  it("calls fetch + analyze + summarize in sequence", async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValueOnce([{ feedId: "1", feedName: "A", added: 7 }]);
    vi.mocked(getSetting)
      .mockResolvedValueOnce(100) // analyze_batch_size
      .mockResolvedValueOnce(100); // summarize_batch_size
    vi.mocked(analyzeUnanalyzed).mockResolvedValueOnce({ analyzed: 7, errors: 0 });
    vi.mocked(summarizeUnsummarized).mockResolvedValueOnce({ summarized: 7, errors: 0 });

    const res = await app.request("/admin/pipeline/run-all", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fetch.feeds).toBe(1);
    expect(data.fetch.added).toBe(7);
    expect(data.analyze.analyzed).toBe(7);
    expect(data.summarize.summarized).toBe(7);

    expect(fetchAllFeeds).toHaveBeenCalled();
    expect(analyzeUnanalyzed).toHaveBeenCalledWith(100);
    expect(summarizeUnsummarized).toHaveBeenCalledWith(100);
  });
});
