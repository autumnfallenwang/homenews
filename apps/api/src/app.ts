import { Hono } from "hono";
import { cors } from "hono/cors";
import feedsApp from "./routes/feeds.js";
import rankedApp from "./routes/ranked.js";

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
app.route("/ranked", rankedApp);

export default app;
