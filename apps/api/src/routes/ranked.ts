import { parseRankedSort, rankedQuerySchema } from "@homenews/shared";
import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
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

// Escape ILIKE wildcards in user search input so literal % / _ / \ don't
// become pattern metacharacters.
function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type FacetDimension = "sources" | "categories" | "tags";

function buildWhereClause(
  q: ReturnType<typeof rankedQuerySchema.parse>,
  compositeExpr: SQL<number>,
  exclude?: FacetDimension,
): SQL | undefined {
  const conds: (SQL | undefined)[] = [];

  if (q.q) {
    const needle = `%${escapeIlike(q.q)}%`;
    conds.push(
      or(
        ilike(articleAnalysisWithFeed.articleTitle, needle),
        ilike(articleAnalysisWithFeed.articleSummary, needle),
        ilike(articleAnalysisWithFeed.llmSummary, needle),
      ),
    );
  }
  if (q.sources && q.sources.length > 0 && exclude !== "sources") {
    conds.push(inArray(articleAnalysisWithFeed.feedName, q.sources));
  }
  if (q.categories && q.categories.length > 0 && exclude !== "categories") {
    conds.push(inArray(articleAnalysisWithFeed.feedCategory, q.categories));
  }
  if (q.tags && q.tags.length > 0 && exclude !== "tags") {
    conds.push(arrayOverlaps(articleAnalysisWithFeed.tags, q.tags));
  }
  if (q.composite_gte !== undefined) {
    // composite expression is 0..1 internally; filter input is 0..100 per
    // decision #2 in phase13-server-filtering-memo.md. Divide at comparison.
    conds.push(sql`${compositeExpr} >= ${q.composite_gte / 100}`);
  }
  if (q.relevance_gte !== undefined) {
    conds.push(gte(articleAnalysisWithFeed.relevance, q.relevance_gte));
  }
  if (q.importance_gte !== undefined) {
    conds.push(gte(articleAnalysisWithFeed.importance, q.importance_gte));
  }
  if (q.published_at_gte !== undefined) {
    conds.push(gte(articleAnalysisWithFeed.articlePublishedAt, new Date(q.published_at_gte)));
  }
  if (q.published_at_lte !== undefined) {
    conds.push(lte(articleAnalysisWithFeed.articlePublishedAt, new Date(q.published_at_lte)));
  }

  return conds.length > 0 ? and(...conds) : undefined;
}

function buildOrderClause(
  sortRaw: string,
  compositeExpr: SQL<number>,
  freshnessExpr: SQL<number>,
): SQL[] {
  const { field, direction } = parseRankedSort(sortRaw);
  // biome-ignore lint/suspicious/noExplicitAny: drizzle desc/asc accept heterogeneous columns+SQL
  const fieldMap: Record<string, any> = {
    composite: compositeExpr,
    relevance: articleAnalysisWithFeed.relevance,
    importance: articleAnalysisWithFeed.importance,
    freshness: freshnessExpr,
    published: articleAnalysisWithFeed.articlePublishedAt,
    analyzed: articleAnalysisWithFeed.analyzedAt,
  };
  const col = fieldMap[field];
  const primary = direction === "desc" ? desc(col) : asc(col);
  // Fixed analyzedAt DESC tiebreak; skip when it would be redundant.
  return field === "analyzed" ? [primary] : [primary, desc(articleAnalysisWithFeed.analyzedAt)];
}

// --- Facet queries (Phase 13, opt-in via ?include_facets=1) ---
// Each facet excludes its own dimension from the WHERE clause so that clicking
// a chip doesn't zero out sibling counts — the user always sees "how many
// would match if I also added this chip". See phase13-server-filtering-memo.md
// decision #11.

type FacetBucket = { name: string; count: number };

function fetchSourcesFacet(
  q: ReturnType<typeof rankedQuerySchema.parse>,
  compositeExpr: SQL<number>,
): Promise<FacetBucket[]> {
  const where = buildWhereClause(q, compositeExpr, "sources");
  return db
    .select({
      name: articleAnalysisWithFeed.feedName,
      count: sql<number>`count(*)::int`,
    })
    .from(articleAnalysisWithFeed)
    .where(where)
    .groupBy(articleAnalysisWithFeed.feedName)
    .orderBy(desc(sql`count(*)`)) as Promise<FacetBucket[]>;
}

function fetchCategoriesFacet(
  q: ReturnType<typeof rankedQuerySchema.parse>,
  compositeExpr: SQL<number>,
): Promise<FacetBucket[]> {
  // NULL categories excluded (no "(uncategorized)" bucket — the categories
  // filter uses exact string match, so uncategorized feeds can't be hit anyway).
  const base = buildWhereClause(q, compositeExpr, "categories");
  const where = base
    ? and(base, isNotNull(articleAnalysisWithFeed.feedCategory))
    : isNotNull(articleAnalysisWithFeed.feedCategory);
  return db
    .select({
      name: sql<string>`${articleAnalysisWithFeed.feedCategory}`,
      count: sql<number>`count(*)::int`,
    })
    .from(articleAnalysisWithFeed)
    .where(where)
    .groupBy(articleAnalysisWithFeed.feedCategory)
    .orderBy(desc(sql`count(*)`)) as Promise<FacetBucket[]>;
}

function fetchTagsFacet(
  q: ReturnType<typeof rankedQuerySchema.parse>,
  compositeExpr: SQL<number>,
): Promise<FacetBucket[]> {
  const where = buildWhereClause(q, compositeExpr, "tags");
  const tagExpr = sql<string>`unnest(${articleAnalysisWithFeed.tags})`;
  return db
    .select({
      name: tagExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(articleAnalysisWithFeed)
    .where(where)
    .groupBy(tagExpr)
    .orderBy(desc(sql`count(*)`)) as Promise<FacetBucket[]>;
}

// List ranked articles (main feed endpoint) — Phase 13 filter/sort/pagination.
app.get("/", async (c) => {
  const rawParams = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = rankedQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return c.json({ error: "Invalid query", issues: parsed.error.issues }, 400);
  }
  const q = parsed.data;

  const s = await loadCompositeSettings();
  const freshnessExpr = buildFreshnessExpr(s.freshness_lambda);
  const compositeExpr = buildCompositeExpr(s);

  const whereClause = buildWhereClause(q, compositeExpr);
  const orderClause = buildOrderClause(q.sort, compositeExpr, freshnessExpr);

  const listPromise = db
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
    .where(whereClause)
    .orderBy(...orderClause)
    .limit(q.limit)
    .offset(q.offset);

  const countPromise = db
    .select({ count: sql<number>`count(*)::int` })
    .from(articleAnalysisWithFeed)
    .where(whereClause);

  if (q.include_facets) {
    const [rows, countRows, sources, tags, categories] = await Promise.all([
      listPromise,
      countPromise,
      fetchSourcesFacet(q, compositeExpr),
      fetchTagsFacet(q, compositeExpr),
      fetchCategoriesFacet(q, compositeExpr),
    ]);
    return c.json({
      rows: rows.map((r) => toResponse(r as RankedRow)),
      total: Number(countRows[0]?.count ?? 0),
      limit: q.limit,
      offset: q.offset,
      facets: { sources, tags, categories },
    });
  }

  const [rows, countRows] = await Promise.all([listPromise, countPromise]);
  return c.json({
    rows: rows.map((r) => toResponse(r as RankedRow)),
    total: Number(countRows[0]?.count ?? 0),
    limit: q.limit,
    offset: q.offset,
  });
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
