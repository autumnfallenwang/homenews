import { type ScheduledTask, schedule } from "node-cron";
import { fetchAllFeeds } from "./feed-fetcher.js";

let task: ScheduledTask | null = null;

export function startScheduler(cronExpression = "*/30 * * * *"): ScheduledTask {
  if (task) {
    void task.stop();
  }

  task = schedule(
    cronExpression,
    async () => {
      const results = await fetchAllFeeds();
      const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
      const errors = results.filter((r) => r.error);
      console.info(
        `[scheduler] Fetched ${results.length} feeds: ${totalAdded} new articles, ${errors.length} errors`,
      );
      for (const err of errors) {
        console.warn(`[scheduler] ${err.feedName}: ${err.error}`);
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
    console.info("[scheduler] Stopped");
  }
}
