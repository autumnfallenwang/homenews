import type { PipelineProgressEvent } from "@homenews/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---
// The orchestrator depends on four service modules + the db client. We mock
// all of them so the tests run without touching the dev DB or calling LLMs.

vi.mock("../src/services/feed-fetcher.js", () => ({
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
}));

// db mock — supports insert().values().returning() and update().set().where().returning()
// Captures writes in arrays for assertion.
const capturedInserts: Array<Record<string, unknown>> = [];
const capturedUpdates: Array<Record<string, unknown>> = [];

let fakeRunId = "00000000-0000-0000-0000-000000000001";
let fakeStartedAt = new Date("2026-04-14T00:00:00.000Z");

vi.mock("../src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          capturedInserts.push(v);
          return Promise.resolve([
            {
              id: fakeRunId,
              trigger: v.trigger,
              status: v.status,
              startedAt: fakeStartedAt,
              endedAt: null,
              durationMs: null,
              fetchAdded: null,
              fetchErrors: null,
              analyzeAnalyzed: null,
              analyzeErrors: null,
              summarizeSummarized: null,
              summarizeErrors: null,
              errorMessage: null,
            },
          ]);
        },
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            capturedUpdates.push(v);
            return Promise.resolve([
              {
                id: fakeRunId,
                trigger: "manual",
                status: v.status,
                startedAt: fakeStartedAt,
                endedAt: v.endedAt ?? null,
                durationMs: v.durationMs ?? null,
                fetchAdded: v.fetchAdded ?? null,
                fetchErrors: v.fetchErrors ?? null,
                analyzeAnalyzed: v.analyzeAnalyzed ?? null,
                analyzeErrors: v.analyzeErrors ?? null,
                summarizeSummarized: v.summarizeSummarized ?? null,
                summarizeErrors: v.summarizeErrors ?? null,
                errorMessage: v.errorMessage ?? null,
              },
            ]);
          },
        }),
      }),
    }),
  },
}));

import { analyzeUnanalyzed } from "../src/services/analyze.js";
import { fetchAllFeeds } from "../src/services/feed-fetcher.js";
import {
  getActiveRunId,
  isRunActive,
  PipelineBusyError,
  requestCancelActiveRun,
  runPipelineWithProgress,
} from "../src/services/pipeline.js";
import { getSetting } from "../src/services/settings.js";
import { summarizeUnsummarized } from "../src/services/summarize.js";

// Small helper so individual tests can stub setting lookups by key without
// writing `mockImplementation` boilerplate. Returning via Promise.resolve
// keeps the callback non-async (biome lint noAwaitInSync).
function mockSettings(settings: Record<string, unknown>) {
  vi.mocked(getSetting).mockImplementation((key: string) =>
    Promise.resolve(settings[key] as never),
  );
}

// Stub helpers — the services are responsible for emitting phase-start/done
// events (Task 41), so test doubles must relay those events through the
// onProgress callback to preserve event-order assertions.
function stubAnalyze(result: { analyzed: number; errors: number }) {
  vi.mocked(analyzeUnanalyzed).mockImplementationOnce((_limit, opts) => {
    const total = result.analyzed + result.errors;
    opts?.onProgress?.({ type: "analyze-start", total });
    opts?.onProgress?.({ type: "analyze-done", ...result });
    return Promise.resolve(result);
  });
}

function stubSummarize(result: { summarized: number; errors: number }) {
  vi.mocked(summarizeUnsummarized).mockImplementationOnce((_limit, opts) => {
    const total = result.summarized + result.errors;
    opts?.onProgress?.({ type: "summarize-start", total });
    opts?.onProgress?.({ type: "summarize-done", ...result });
    return Promise.resolve(result);
  });
}

