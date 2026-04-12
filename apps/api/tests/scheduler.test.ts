import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchAllFeeds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/services/analyze.js", () => ({
  analyzeUnanalyzed: vi.fn().mockResolvedValue({ analyzed: 0, errors: 0 }),
}));

vi.mock("../src/services/summarize.js", () => ({
  summarizeUnsummarized: vi.fn().mockResolvedValue({ summarized: 0, errors: 0 }),
}));

vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn((key: string) => {
    if (key === "scheduler_enabled") return Promise.resolve(true);
    if (key === "analyze_enabled") return Promise.resolve(true);
    if (key === "summarize_enabled") return Promise.resolve(true);
    if (key === "analyze_batch_size") return Promise.resolve(100);
    if (key === "summarize_batch_size") return Promise.resolve(100);
    return Promise.resolve(undefined);
  }),
}));

import { startScheduler, stopScheduler } from "../src/services/scheduler.js";

describe("scheduler", () => {
  afterEach(() => {
    stopScheduler();
  });

  it("starts and returns a scheduled task", () => {
    const task = startScheduler("* * * * *");
    expect(task).toBeDefined();
    expect(typeof task.stop).toBe("function");
  });

  it("stops cleanly without error", () => {
    startScheduler("* * * * *");
    expect(() => stopScheduler()).not.toThrow();
  });

  it("stopScheduler is safe to call when not started", () => {
    expect(() => stopScheduler()).not.toThrow();
  });
});
