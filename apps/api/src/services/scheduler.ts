import { type ScheduledTask, schedule } from "node-cron";
import { analyzeUnanalyzed } from "./analyze.js";
import { fetchAllFeeds } from "./feed-fetcher.js";
import { getSetting } from "./settings.js";
import { summarizeUnsummarized } from "./summarize.js";

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

export function startScheduler(cronExpression: string = DEFAULT_SCHEDULE): ScheduledTask {
  if (task) {
    void task.stop();
  }
  currentSchedule = cronExpression;

  task = schedule(
    cronExpression,
    async () => {
      // Check master toggle first
      const schedulerEnabled = await getSetting<boolean>("scheduler_enabled");
      if (!schedulerEnabled) {
        console.info("[scheduler] scheduler_enabled=false, skipping tick");
        return;
      }

      // Step 1: fetch
      const results = await fetchAllFeeds();
      const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
      const errors = results.filter((r) => r.error);
      console.info(
        `[scheduler] Fetched ${results.length} feeds: ${totalAdded} new articles, ${errors.length} errors`,
      );
      for (const err of errors) {
        console.warn(`[scheduler] ${err.feedName}: ${err.error}`);
      }

      // Step 2: analyze (relevance, importance, tags)
      const analyzeEnabled = await getSetting<boolean>("analyze_enabled");
      if (analyzeEnabled) {
        try {
          const batchSize = await getSetting<number>("analyze_batch_size");
          const r = await analyzeUnanalyzed(batchSize);
          console.info(`[scheduler] Analyzed ${r.analyzed} articles, ${r.errors} errors`);
        } catch (err) {
          console.warn(
            `[scheduler] Analyze failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        console.info("[scheduler] analyze_enabled=false, skipping analyze step");
      }

      // Step 3: summarize
      const summarizeEnabled = await getSetting<boolean>("summarize_enabled");
      if (summarizeEnabled) {
        try {
          const batchSize = await getSetting<number>("summarize_batch_size");
          const r = await summarizeUnsummarized(batchSize);
          console.info(`[scheduler] Summarized ${r.summarized} articles, ${r.errors} errors`);
        } catch (err) {
          console.warn(
            `[scheduler] Summarize failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        console.info("[scheduler] summarize_enabled=false, skipping summarize step");
      }
    },
    { noOverlap: true, name: "feed-fetcher" },
  );

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