// Reasonable defaults: both phases enabled, batch size 100, fetch returns
// nothing, analyze/summarize return zero counts. Individual tests override
// via mockResolvedValueOnce or stubAnalyze/stubSummarize for event-order tests.
function happyPathDefaults() {
  mockSettings({
    analyze_enabled: true,
    summarize_enabled: true,
    analyze_batch_size: 100,
    summarize_batch_size: 100,
  });
  vi.mocked(fetchAllFeeds).mockResolvedValue([]);
  vi.mocked(analyzeUnanalyzed).mockImplementation((_limit, opts) => {
    opts?.onProgress?.({ type: "analyze-start", total: 0 });
    opts?.onProgress?.({ type: "analyze-done", analyzed: 0, errors: 0 });
    return Promise.resolve({ analyzed: 0, errors: 0 });
  });
  vi.mocked(summarizeUnsummarized).mockImplementation((_limit, opts) => {
    opts?.onProgress?.({ type: "summarize-start", total: 0 });
    opts?.onProgress?.({ type: "summarize-done", summarized: 0, errors: 0 });
    return Promise.resolve({ summarized: 0, errors: 0 });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedInserts.length = 0;
  capturedUpdates.length = 0;
  fakeRunId = `00000000-0000-0000-0000-${Math.random().toString(16).slice(2, 14).padStart(12, "0")}`;
  fakeStartedAt = new Date("2026-04-14T00:00:00.000Z");
  happyPathDefaults();
});

describe("runPipelineWithProgress — happy path", () => {
  it("emits events in the correct phase order for a successful manual run", async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValueOnce([
      { feedId: "1", feedName: "A", added: 5 },
      { feedId: "2", feedName: "B", added: 3 },
    ]);
    stubAnalyze({ analyzed: 7, errors: 1 });
    stubSummarize({ summarized: 6, errors: 0 });

    const events: PipelineProgressEvent[] = [];
    await runPipelineWithProgress("manual", (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "fetch-start",
      "fetch-done",
      "analyze-start",
      "analyze-done",
      "summarize-start",
      "summarize-done",
      "run-done",
    ]);
  });

  it("returns a PipelineRun with status=completed and correct counts", async () => {
    vi.mocked(fetchAllFeeds).mockResolvedValueOnce([
      { feedId: "1", feedName: "A", added: 10 },
      { feedId: "2", feedName: "B", added: 3, error: "oops" },
    ]);
    vi.mocked(analyzeUnanalyzed).mockResolvedValueOnce({ analyzed: 42, errors: 0 });
    vi.mocked(summarizeUnsummarized).mockResolvedValueOnce({ summarized: 40, errors: 2 });

    const result = await runPipelineWithProgress("manual");

    expect(result.status).toBe("completed");
    expect(result.trigger).toBe("manual");
    expect(result.fetchAdded).toBe(13);
    expect(result.fetchErrors).toBe(1);
    expect(result.analyzeAnalyzed).toBe(42);
    expect(result.analyzeErrors).toBe(0);
    expect(result.summarizeSummarized).toBe(40);
    expect(result.summarizeErrors).toBe(2);
    expect(result.errorMessage).toBeNull();
  });

  it("inserts a start row and updates with a final row", async () => {
    await runPipelineWithProgress("manual");

    expect(capturedInserts).toHaveLength(1);
    expect(capturedInserts[0]).toMatchObject({ trigger: "manual", status: "running" });

    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0]).toMatchObject({
      status: "completed",
      fetchAdded: 0,
      fetchErrors: 0,
      analyzeAnalyzed: 0,
      analyzeErrors: 0,
      summarizeSummarized: 0,
      summarizeErrors: 0,
      errorMessage: null,
    });
    expect(capturedUpdates[0].durationMs).toEqual(expect.any(Number));
    expect(capturedUpdates[0].endedAt).toBeInstanceOf(Date);
  });
});

describe("runPipelineWithProgress — singleton enforcement", () => {
  it("throws PipelineBusyError if called while another run is active", async () => {
    // Hold fetch with a pending promise so the first run stays in-flight.
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    vi.mocked(fetchAllFeeds).mockImplementationOnce(async () => {
      await pending;
      return [];
    });

    const first = runPipelineWithProgress("manual");

    // Give the first run a microtask to reach the fetch phase.
    await Promise.resolve();
    await Promise.resolve();

    await expect(runPipelineWithProgress("manual")).rejects.toThrow(PipelineBusyError);

    release();
    await first;
  });

  it("PipelineBusyError exposes the active runId", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => {
      release = r;
    });
    vi.mocked(fetchAllFeeds).mockImplementationOnce(async () => {
      await pending;
      return [];
    });

    const first = runPipelineWithProgress("manual");
    await Promise.resolve();
    await Promise.resolve();

    const activeId = getActiveRunId();
    expect(activeId).not.toBeNull();

    try {
      await runPipelineWithProgress("manual");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineBusyError);
      expect((err as PipelineBusyError).activeRunId).toBe(activeId);
    }

    release();
    await first;
  });
});

