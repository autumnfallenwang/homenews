import { serve } from "@hono/node-server";
import app from "./app.js";
import { log } from "./lib/logger.js";
import { applyScheduleFromSettings } from "./services/scheduler.js";
import { seedDefaults } from "./services/settings.js";

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, async () => {
  log.info({ event: "server.start", port }, "API server listening");
  try {
    const result = await seedDefaults();
    if (result.seeded > 0) {
      log.info(
        { event: "settings.seeded", seeded: result.seeded },
        "default settings seeded on startup",
      );
    }
  } catch (err) {
    log.warn(
      {
        event: "settings.seed.failed",
        err: err instanceof Error ? err : new Error(String(err)),
      },
      "failed to seed defaults on startup",
    );
  }
  await applyScheduleFromSettings();
});
