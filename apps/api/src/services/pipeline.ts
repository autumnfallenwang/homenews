import type {
  PipelineProgressEvent,
  PipelineRun,
  PipelineRunStatus,
  PipelineTrigger,
} from "@homenews/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { pipelineRuns } from "../db/schema.js";
import { analyzeUnanalyzed } from "./analyze.js";
import { fetchAllFeeds } from "./feed-fetcher.js";
import { getSetting } from "./settings.js";
import { summarizeUnsummarized } from "./summarize.js";

/**
 * Thrown when `runPipelineWithProgress` is called while another run is
 * already active. Carries the existing runId so the caller (e.g. the SSE
 * endpoint in Task 44) can attach a watcher to the in-flight run instead of
 * starting a new one.
 */
export class PipelineBusyError extends Error {
  constructor(public readonly activeRunId: string) {
    super(`Pipeline is already running (runId=${activeRunId})`);
    this.name = "PipelineBusyError";
  }
}

/**
 * In-memory singleton registry. At most one entry at a time (enforced by the
 * size check at the top of `runPipelineWithProgress`). Used to track cancel
 * requests between phases.
 */
const activeRuns = new Map<string, { cancelRequested: boolean }>();

/** Returns the currently-active run id, or null if nothing is running. */
export function getActiveRunId(): string | null {
  for (const id of activeRuns.keys()) return id;
  return null;
}

/** Returns true if the given run id is currently active. */
export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

/**
 * Flag the active run as cancel-requested. The orchestrator checks the flag
 * between phases; the in-flight phase is allowed to complete before the run
 * transitions to `cancelled`. Per-article cancel granularity arrives in
 * Task 41 when the cancel signal is threaded into analyze/summarize.
 *
 * Returns true if the run existed and was flagged, false if no active run
 * matches the given id.
 */
export function requestCancelActiveRun(runId: string): boolean {
  const entry = activeRuns.get(runId);
  if (!entry) return false;
  entry.cancelRequested = true;
  return true;
}

function ms(start: number): number {
  return Math.round(performance.now() - start);
}