describe("runPipelineWithProgress — phase toggles", () => {
  it("skips analyze phase when analyze_enabled=false", async () => {
    mockSettings({
      analyze_enabled: false,
      summarize_enabled: true,
      summarize_batch_size: 100,
    });

    const events: PipelineProgressEvent[] = [];
    const result = await runPipelineWithProgress("manual", (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "fetch-start",
      "fetch-done",
      "summarize-start",
      "summarize-done",
      "run-done",
    ]);
    expect(result.analyzeAnalyzed).toBeNull();
    expect(result.analyzeErrors).toBeNull();
    expect(analyzeUnanalyzed).not.toHaveBeenCalled();
  });

  it("skips summarize phase when summarize_enabled=false", async () => {
    mockSettings({
      analyze_enabled: true,
      summarize_enabled: false,
      analyze_batch_size: 100,
    });

    const events: PipelineProgressEvent[] = [];
    const result = await runPipelineWithProgress("manual", (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "fetch-start",
      "fetch-done",
      "analyze-start",
      "analyze-done",
      "run-done",
    ]);
    expect(result.summarizeSummarized).toBeNull();
    expect(result.summarizeErrors).toBeNull();
    expect(summarizeUnsummarized).not.toHaveBeenCalled();
  });

  it("completes successfully when both phases are disabled", async () => {
    mockSettings({ analyze_enabled: false, summarize_enabled: false });

    const result = await runPipelineWithProgress("manual");

    expect(result.status).toBe("completed");
    expect(result.analyzeAnalyzed).toBeNull();
    expect(result.summarizeSummarized).toBeNull();
  });
});

describe("runPipelineWithProgress — cancellation", () => {
  it("marks the run cancelled when requestCancelActiveRun is called during fetch", async () => {
    vi.mocked(fetchAllFeeds).mockImplementationOnce(() => {
      // Flag cancel while the fetch phase is "in progress"
      const runId = getActiveRunId();
      if (runId === null) throw new Error("expected an active run");
      requestCancelActiveRun(runId);
      return Promise.resolve([{ feedId: "1", feedName: "A", added: 4 }]);
    });

    const events: PipelineProgressEvent[] = [];
    const result = await runPipelineWithProgress("manual", (e) => events.push(e));

    expect(result.status).toBe("cancelled");
    // Fetch counts should be preserved — that phase completed
    expect(result.fetchAdded).toBe(4);
    expect(result.fetchErrors).toBe(0);
    // Analyze + summarize should NOT have run
    expect(result.analyzeAnalyzed).toBeNull();
    expect(result.summarizeSummarized).toBeNull();
    expect(analyzeUnanalyzed).not.toHaveBeenCalled();
    expect(summarizeUnsummarized).not.toHaveBeenCalled();
    // Events should skip analyze/summarize phases
    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "fetch-start",
      "fetch-done",
      "run-done",
    ]);
  });

  it("returns false when requestCancelActiveRun is called with an unknown id", () => {
    expect(requestCancelActiveRun("nonexistent-id")).toBe(false);
  });
});

describe("runPipelineWithProgress — error handling", () => {
  it("marks the run failed when fetch throws", async () => {
    vi.mocked(fetchAllFeeds).mockRejectedValueOnce(new Error("network down"));

    const events: PipelineProgressEvent[] = [];
    const result = await runPipelineWithProgress("manual", (e) => events.push(e));

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("network down");
    expect(events.at(-1)).toMatchObject({
      type: "run-done",
      status: "failed",
      errorMessage: "network down",
    });
  });

  it("marks the run failed when analyze throws", async () => {
    vi.mocked(analyzeUnanalyzed).mockRejectedValueOnce(new Error("LLM timeout"));

    const result = await runPipelineWithProgress("manual");

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("LLM timeout");
    // Fetch counts should still be recorded since that phase completed
    expect(result.fetchAdded).toBe(0);
  });
});

// biome-ignore-start lint/security/noSecrets: test names contain identifiers that trip the entropy heuristic
describe("runPipelineWithProgress — active run lifecycle", () => {
  it("getActiveRunId returns null when no run is active", () => {
    expect(getActiveRunId()).toBeNull();
  });

  it("getActiveRunId returns the current runId during a run, null after", async () => {
    let observedDuringRun: string | null = null;
    vi.mocked(fetchAllFeeds).mockImplementationOnce(() => {
      observedDuringRun = getActiveRunId();
      return Promise.resolve([]);
    });

    await runPipelineWithProgress("manual");

    expect(observedDuringRun).not.toBeNull();
    expect(typeof observedDuringRun).toBe("string");
    expect(getActiveRunId()).toBeNull();
  });

  it("isRunActive tracks the active run", async () => {
    let observed = false;
    vi.mocked(fetchAllFeeds).mockImplementationOnce(() => {
      const runId = getActiveRunId();
      if (runId === null) throw new Error("expected an active run");
      observed = isRunActive(runId);
      return Promise.resolve([]);
    });

    await runPipelineWithProgress("manual");

    expect(observed).toBe(true);
  });

  it("cleans up the registry on error", async () => {
    vi.mocked(fetchAllFeeds).mockRejectedValueOnce(new Error("boom"));
    await runPipelineWithProgress("manual");
    expect(getActiveRunId()).toBeNull();
  });
});
// biome-ignore-end lint/security/noSecrets: test names contain identifiers that trip the entropy heuristic

