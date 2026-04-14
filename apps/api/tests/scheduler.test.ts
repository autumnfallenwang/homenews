import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` calls are hoisted above regular top-level code, so the stand-in
// `PipelineBusyError` class must be defined inside the factory (or via
// `vi.hoisted`). We use `vi.hoisted` so the class reference is shared
// between the mock and the individual test assertions.
const { MockPipelineBusyError } = vi.hoisted(() => {
  class MockPipelineBusyError extends Error {
    constructor(public readonly activeRunId: string) {
      super(`Pipeline is already running (runId=${activeRunId})`);
      this.name = "PipelineBusyError";
    }
  }
  return { MockPipelineBusyError };
});

vi.mock("../src/services/pipeline.js", () => ({
  runPipelineWithProgress: vi.fn(),
  PipelineBusyError: MockPipelineBusyError,
}));

vi.mock("../src/services/settings.js", () => ({
  getSetting: vi.fn((key: string) => {
    if (key === "scheduler_enabled") return Promise.resolve(true);
    return Promise.resolve(undefined);
  }),
}));

import { runPipelineWithProgress } from "../src/services/pipeline.js";
import { runSchedulerTick, startScheduler, stopScheduler } from "../src/services/scheduler.js";
import { getSetting } from "../src/services/settings.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: scheduler_enabled=true unless overridden
  vi.mocked(getSetting).mockImplementation((key: string) => {
    if (key === "scheduler_enabled") return Promise.resolve(true as never);
    return Promise.resolve(undefined as never);
  });
});

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

describe("runSchedulerTick", () => {
  it("calls runPipelineWithProgress when scheduler is enabled", async () => {
    vi.mocked(runPipelineWithProgress).mockResolvedValueOnce({
      id: "run-1",
      trigger: "scheduler",
      status: "completed",
      startedAt: "2026-04-14T00:00:00.000Z",
      endedAt: "2026-04-14T00:05:00.000Z",
      durationMs: 300000,
      fetchAdded: 5,
      fetchErrors: 0,
      analyzeAnalyzed: 5,
      analyzeErrors: 0,
      summarizeSummarized: 5,
      summarizeErrors: 0,
      errorMessage: null,
    });

    await runSchedulerTick();

    expect(runPipelineWithProgress).toHaveBeenCalledTimes(1);
    expect(runPipelineWithProgress).toHaveBeenCalledWith("scheduler");
  });

  it("skips the pipeline when scheduler_enabled=false", async () => {
    vi.mocked(getSetting).mockImplementationOnce((key: string) => {
      if (key === "scheduler_enabled") return Promise.resolve(false as never);
      return Promise.resolve(undefined as never);
    });

    await runSchedulerTick();

    expect(runPipelineWithProgress).not.toHaveBeenCalled();
  });

  it("handles PipelineBusyError gracefully without rethrowing", async () => {
    vi.mocked(runPipelineWithProgress).mockRejectedValueOnce(
      new MockPipelineBusyError("other-run-id"),
    );

    // Should resolve (not throw), logging a warning internally.
    await expect(runSchedulerTick()).resolves.toBeUndefined();
  });

  it("handles unexpected errors without throwing", async () => {
    vi.mocked(runPipelineWithProgress).mockRejectedValueOnce(new Error("database connection lost"));

    await expect(runSchedulerTick()).resolves.toBeUndefined();
  });
});