function isoOrNull(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

export type RawPipelineRunRow = {
  id: string;
  trigger: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  fetchAdded: number | null;
  fetchErrors: number | null;
  analyzeAnalyzed: number | null;
  analyzeErrors: number | null;
  summarizeSummarized: number | null;
  summarizeErrors: number | null;
  errorMessage: string | null;
};

/** Convert a raw drizzle row from `pipeline_runs` into the `PipelineRun`
 *  shape used in the shared schema and API responses (Dates → ISO strings). */
export function mapPipelineRunRow(row: RawPipelineRunRow): PipelineRun {
  return {
    id: row.id,
    trigger: row.trigger as PipelineTrigger,
    status: row.status as PipelineRunStatus,
    startedAt: row.startedAt.toISOString(),
    endedAt: isoOrNull(row.endedAt),
    durationMs: row.durationMs,
    fetchAdded: row.fetchAdded,
    fetchErrors: row.fetchErrors,
    analyzeAnalyzed: row.analyzeAnalyzed,
    analyzeErrors: row.analyzeErrors,
    summarizeSummarized: row.summarizeSummarized,
    summarizeErrors: row.summarizeErrors,
    errorMessage: row.errorMessage,
  };
}

/**
 * Run the full pipeline (fetch → analyze → summarize) and persist a row in
 * `pipeline_runs`. This is the single orchestration primitive used by both
 * the manual SSE endpoint (Task 44) and the scheduler (Task 42).
 *
 * Contract:
 * - Throws `PipelineBusyError` immediately if another run is active.
 * - Emits phase-level progress events via `onProgress` (no-op if omitted).
 *   Task 40 emits phase boundaries only; per-article events are added in
 *   Task 41 when analyze/summarize gain progress callbacks.
 * - Checks the cancel flag between phases. If flagged, remaining phases are
 *   skipped and the run is marked `cancelled` with whatever counts were
 *   accumulated. In-flight phases always complete — no mid-phase abort.
 * - Respects `analyze_enabled` and `summarize_enabled` settings (same as the
 *   scheduler does). Fetch is unconditional.
 * - Caller is responsible for the master `scheduler_enabled` toggle.
 * - Any thrown error transitions the run to `failed` with the error message
 *   persisted in `error_message`.
 * - Always writes a final row; always cleans up the registry.
 */
export async function runPipelineWithProgress(
  trigger: PipelineTrigger,
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>,
): Promise<PipelineRun> {
  // Singleton enforcement
  const existingId = getActiveRunId();
  if (existingId !== null) {
    throw new PipelineBusyError(existingId);
  }

  // Insert start row
  const totalStart = performance.now();
  const [startRow] = await db
    .insert(pipelineRuns)
    .values({ trigger, status: "running" })
    .returning();

  const runId = startRow.id;
  const startedAt = startRow.startedAt;
  const shortId = runId.slice(0, 8);

  activeRuns.set(runId, { cancelRequested: false });

  let fetchAdded: number | null = null;
  let fetchErrors: number | null = null;
  let analyzeAnalyzed: number | null = null;
  let analyzeErrors: number | null = null;
  let summarizeSummarized: number | null = null;
  let summarizeErrors: number | null = null;
  let finalStatus: PipelineRunStatus = "running";
  let errorMessage: string | undefined;

  const wasCancelRequested = (): boolean => activeRuns.get(runId)?.cancelRequested === true;

  try {
    await onProgress?.({
      type: "run-start",
      runId,
      trigger,
      startedAt: startedAt.toISOString(),
    });
    console.info(`[pipeline] run ${shortId} start (trigger=${trigger})`);

    // Phase 1 — Fetch (always runs)
    if (wasCancelRequested()) {
      finalStatus = "cancelled";
    } else {
      await onProgress?.({ type: "fetch-start" });
      const phaseStart = performance.now();
      const results = await fetchAllFeeds();
      fetchAdded = results.reduce((sum, r) => sum + r.added, 0);
      fetchErrors = results.filter((r) => r.error).length;
      console.info(
        `[pipeline] run ${shortId} fetch done in ${ms(phaseStart)}ms — added=${fetchAdded} errors=${fetchErrors}`,
      );
      await onProgress?.({ type: "fetch-done", added: fetchAdded, errors: fetchErrors });
    }

    // Phase 2 — Analyze (gated on analyze_enabled + cancel check)
    // Phase-start / phase-done events are emitted by the service itself so
    // they can carry the `total` count and be interleaved with per-article
    // `analyze-item` events. The orchestrator just relays the callback.
    if (finalStatus === "running") {
      if (wasCancelRequested()) {
        finalStatus = "cancelled";
      } else if (await getSetting<boolean>("analyze_enabled")) {
        const phaseStart = performance.now();
        const limit = await getSetting<number>("analyze_batch_size");
        const signal = activeRuns.get(runId);
        const result = await analyzeUnanalyzed(limit, { onProgress, signal });
        analyzeAnalyzed = result.analyzed;
        analyzeErrors = result.errors;
        console.info(
          `[pipeline] run ${shortId} analyze done in ${ms(phaseStart)}ms — analyzed=${result.analyzed} errors=${result.errors}`,
        );
      } else {
        console.info(`[pipeline] run ${shortId} analyze skipped (analyze_enabled=false)`);
      }
    }

    // Phase 3 — Summarize (gated on summarize_enabled + cancel check)
    if (finalStatus === "running") {
      if (wasCancelRequested()) {
        finalStatus = "cancelled";
      } else if (await getSetting<boolean>("summarize_enabled")) {
        const phaseStart = performance.now();
        const limit = await getSetting<number>("summarize_batch_size");
        const signal = activeRuns.get(runId);
        const result = await summarizeUnsummarized(limit, { onProgress, signal });
        summarizeSummarized = result.summarized;
        summarizeErrors = result.errors;
        console.info(
          `[pipeline] run ${shortId} summarize done in ${ms(phaseStart)}ms — summarized=${result.summarized} errors=${result.errors}`,
        );
      } else {
        console.info(`[pipeline] run ${shortId} summarize skipped (summarize_enabled=false)`);
      }
    }

    // Catch mid-summarize cancellation: the service breaks its loop when the
    // signal is flagged, but the orchestrator can't see that from the return
    // value alone. Without this post-check a cancel during summarize would
    // finalize as "completed" instead of "cancelled".
    if (finalStatus === "running" && wasCancelRequested()) {
      finalStatus = "cancelled";
    }

    if (finalStatus === "running") {
      finalStatus = "completed";
    }
  } catch (err) {
    finalStatus = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[pipeline] run ${shortId} failed: ${errorMessage}`);
  } finally {
    activeRuns.delete(runId);
  }

  const durationMs = ms(totalStart);
  const endedAt = new Date();

  const [finalRow] = await db
    .update(pipelineRuns)
    .set({
      status: finalStatus,
      endedAt,
      durationMs,
      fetchAdded,
      fetchErrors,
      analyzeAnalyzed,
      analyzeErrors,
      summarizeSummarized,
      summarizeErrors,
      errorMessage: errorMessage ?? null,
    })
    .where(eq(pipelineRuns.id, runId))
    .returning();

  console.info(`[pipeline] run ${shortId} ${finalStatus} in ${durationMs}ms`);
  await onProgress?.({
    type: "run-done",
    status: finalStatus,
    durationMs,
    errorMessage,
  });

  return mapPipelineRunRow(finalRow);
}
