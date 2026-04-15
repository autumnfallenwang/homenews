import { Hono } from "hono";
import { cors } from "hono/cors";
import adminApp from "./routes/admin.js";
import articlesApp from "./routes/articles.js";
import feedsApp from "./routes/feeds.js";
import rankedApp from "./routes/ranked.js";
import settingsApp from "./routes/settings.js";

const app = new Hono();

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
app.route("/ranked", rankedApp);
app.route("/settings", settingsApp);
app.route("/admin", adminApp);

export default app;
