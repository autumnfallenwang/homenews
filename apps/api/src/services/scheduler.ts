import { type ScheduledTask, schedule } from "node-cron";
import { PipelineBusyError, runPipelineWithProgress } from "./pipeline.js";
import { getSetting } from "./settings.js";

let task: ScheduledTask | null = null;
let currentSchedule: string | null = null;

const DEFAULT_SCHEDULE = "0 */2 * * *";

/** Read the cron expression from settings, falling back to the hardcoded
 *  default if the setting is missing or unreadable. */
async function resolveSchedule(): Promise<string> {
  try {
    const fromSettings = await getSetting<string>("fetch_interval");
    if (typeof fromSettings === "string" && fromSettings.trim().length > 0) {
      return fromSettings;
    }
  } catch {
    // fall through to default
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
    console.info("[scheduler] scheduler_enabled=false, skipping tick");
    return;
  }

  try {
    await runPipelineWithProgress("scheduler");
  } catch (err) {
    if (err instanceof PipelineBusyError) {
      console.warn(
        `[scheduler] skipping tick — pipeline already running (runId=${err.activeRunId})`,
      );
      return;
    }
    // The orchestrator catches pipeline-internal errors and records them in
    // pipeline_runs (status='failed'), so this branch is only reached for
    // truly unexpected failures (DB connection drop, out-of-memory, etc.).
    console.warn(
      `[scheduler] tick failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
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

  console.info(`[scheduler] Started with schedule: ${cronExpression}`);
  return task;
}

export function stopScheduler(): void {
  if (task) {
    void task.stop();
    task = null;
    currentSchedule = null;
    console.info("[scheduler] Stopped");
  }
}
