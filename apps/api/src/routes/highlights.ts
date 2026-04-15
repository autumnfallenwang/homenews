import type { HighlightWithArticle } from "@homenews/shared";
import { desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { articleAnalysis, articleHighlights, articles, feeds } from "../db/schema.js";

const app = new Hono();

type HighlightJoinRow = {
  id: string;
  articleId: string;
  text: string;
  note: string | null;
  createdAt: Date | string;
  analysisId: string;
  articleTitle: string;
  articleLink: string;
  articlePublishedAt: Date | string | null;
  feedName: string;
};

function toHighlightWithArticleResponse(row: HighlightJoinRow): HighlightWithArticle {
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  const publishedAt =
    row.articlePublishedAt instanceof Date
      ? row.articlePublishedAt.toISOString()
      : row.articlePublishedAt;
  return {
    id: row.id,
    articleId: row.articleId,
    text: row.text,
    note: row.note,
    createdAt,
    article: {
      analysisId: row.analysisId,
      title: row.articleTitle,
      link: row.articleLink,
      feedName: row.feedName,
      publishedAt,
    },
  };
}

// Cross-article list of saved highlights, newest first. Drives the
// /highlights review route. No filters in v1 — add date/tag filters
// if real use reveals the need.
app.get("/", async (c) => {
  const rawLimit = Number(c.req.query("limit") ?? 50);
  const rawOffset = Number(c.req.query("offset") ?? 0);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const rows = await db
    .select({
      id: articleHighlights.id,
      articleId: articleHighlights.articleId,
      text: articleHighlights.text,
      note: articleHighlights.note,
      createdAt: articleHighlights.createdAt,
      analysisId: articleAnalysis.id,
      articleTitle: articles.title,
      articleLink: articles.link,
      articlePublishedAt: articles.publishedAt,
      feedName: feeds.name,
    })
    .from(articleHighlights)
    .innerJoin(articles, eq(articleHighlights.articleId, articles.id))
    .innerJoin(articleAnalysis, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(isNull(articleHighlights.userId))
    .orderBy(desc(articleHighlights.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json(rows.map((r) => toHighlightWithArticleResponse(r as HighlightJoinRow)));
});

// Delete a highlight by id. Single-user mode: no auth check — any
// highlight can be deleted by the sole user. Multi-user auth will add
// `AND user_id = $authUser` here.
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: articleHighlights.id })
    .from(articleHighlights)
    .where(eq(articleHighlights.id, id));

  if (!existing) {
    return c.json({ error: "Highlight not found" }, 404);
  }

  await db.delete(articleHighlights).where(eq(articleHighlights.id, id));

  return c.json({ deleted: true });
});

export default app;
