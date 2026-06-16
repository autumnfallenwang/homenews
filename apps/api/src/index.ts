import { serve } from "@hono/node-server";
import app from "./app.js";
import { log } from "./lib/logger.js";
import { applyScheduleFromSettings, startScheduleReconciler } from "./services/scheduler.js";
import { seedDefaults } from "./services/settings.js";

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);

/**
 * Run the DB-dependent startup work (seed defaults + resolve the schedule),
 * retrying with exponential backoff until the database answers.
 *
 * On a node reboot the API container can start before the DB Service is
 * DNS-resolvable (`getaddrinfo ENOTFOUND homenews-db`). A single failed attempt
 * here used to leave the scheduler on the hardcoded 2h default until the next
 * reboot or manual save (the "12h setting, 2h runs" incident). We retry until
 * the DB is reachable so the scheduler always comes up on the persisted cadence.
 * If we still can't reach the DB after `maxAttempts`, we hand off to the
 * periodic reconciler rather than start a wrong schedule.
 */
async function bootstrapFromDb(): Promise<void> {
  const maxAttempts = 30;
  const maxDelayMs = 15_000;
  let delayMs = 500;

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await seedDefaults();
      if (result.seeded > 0) {
        log.info(
          { event: "settings.seeded", seeded: result.seeded },
          "default settings seeded on startup",
        );
      }
      await applyScheduleFromSettings();
      if (attempt > 1) {
        log.info(
          { event: "bootstrap.recovered", attempt },
          "DB-dependent startup completed after retries",
        );
      }
      return;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxAttempts) {
        log.error(
          { event: "bootstrap.gave_up", attempt, err: error },
          "DB-dependent startup failed after max retries; reconciler will keep trying",
        );
        return;
      }
      log.warn(
        { event: "bootstrap.retry", attempt, retry_in_ms: delayMs, err: error },
        "DB-dependent startup failed; retrying",
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}

serve({ fetch: app.fetch, port }, async () => {
  log.info({ event: "server.start", port }, "API server listening");
  await bootstrapFromDb();
  // Self-healing net: re-apply the schedule from settings on an interval so a
  // bad boot or an out-of-band DB change can't pin the wrong cadence forever.
  startScheduleReconciler();
});
