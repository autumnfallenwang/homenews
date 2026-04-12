import { serve } from "@hono/node-server";
import app from "./app.js";
import { startScheduler } from "./services/scheduler.js";
import { seedDefaults } from "./services/settings.js";

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, async () => {
  // biome-ignore lint/suspicious/noConsole: server startup log
  console.log(`API server running on http://localhost:${port}`);
  try {
    const result = await seedDefaults();
    if (result.seeded > 0) {
      console.info(`[settings] Seeded ${result.seeded} default settings on startup`);
    }
  } catch (err) {
    console.warn(
      `[settings] Failed to seed defaults on startup: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  startScheduler(process.env.FETCH_INTERVAL);
});
