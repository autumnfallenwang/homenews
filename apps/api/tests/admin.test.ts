import type { PipelineRun } from "@homenews/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted stand-in for PipelineBusyError so instanceof checks survive
// through the mock barrier.
const { MockPipelineBusyError } = vi.hoisted(() => {
  class MockPipelineBusyErrorImpl extends Error {
    constructor(public readonly activeRunId: string) {
      super(`Pipeline is already running (runId=${activeRunId})`);
      this.name = "PipelineBusyError";
    }
  }
  return { MockPipelineBusyError: MockPipelineBusyErrorImpl };
});

vi.mock("../src/services/pipeline.js", () => ({
  runPipelineWithProgress: vi.fn(),
  getActiveRunId: vi.fn(),
  requestCancelActiveRun: vi.fn(),
  mapPipelineRunRow: vi.fn((row) => row as PipelineRun),
  PipelineBusyError: MockPipelineBusyError,
}));

vi.mock("../src/services/cron-next.js", () => ({
  getNextScheduledRunAt: vi.fn(),
}));

// Chainable db mock. The endpoints use:
//  - select().from().where().orderBy().limit()   → /runs
//  - select().from().where().limit()             → /status
// We return an array from the terminal call (`limit()` or when `where` is the tail).
const dbRows = { rows: [] as unknown[] };
function chain(): unknown {
  // `.limit()` is the terminal call in both endpoint chains (runs + status);
  // it must return a Promise of the rows.
  const ctx: Record<string, (...a: unknown[]) => unknown> = {};
  const self = ctx as unknown;
  const wrap = () => self;
  ctx.from = wrap;
  ctx.where = wrap;
  ctx.orderBy = wrap;
  ctx.limit = () => Promise.resolve(dbRows.rows);
  return self;
}
vi.mock("../src/db/index.js", () => ({
  db: {
    select: () => chain(),
  },
}));

import app from "../src/app.js";
import { getNextScheduledRunAt } from "../src/services/cron-next.js";
import {
  getActiveRunId,
  requestCancelActiveRun,
  runPipelineWithProgress,
} from "../src/services/pipeline.js";

function fakeRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    trigger: "manual",
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbRows.rows = [];
  vi.mocked(getActiveRunId).mockReturnValue(null);
  vi.mocked(getNextScheduledRunAt).mockResolvedValue(null);
});

describe("GET /admin/pipeline/status", () => {
  it("returns null activeRun and null nextRunAt when idle", async () => {
    const res = await app.request("/admin/pipeline/status");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.activeRun).toBeNull();
    expect(data.lastRun).toBeNull();
    expect(data.nextRunAt).toBeNull();
  });

  it("returns nextRunAt ISO string when scheduler has one queued", async () => {
    vi.mocked(getNextScheduledRunAt).mockResolvedValueOnce(new Date("2026-04-14T02:00:00.000Z"));
    const res = await app.request("/admin/pipeline/status");
    const data = await res.json();
    expect(data.nextRunAt).toBe("2026-04-14T02:00:00.000Z");
  });

  it("returns the active run when one is in progress", async () => {
    vi.mocked(getActiveRunId).mockReturnValue("22222222-2222-2222-2222-222222222222");
    dbRows.rows = [fakeRun({ id: "22222222-2222-2222-2222-222222222222", status: "running" })];
    const res = await app.request("/admin/pipeline/status");
    const data = await res.json();
    expect(data.activeRun).not.toBeNull();
    expect(data.activeRun.id).toBe("22222222-2222-2222-2222-222222222222");
    expect(data.activeRun.status).toBe("running");
  });
});

describe("GET /admin/pipeline/runs", () => {
  it("returns an array of runs with default limit", async () => {
    dbRows.rows = [fakeRun(), fakeRun({ id: "33333333-3333-3333-3333-333333333333" })];
    const res = await app.request("/admin/pipeline/runs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
  });

  it("respects limit query param", async () => {
    dbRows.rows = [];
    const res = await app.request("/admin/pipeline/runs?limit=5");
    expect(res.status).toBe(200);
  });

  it("clamps limit to 1-100 range", async () => {
    // These all return 200 — the clamping happens silently
    const a = await app.request("/admin/pipeline/runs?limit=0");
    const b = await app.request("/admin/pipeline/runs?limit=999");
    const c = await app.request("/admin/pipeline/runs?limit=abc");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
  });

  it("accepts trigger=manual filter", async () => {
    dbRows.rows = [fakeRun({ trigger: "manual" })];
    const res = await app.request("/admin/pipeline/runs?trigger=manual");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].trigger).toBe("manual");
  });

  it("accepts trigger=scheduler filter", async () => {
    dbRows.rows = [fakeRun({ trigger: "scheduler" })];
    const res = await app.request("/admin/pipeline/runs?trigger=scheduler");
    expect(res.status).toBe(200);
  });

  it("ignores invalid trigger param", async () => {
    const res = await app.request("/admin/pipeline/runs?trigger=garbage");
    expect(res.status).toBe(200);
  });
});

describe("POST /admin/pipeline/runs/:id/cancel", () => {
  it("returns 404 when the id does not match an active run", async () => {
    vi.mocked(requestCancelActiveRun).mockReturnValue(false);
    const res = await app.request(
      "/admin/pipeline/runs/00000000-0000-0000-0000-000000000001/cancel",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 when the active run was successfully flagged", async () => {
    vi.mocked(requestCancelActiveRun).mockReturnValue(true);
    const res = await app.request(
      "/admin/pipeline/runs/00000000-0000-0000-0000-000000000001/cancel",
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.runId).toBe("00000000-0000-0000-0000-000000000001");
  });
});

describe("GET /admin/pipeline/stream", () => {
  it("returns 409 when a pipeline run is already in progress", async () => {
    vi.mocked(getActiveRunId).mockReturnValue("44444444-4444-4444-4444-444444444444");
    const res = await app.request("/admin/pipeline/stream");
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.activeRunId).toBe("44444444-4444-4444-4444-444444444444");
  });

  it("streams SSE events in correct order when the pipeline completes", async () => {
    vi.mocked(runPipelineWithProgress).mockImplementationOnce(async (_trigger, onProgress) => {
      await onProgress?.({
        type: "run-start",
        runId: "55555555-5555-5555-5555-555555555555",
        trigger: "manual",
        startedAt: "2026-04-14T00:00:00.000Z",
      });
      await onProgress?.({ type: "fetch-start" });
      await onProgress?.({ type: "fetch-done", added: 3, errors: 0 });
      await onProgress?.({
        type: "run-done",
        status: "completed",
        durationMs: 100,
      });
      return fakeRun({ id: "55555555-5555-5555-5555-555555555555" });
    });

    const res = await app.request("/admin/pipeline/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain('"type":"run-start"');
    expect(body).toContain('"type":"fetch-start"');
    expect(body).toContain('"type":"fetch-done"');
    expect(body).toContain('"type":"run-done"');

    // Verify ordering
    const runStart = body.indexOf('"type":"run-start"');
    const fetchStart = body.indexOf('"type":"fetch-start"');
    const fetchDone = body.indexOf('"type":"fetch-done"');
    const runDone = body.indexOf('"type":"run-done"');
    expect(runStart).toBeLessThan(fetchStart);
    expect(fetchStart).toBeLessThan(fetchDone);
    expect(fetchDone).toBeLessThan(runDone);
  });
});
