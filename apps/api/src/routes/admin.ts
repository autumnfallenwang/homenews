import type { PipelineRun } from "@homenews/shared";
import { and, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/index.js";
import { pipelineRuns } from "../db/schema.js";
import { getNextScheduledRunAt } from "../services/cron-next.js";
import {
  getActiveRunId,
  mapPipelineRunRow,
  requestCancelActiveRun,
  runPipelineWithProgress,
} from "../services/pipeline.js";

const app = new Hono();

/**
 * Server-Sent Events stream — starts a new manual pipeline run and pushes
 * per-phase + per-article progress events as they happen. EventSource
 * convention requires GET. Singleton-enforced: returns 409 if a run is
 * already in progress (the client should poll `/status` until it finishes).
 */
app.get("/pipeline/stream", (c) => {
  const activeId = getActiveRunId();
  if (activeId !== null) {
    return c.json({ error: "Pipeline already running", activeRunId: activeId }, 409);
  }

  return streamSSE(c, async (stream) => {
    try {
      await runPipelineWithProgress("manual", async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      });
    } catch (err) {
      // Unlikely: the orchestrator normally catches pipeline-internal
      // errors and records them as `failed` in pipeline_runs. This branch
      // is for truly unexpected failures (DB drop, etc.).
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  });
});

/** Request cancellation of the currently-active run. 404 if no run matches. */
app.post("/pipeline/runs/:id/cancel", (c) => {
  const id = c.req.param("id");
  const cancelled = requestCancelActiveRun(id);
  if (!cancelled) {
    return c.json({ error: "No active run with that id", runId: id }, 404);
  }
  return c.json({ ok: true, runId: id });
});

/**
 * List recent pipeline runs. Supports `limit` (default 20, clamped 1-100)
 * and `trigger` (manual|scheduler). History spans both manual and cron runs.
 */
app.get("/pipeline/runs", async (c) => {
  const limitRaw = Number(c.req.query("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;

  const triggerParam = c.req.query("trigger");
  const where =
    triggerParam === "manual" || triggerParam === "scheduler"
      ? eq(pipelineRuns.trigger, triggerParam)
      : undefined;

  const rows = await db
    .select()
    .from(pipelineRuns)
    .where(where)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);

  return c.json(rows.map(mapPipelineRunRow));
});

/**
 * Pipeline status snapshot: currently-active run (if any) and the next
 * scheduled fire time computed from the `fetch_interval` cron expression.
 * Called on frontend mount and on window focus — the countdown ticks
 * locally from the returned `nextRunAt` to avoid clock drift.
 */
app.get("/pipeline/status", async (c) => {
  const activeId = getActiveRunId();
  let activeRun: PipelineRun | null = null;

  if (activeId !== null) {
    const [row] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, activeId))
      .limit(1);
    if (row) activeRun = mapPipelineRunRow(row);
  }

  // Most recent finished run (excluding any currently-running row). Powers
  // the idle view's "last run 23m ago · fetched 41 · ..." summary.
  const [lastRow] = await db
    .select()
    .from(pipelineRuns)
    .where(
      activeId === null
        ? ne(pipelineRuns.status, "running")
        : and(ne(pipelineRuns.status, "running"), ne(pipelineRuns.id, activeId)),
    )
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);
  const lastRun = lastRow ? mapPipelineRunRow(lastRow) : null;

  const nextRun = await getNextScheduledRunAt();

  return c.json({
    activeRun,
    lastRun,
    nextRunAt: nextRun?.toISOString() ?? null,
  });
});

export default app;
