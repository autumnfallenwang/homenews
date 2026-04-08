import { createFeedSchema, updateFeedSchema } from "@homenews/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { articles, feeds } from "../db/schema.js";
import { fetchAllFeeds, fetchFeed } from "../services/feed-fetcher.js";

const app = new Hono();

// List all feeds
app.get("/", async (c) => {
  const allFeeds = await db.select().from(feeds);
  return c.json(allFeeds);
});

// Get single feed
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [feed] = await db.select().from(feeds).where(eq(feeds.id, id));
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  return c.json(feed);
});

// Create feed
app.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createFeedSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }
  const [created] = await db.insert(feeds).values(parsed.data).returning();
  return c.json(created, 201);
});

// Update feed
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateFeedSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }
  const [updated] = await db.update(feeds).set(parsed.data).where(eq(feeds.id, id)).returning();
  if (!updated) return c.json({ error: "Feed not found" }, 404);
  return c.json(updated);
});

// Delete feed (cascade: delete articles first)
app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [feed] = await db.select({ id: feeds.id }).from(feeds).where(eq(feeds.id, id));
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  await db.delete(articles).where(eq(articles.feedId, id));
  await db.delete(feeds).where(eq(feeds.id, id));
  return c.json({ deleted: true });
});

// Manual fetch: single feed
app.post("/:id/fetch", async (c) => {
  const id = c.req.param("id");
  const [feed] = await db
    .select({ id: feeds.id, name: feeds.name, url: feeds.url })
    .from(feeds)
    .where(eq(feeds.id, id));
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const result = await fetchFeed(feed);
  return c.json(result);
});

// Manual fetch: all enabled feeds
app.post("/fetch", async (c) => {
  const results = await fetchAllFeeds();
  return c.json(results);
});

export default app;
