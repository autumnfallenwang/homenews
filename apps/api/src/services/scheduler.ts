import { type ScheduledTask, schedule } from "node-cron";
import { log } from "../lib/logger.js";
import { PipelineBusyError, runPipelineWithProgress } from "./pipeline.js";
import { getSetting } from "./settings.js";

let task: ScheduledTask | null = null;
let currentSchedule: string | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_SCHEDULE = "0 */2 * * *";
const DEFAULT_RECONCILE_INTERVAL_MS = 5 * 60_000;

/**
 * Read the cron expression from settings.
 *
 * Only a genuinely absent/empty setting falls back to `DEFAULT_SCHEDULE`.
 * A database error is NOT swallowed: `getSetting` throws only when the DB is
 * unreachable (for a known key like `fetch_interval` it otherwise returns the
 * stored row or the code default), and we let that propagate.
 *
 * The old `catch {}` here was the root cause of the "12h setting, 2h runs"
 * incident: when the API booted before the DB Service was DNS-resolvable
 * (`getaddrinfo ENOTFOUND homenews-db`), this silently returned the 2h default
 * and the wrong cadence stuck until the next reboot or manual save. Callers
 * (boot retry loop, periodic reconciler, settings PATCH) now retry instead.
 */
async function resolveSchedule(): Promise<string> {
  const fromSettings = await getSetting<string>("fetch_interval");
  if (typeof fromSettings === "string" && fromSettings.trim().length > 0) {
    return fromSettings;
  }
  return DEFAULT_SCHEDULE;
}

/** Start the scheduler using `fetch_interval` from settings. Safe to call
 *  again to hot-reload the cron expression after a settings change. */
export async function applyScheduleFromSettings(): Promise<void> {
  const next = await resolveSchedule();
  if (task && currentSchedule === next) return;
  startScheduler(next);
}

/**
 * One cron tick: check the master toggle, run the pipeline, handle errors.
 * Exported so tests can invoke it directly without standing up node-cron.
 *
 * After Task 42 this is the whole tick — fetch/analyze/summarize orchestration
 * lives in `runPipelineWithProgress`, and results are persisted to
 * `pipeline_runs` by the orchestrator. The scheduler's only responsibilities
 * are the `scheduler_enabled` master toggle and graceful handling of
 * `PipelineBusyError` when a manual run is already in progress.
 */
export async function runSchedulerTick(): Promise<void> {
  const schedulerEnabled = await getSetting<boolean>("scheduler_enabled");
  if (!schedulerEnabled) {
    log.info(
      { event: "scheduler.tick.skipped", reason: "scheduler_disabled" },
      "scheduler tick skipped (scheduler_enabled=false)",
    );
    return;
  }

  try {
    await runPipelineWithProgress("scheduler");
  } catch (err) {
    if (err instanceof PipelineBusyError) {
      log.warn(
        {
          event: "scheduler.tick.skipped",
          reason: "pipeline_busy",
          active_run_id: err.activeRunId,
        },
        "scheduler tick skipped — pipeline already running",
      );
      return;
    }
    // The orchestrator catches pipeline-internal errors and records them in
    // pipeline_runs (status='failed'), so this branch is only reached for
    // truly unexpected failures (DB connection drop, out-of-memory, etc.).
    log.warn(
      {
        event: "scheduler.tick.failed",
        err: err instanceof Error ? err : new Error(String(err)),
      },
      "scheduler tick failed unexpectedly",
    );
  }
}

export function startScheduler(cronExpression: string = DEFAULT_SCHEDULE): ScheduledTask {
  if (task) {
    void task.stop();
  }
  currentSchedule = cronExpression;

  task = schedule(cronExpression, runSchedulerTick, {
    noOverlap: true,
    name: "feed-fetcher",
  });

  log.info({ event: "scheduler.started", cron: cronExpression }, "scheduler started");
  return task;
}

export function stopScheduler(): void {
  if (task) {
    void task.stop();
    task = null;
    currentSchedule = null;
    log.info({ event: "scheduler.stopped" }, "scheduler stopped");
  }
}

/**
 * Periodically re-apply the schedule from settings as a self-healing safety
 * net. `applyScheduleFromSettings` no-ops when the resolved cron already
 * matches the running task, so this only restarts node-cron when the value
 * actually drifts — e.g. a boot that couldn't reach the DB and never started a
 * task, or an out-of-band change to `fetch_interval` in the database. Errors
 * are logged and swallowed; the next tick retries.
 */
export function startScheduleReconciler(intervalMs = DEFAULT_RECONCILE_INTERVAL_MS): void {
  if (reconcileTimer) return;
  reconcileTimer = setInterval(() => {
    applyScheduleFromSettings().catch((err) => {
      log.warn(
        {
          event: "scheduler.reconcile.failed",
          err: err instanceof Error ? err : new Error(String(err)),
        },
        "periodic schedule reconcile failed",
      );
    });
  }, intervalMs);
  // A reconcile timer must never keep the process alive on its own.
  reconcileTimer.unref?.();
}

export function stopScheduleReconciler(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
}
