import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestLog } from "./middleware/request-log.js";
import adminApp from "./routes/admin.js";
import articlesApp from "./routes/articles.js";
import feedsApp from "./routes/feeds.js";
import highlightsApp from "./routes/highlights.js";
import rankedApp from "./routes/ranked.js";
import searchApp from "./routes/search.js";
import settingsApp from "./routes/settings.js";

const app = new Hono();

// Request-log first so every response (including CORS preflights and
// 404s) is captured. cors runs after.
app.use("*", requestLog);

app.use(
  "*",
  cors({
    origin: (origin) => origin,
  }),
);

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/feeds", feedsApp);
app.route("/articles", articlesApp);
app.route("/highlights", highlightsApp);
app.route("/ranked", rankedApp);
app.route("/search", searchApp);
app.route("/settings", settingsApp);
app.route("/admin", adminApp);

export default app;
