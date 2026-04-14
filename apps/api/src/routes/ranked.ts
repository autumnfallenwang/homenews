import { desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { articleAnalysisWithFeed } from "../db/schema.js";
import { getSettingsBatch } from "../services/settings.js";

const app = new Hono();

const WEIGHT_KEYS = [
  "weight_relevance",
  "weight_importance",
  "weight_freshness",
  "weight_authority",
  "weight_uniqueness",
  "freshness_lambda",
] as const;

interface CompositeSettings {
  weight_relevance: number;
  weight_importance: number;
  weight_freshness: number;
  weight_authority: number;
  weight_uniqueness: number;
  freshness_lambda: number;
}

async function loadCompositeSettings(): Promise<CompositeSettings> {
  const raw = await getSettingsBatch([...WEIGHT_KEYS]);
  return {
    weight_relevance: Number(raw.weight_relevance ?? 0),
    weight_importance: Number(raw.weight_importance ?? 0),
    weight_freshness: Number(raw.weight_freshness ?? 0),
    weight_authority: Number(raw.weight_authority ?? 0),
    weight_uniqueness: Number(raw.weight_uniqueness ?? 0),
    freshness_lambda: Number(raw.freshness_lambda ?? 0.03),
  };
}

function buildFreshnessExpr(lambda: number) {
  // Cast lambda param to real so PG can resolve the unary minus operator.
  // Clamp the exponent to avoid PG float underflow on very old articles
  // (EXP raises 22003 instead of returning 0 for results below ~1e-308).
  return sql<number>`EXP(-LEAST((${lambda}::double precision) * EXTRACT(EPOCH FROM (NOW() - COALESCE(${articleAnalysisWithFeed.articlePublishedAt}, ${articleAnalysisWithFeed.articleFetchedAt}))) / 3600.0, 700))`;
}

function buildCompositeExpr(s: CompositeSettings) {
  const freshness = buildFreshnessExpr(s.freshness_lambda);
  // Normalize by the sum of weights so the composite is always bounded 0-1
  // (i.e. always 0-100 when multiplied for display). Only the RATIOS between
  // weights matter to the ranking — users can tune one weight without
  // having to rebalance the others to keep them summing to 1.
  // Guarded against zero-sum via `NULLIF ... || 1` so a pathological all-zero
  // weights config returns 0 instead of divide-by-zero.
  const totalWeight =
    s.weight_relevance +
    s.weight_importance +
    s.weight_freshness +
    s.weight_authority +
    s.weight_uniqueness;
  const divisor = totalWeight > 0 ? totalWeight : 1;
  // All weight params cast to ::double precision so PG can pick the right multiplication operator.
  // Uniqueness is hardcoded to 1.0 for now — real uniqueness signal deferred.
  return sql<number>`(
    ${s.weight_relevance}::double precision * (${articleAnalysisWithFeed.relevance}::double precision / 100)
    + ${s.weight_importance}::double precision * (${articleAnalysisWithFeed.importance}::double precision / 100)
    + ${s.weight_freshness}::double precision * ${freshness}
    + ${s.weight_authority}::double precision * ${articleAnalysisWithFeed.feedAuthorityScore}
    + ${s.weight_uniqueness}::double precision * 1.0
  ) / ${divisor}::double precision`;
}

type RankedRow = {
  id: string;
  articleId: string;
  relevance: number;
  importance: number;
  tags: string[] | null;
  llmSummary: string | null;
  analyzedAt: Date | string;
  articleTitle: string;
  articleLink: string;
  articleSummary: string | null;
  articleAuthor: string | null;
  articlePublishedAt: Date | string | null;
  feedName: string;
  feedAuthorityScore: number;
  freshness: number;
  compositeScore: number;
};

function toResponse(r: RankedRow) {
  return {
    id: r.id,
    articleId: r.articleId,
    relevance: Number(r.relevance),
    importance: Number(r.importance),
    tags: r.tags,
    llmSummary: r.llmSummary,
    analyzedAt: r.analyzedAt,
    freshness: Number(r.freshness),
    compositeScore: Number(r.compositeScore),
    article: {
      title: r.articleTitle,
      link: r.articleLink,
      summary: r.articleSummary,
      author: r.articleAuthor,
      publishedAt: r.articlePublishedAt,
      feedName: r.feedName,
      feedAuthorityScore: Number(r.feedAuthorityScore),
    },
  };
}

// List ranked articles (main feed endpoint)
app.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const minScore = Number(c.req.query("minScore") ?? 0);

  const s = await loadCompositeSettings();
  const freshnessExpr = buildFreshnessExpr(s.freshness_lambda);
  const compositeExpr = buildCompositeExpr(s);

  const rows = await db
    .select({
      id: articleAnalysisWithFeed.id,
      articleId: articleAnalysisWithFeed.articleId,
      relevance: articleAnalysisWithFeed.relevance,
      importance: articleAnalysisWithFeed.importance,
      tags: articleAnalysisWithFeed.tags,
      llmSummary: articleAnalysisWithFeed.llmSummary,
      analyzedAt: articleAnalysisWithFeed.analyzedAt,
      articleTitle: articleAnalysisWithFeed.articleTitle,
      articleLink: articleAnalysisWithFeed.articleLink,
      articleSummary: articleAnalysisWithFeed.articleSummary,
      articleAuthor: articleAnalysisWithFeed.articleAuthor,
      articlePublishedAt: articleAnalysisWithFeed.articlePublishedAt,
      feedName: articleAnalysisWithFeed.feedName,
      feedAuthorityScore: articleAnalysisWithFeed.feedAuthorityScore,
      freshness: freshnessExpr,
      compositeScore: compositeExpr,
    })
    .from(articleAnalysisWithFeed)
    .where(gte(articleAnalysisWithFeed.relevance, minScore))
    .orderBy(desc(compositeExpr), desc(articleAnalysisWithFeed.analyzedAt))
    .limit(limit)
    .offset(offset);

  return c.json(rows.map((r) => toResponse(r as RankedRow)));
});

// Get single ranked article
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const s = await loadCompositeSettings();
  const freshnessExpr = buildFreshnessExpr(s.freshness_lambda);
  const compositeExpr = buildCompositeExpr(s);

  const [row] = await db
    .select({
      id: articleAnalysisWithFeed.id,
      articleId: articleAnalysisWithFeed.articleId,
      relevance: articleAnalysisWithFeed.relevance,
      importance: articleAnalysisWithFeed.importance,
      tags: articleAnalysisWithFeed.tags,
      llmSummary: articleAnalysisWithFeed.llmSummary,
      analyzedAt: articleAnalysisWithFeed.analyzedAt,
      articleTitle: articleAnalysisWithFeed.articleTitle,
      articleLink: articleAnalysisWithFeed.articleLink,
      articleSummary: articleAnalysisWithFeed.articleSummary,
      articleAuthor: articleAnalysisWithFeed.articleAuthor,
      articlePublishedAt: articleAnalysisWithFeed.articlePublishedAt,
      feedName: articleAnalysisWithFeed.feedName,
      feedAuthorityScore: articleAnalysisWithFeed.feedAuthorityScore,
      freshness: freshnessExpr,
      compositeScore: compositeExpr,
    })
    .from(articleAnalysisWithFeed)
    .where(eq(articleAnalysisWithFeed.id, id));

  if (!row) return c.json({ error: "Article analysis not found" }, 404);

  return c.json(toResponse(row as RankedRow));
});

export default app;
