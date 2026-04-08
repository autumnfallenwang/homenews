import { serve } from "@hono/node-server";
import app from "./app.js";
import { startScheduler } from "./services/scheduler.js";

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  // biome-ignore lint/suspicious/noConsole: server startup log
  console.log(`API server running on http://localhost:${port}`);
  startScheduler(process.env.FETCH_INTERVAL);
});
