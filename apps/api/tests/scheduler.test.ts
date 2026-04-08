import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/feed-fetcher.js", () => ({
  fetchAllFeeds: vi.fn().mockResolvedValue([]),
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