describe("runPipelineWithProgress — per-article event threading (Task 48)", () => {
  it("emits full event sequence including per-article items in correct order", async () => {
    vi.mocked(analyzeUnanalyzed).mockImplementationOnce(async (_limit, opts) => {
      await opts?.onProgress?.({ type: "analyze-start", total: 3 });
      for (let i = 0; i < 3; i++) {
        await opts?.onProgress?.({
          type: "analyze-item",
          index: i,
          total: 3,
          title: `Article ${i}`,
          feedName: "Feed A",
        });
      }
      await opts?.onProgress?.({ type: "analyze-done", analyzed: 3, errors: 0 });
      return { analyzed: 3, errors: 0 };
    });

    vi.mocked(summarizeUnsummarized).mockImplementationOnce(async (_limit, opts) => {
      await opts?.onProgress?.({ type: "summarize-start", total: 2 });
      for (let i = 0; i < 2; i++) {
        await opts?.onProgress?.({
          type: "summarize-item",
          index: i,
          total: 2,
          title: `Article ${i}`,
          feedName: "Feed B",
        });
      }
      await opts?.onProgress?.({ type: "summarize-done", summarized: 2, errors: 0 });
      return { summarized: 2, errors: 0 };
    });

    const events: PipelineProgressEvent[] = [];
    await runPipelineWithProgress("manual", (e) => events.push(e));

    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "fetch-start",
      "fetch-done",
      "analyze-start",
      "analyze-item",
      "analyze-item",
      "analyze-item",
      "analyze-done",
      "summarize-start",
      "summarize-item",
      "summarize-item",
      "summarize-done",
      "run-done",
    ]);
  });

  it("preserves event ordering with an async onProgress callback", async () => {
    const events: PipelineProgressEvent[] = [];
    const onProgress = async (e: PipelineProgressEvent) => {
      // Introduce a microtask hop to prove the orchestrator awaits each call.
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push(e);
    };

    await runPipelineWithProgress("manual", onProgress);

    expect(events.map((e) => e.type)).toEqual([
      "run-start",
      "fetch-start",
      "fetch-done",
      "analyze-start",
      "analyze-done",
      "summarize-start",
      "summarize-done",
      "run-done",
    ]);
  });

  it("cancellation mid-analyze skips the summarize phase", async () => {
    vi.mocked(analyzeUnanalyzed).mockImplementationOnce(async (_limit, opts) => {
      await opts?.onProgress?.({ type: "analyze-start", total: 3 });
      await opts?.onProgress?.({
        type: "analyze-item",
        index: 0,
        total: 3,
        title: "A",
        feedName: "F",
      });
      // User clicks Cancel while the first article is being analyzed.
      const runId = getActiveRunId();
      if (runId === null) throw new Error("expected an active run");
      requestCancelActiveRun(runId);
      // Real service would break its loop and return partial counts.
      await opts?.onProgress?.({ type: "analyze-done", analyzed: 1, errors: 0 });
      return { analyzed: 1, errors: 0 };
    });

    const result = await runPipelineWithProgress("manual");

    expect(result.status).toBe("cancelled");
    expect(result.analyzeAnalyzed).toBe(1);
    expect(summarizeUnsummarized).not.toHaveBeenCalled();
    expect(result.summarizeSummarized).toBeNull();
  });

  it("cancellation mid-summarize marks the run cancelled (post-summarize check)", async () => {
    vi.mocked(summarizeUnsummarized).mockImplementationOnce(async (_limit, opts) => {
      await opts?.onProgress?.({ type: "summarize-start", total: 3 });
      await opts?.onProgress?.({
        type: "summarize-item",
        index: 0,
        total: 3,
        title: "A",
        feedName: "F",
      });
      // Cancel flips after the first summarize item.
      const runId = getActiveRunId();
      if (runId === null) throw new Error("expected an active run");
      requestCancelActiveRun(runId);
      // Real service would break its loop and return partial counts.
      await opts?.onProgress?.({ type: "summarize-done", summarized: 1, errors: 0 });
      return { summarized: 1, errors: 0 };
    });

    const result = await runPipelineWithProgress("manual");

    // Without the post-summarize cancel check in pipeline.ts, this assertion
    // would fail with status === "completed". After the fix it passes.
    expect(result.status).toBe("cancelled");
    expect(result.summarizeSummarized).toBe(1);
  });
});
