import { CronExpressionParser } from "cron-parser";
import { getSetting } from "./settings.js";

/**
 * Returns the next scheduled pipeline run time, or null if:
 *  - `scheduler_enabled` is false
 *  - `fetch_interval` is missing, empty, or not a string
 *  - the cron expression fails to parse
 *
 * Pure function of `(fetch_interval, scheduler_enabled, now)`. No caching,
 * no side effects. Callers that need stability across a short window (e.g.
 * a single status response) should invoke this once and reuse the result.
 *
 * Consumer: `GET /admin/pipeline/status` (Task 44). The frontend then ticks
 * a countdown display locally from this timestamp.
 */
export async function getNextScheduledRunAt(): Promise<Date | null> {
  const enabled = await getSetting<boolean>("scheduler_enabled");
  // Strict `=== false` so `undefined` (setting not yet seeded) still falls
  // through to the cron expression check — we prefer to compute a sensible
  // next-fire time during the brief startup window before seeding completes.
  if (enabled === false) return null;

  const expression = await getSetting<string>("fetch_interval");
  if (typeof expression !== "string" || expression.trim().length === 0) {
    return null;
  }

  try {
    const interval = CronExpressionParser.parse(expression);
    return interval.next().toDate();
  } catch {
    // Malformed cron expression — surface as "unknown next run" rather than
    // throwing so the status endpoint can still respond.
    return null;
  }
}
