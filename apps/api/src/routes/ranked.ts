import { count, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { articles, feeds, ranked } from "../db/schema.js";

const app = new Hono();

// List ranked articles (main feed endpoint)
app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const minScore = Number(c.req.query("minScore") ?? 0);
  const cluster = c.req.query("cluster");

  let query = db
    .select({
      id: ranked.id,
      articleId: ranked.articleId,
      score: ranked.score,
      tags: ranked.tags,
      cluster: ranked.cluster,
      llmSummary: ranked.llmSummary,
      rankedAt: ranked.rankedAt,
      articleTitle: articles.title,
      articleLink: articles.link,
      articleSummary: articles.summary,
      articleAuthor: articles.author,
      articlePublishedAt: articles.publishedAt,
      feedName: feeds.name,
    })
    .from(ranked)
    .innerJoin(articles, eq(ranked.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(gte(ranked.score, minScore))
    .orderBy(desc(ranked.score), desc(ranked.rankedAt))
    .limit(limit)
    .offset(offset)
    .$dynamic();

  if (cluster) {
    query = query.where(eq(ranked.cluster, cluster));
  }

  const rows = await query;

  const results = rows.map((r) => ({
    id: r.id,
    articleId: r.articleId,
    score: r.score,
    tags: r.tags,
    cluster: r.cluster,
    llmSummary: r.llmSummary,
    rankedAt: r.rankedAt,
    article: {
      title: r.articleTitle,
      link: r.articleLink,
      summary: r.articleSummary,
      author: r.articleAuthor,
      publishedAt: r.articlePublishedAt,
      feedName: r.feedName,
    },
  }));

  return c.json(results);
});

// List distinct clusters with counts
app.get("/clusters", async (c) => {
  const rows = await db
    .select({
      cluster: ranked.cluster,
      count: count(),
    })
    .from(ranked)
    .where(sql`${ranked.cluster} IS NOT NULL`)
    .groupBy(ranked.cluster)
    .orderBy(desc(count()));

  return c.json(rows);
});

// Get single ranked article
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [row] = await db
    .select({
      id: ranked.id,
      articleId: ranked.articleId,
      score: ranked.score,
      tags: ranked.tags,
      cluster: ranked.cluster,
      llmSummary: ranked.llmSummary,
      rankedAt: ranked.rankedAt,
      articleTitle: articles.title,
      articleLink: articles.link,
      articleSummary: articles.summary,
      articleAuthor: articles.author,
      articlePublishedAt: articles.publishedAt,
      feedName: feeds.name,
    })
    .from(ranked)
    .innerJoin(articles, eq(ranked.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(eq(ranked.id, id));

  if (!row) return c.json({ error: "Ranked article not found" }, 404);

  return c.json({
    id: row.id,
    articleId: row.articleId,
    score: row.score,
    tags: row.tags,
    cluster: row.cluster,
    llmSummary: row.llmSummary,
    rankedAt: row.rankedAt,
    article: {
      title: row.articleTitle,
      link: row.articleLink,
      summary: row.articleSummary,
      author: row.articleAuthor,
      publishedAt: row.articlePublishedAt,
      feedName: row.feedName,
    },
  });
});

export default app;
