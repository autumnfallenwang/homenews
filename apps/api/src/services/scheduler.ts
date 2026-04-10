import { type ScheduledTask, schedule } from "node-cron";
import { clusterArticles } from "./clustering.js";
import { fetchAllFeeds } from "./feed-fetcher.js";
import { scoreUnscored } from "./scoring.js";
import { summarizeUnsummarized } from "./summarization.js";

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

      // Score new articles via LLM
      try {
        const scoreResults = await scoreUnscored();
        console.info(
          `[scheduler] Scored ${scoreResults.scored} articles, ${scoreResults.errors} errors`,
        );
      } catch (err) {
        console.warn(
          `[scheduler] Scoring failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Cluster scored articles
      try {
        const clusterResults = await clusterArticles();
        console.info(
          `[scheduler] Clustered ${clusterResults.clustered} articles, ${clusterResults.errors} errors`,
        );
      } catch (err) {
        console.warn(
          `[scheduler] Clustering failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Summarize articles
      try {
        const summaryResults = await summarizeUnsummarized();
        console.info(
          `[scheduler] Summarized ${summaryResults.summarized} articles, ${summaryResults.errors} errors`,
        );
      } catch (err) {
        console.warn(
          `[scheduler] Summarization failed: ${err instanceof Error ? err.message : String(err)}`,
        );
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
