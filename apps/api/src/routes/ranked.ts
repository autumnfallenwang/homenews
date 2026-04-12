import { desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { articleAnalysis, articles, feeds } from "../db/schema.js";

const app = new Hono();

// List ranked articles (main feed endpoint)
app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const minScore = Number(c.req.query("minScore") ?? 0);

  const rows = await db
    .select({
      id: articleAnalysis.id,
      articleId: articleAnalysis.articleId,
      relevance: articleAnalysis.relevance,
      importance: articleAnalysis.importance,
      tags: articleAnalysis.tags,
      llmSummary: articleAnalysis.llmSummary,
      analyzedAt: articleAnalysis.analyzedAt,
      articleTitle: articles.title,
      articleLink: articles.link,
      articleSummary: articles.summary,
      articleAuthor: articles.author,
      articlePublishedAt: articles.publishedAt,
      feedName: feeds.name,
    })
    .from(articleAnalysis)
    .innerJoin(articles, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(gte(articleAnalysis.relevance, minScore))
    .orderBy(desc(articleAnalysis.relevance), desc(articleAnalysis.analyzedAt))
    .limit(limit)
    .offset(offset);

  const results = rows.map((r) => ({
    id: r.id,
    articleId: r.articleId,
    relevance: r.relevance,
    importance: r.importance,
    tags: r.tags,
    llmSummary: r.llmSummary,
    analyzedAt: r.analyzedAt,
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

// Get single ranked article
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [row] = await db
    .select({
      id: articleAnalysis.id,
      articleId: articleAnalysis.articleId,
      relevance: articleAnalysis.relevance,
      importance: articleAnalysis.importance,
      tags: articleAnalysis.tags,
      llmSummary: articleAnalysis.llmSummary,
      analyzedAt: articleAnalysis.analyzedAt,
      articleTitle: articles.title,
      articleLink: articles.link,
      articleSummary: articles.summary,
      articleAuthor: articles.author,
      articlePublishedAt: articles.publishedAt,
      feedName: feeds.name,
    })
    .from(articleAnalysis)
    .innerJoin(articles, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(eq(articleAnalysis.id, id));

  if (!row) return c.json({ error: "Article analysis not found" }, 404);

  return c.json({
    id: row.id,
    articleId: row.articleId,
    relevance: row.relevance,
    importance: row.importance,
    tags: row.tags,
    llmSummary: row.llmSummary,
    analyzedAt: row.analyzedAt,
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
