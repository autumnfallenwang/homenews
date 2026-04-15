// Phase 15 Task 92 — GET /search endpoint.
//
// Four modes (keyword / fuzzy / semantic / hybrid) over three targets
// (articles / highlights / all). Filters: sources, tags (LLM OR user),
// published_at range, limit, offset. See phase15-find-memo.md for design.
//
// Raw SQL via drizzle's `sql` template to stay close to the PG operators
// (`@@`, `%`, `<=>`). Query builder was awkward for vector distance +
// trigram similarity; raw SQL is clearer.

import {
  type SearchMode,
  type SearchQuery,
  type SearchResponse,
  type SearchResult,
  searchQuerySchema,
} from "@homenews/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { embed } from "../services/embed.js";

const app = new Hono();

// Per-mode pre-limit cap before merging in target=all. Oversized to give
// the merge sort room to promote strong matches from either side.
const PER_MODE_FETCH_CAP = 100;

type ArticleRow = {
  article_id: string;
  analysis_id: string;
  title: string;
  link: string;
  feed_name: string;
  published_at: Date | string | null;
  score: number | string;
  snippet: string | null;
};

type HighlightRow = {
  highlight_id: string;
  text: string;
  note: string | null;
  created_at: Date | string;
  article_id: string;
  analysis_id: string;
  article_title: string;
  article_link: string;
  feed_name: string;
  article_published_at: Date | string | null;
  score: number | string;
  snippet: string | null;
};

// ts_headline options — 30 words around matches with `<b>…</b>` marks.
// ShortWord=2 lets short keywords contribute to snippets.
const HEADLINE_ARTICLE_OPTS = "StartSel=<b>,StopSel=</b>,MaxWords=30,MinWords=15,ShortWord=2";
const HEADLINE_HIGHLIGHT_OPTS = "StartSel=<b>,StopSel=</b>,MaxWords=20,MinWords=10,ShortWord=2";

// ───────────────────── filter builders ─────────────────────

// Build the SQL WHERE fragment for the article-side pass-through filters.
// Returns undefined when no filters are active (caller avoids emitting a
// bare AND). Tag semantics match Task 75: LLM tags OR user tags via a
// correlated EXISTS subquery on article_interactions.
function buildArticleFilters(q: SearchQuery) {
  const parts = [];
  if (q.sources && q.sources.length > 0) {
    parts.push(sql`f.name = ANY(${q.sources}::text[])`);
  }
  if (q.tags && q.tags.length > 0) {
    parts.push(sql`(
      aa.tags && ${q.tags}::text[]
      OR EXISTS (
        SELECT 1 FROM article_interactions ai
        WHERE ai.article_id = a.id
          AND ai.user_id IS NULL
          AND ai.user_tags && ${q.tags}::text[]
      )
    )`);
  }
  if (q.published_at_gte !== undefined) {
    parts.push(sql`a.published_at >= ${new Date(q.published_at_gte)}`);
  }
  if (q.published_at_lte !== undefined) {
    parts.push(sql`a.published_at <= ${new Date(q.published_at_lte)}`);
  }
  if (parts.length === 0) return sql``;
  return sql` AND ${sql.join(parts, sql` AND `)}`;
}

// ───────────────────── articles search ─────────────────────

async function searchArticlesKeyword(q: SearchQuery): Promise<ArticleRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  const result = await db.execute(sql`
    SELECT
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title,
      a.link,
      a.published_at,
      f.name AS feed_name,
      ts_rank(a.search_tsv, websearch_to_tsquery('english', ${q.q})) AS score,
      ts_headline(
        'english',
        coalesce(a.extracted_content, a.summary, a.title),
        websearch_to_tsquery('english', ${q.q}),
        ${HEADLINE_ARTICLE_OPTS}
      ) AS snippet
    FROM articles a
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE a.search_tsv @@ websearch_to_tsquery('english', ${q.q})
      ${filters}
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result as unknown as ArticleRow[];
}

async function searchArticlesFuzzy(q: SearchQuery): Promise<ArticleRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  const result = await db.execute(sql`
    SELECT
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title,
      a.link,
      a.published_at,
      f.name AS feed_name,
      similarity(a.title, ${q.q}) AS score,
      NULL::text AS snippet
    FROM articles a
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE a.title % ${q.q}
      ${filters}
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result as unknown as ArticleRow[];
}

async function searchArticlesSemantic(q: SearchQuery, queryVec: number[]): Promise<ArticleRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  // HNSW requires ORDER BY the distance operator for index use; we compute
  // the score as 1 - distance in the SELECT list so the response is
  // consistent with other modes (higher = better).
  const vecLiteral = sql.raw(`'[${queryVec.join(",")}]'`);
  const result = await db.execute(sql`
    SELECT
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title,
      a.link,
      a.published_at,
      f.name AS feed_name,
      (1 - (a.embedding <=> ${vecLiteral}::vector)) AS score,
      NULL::text AS snippet
    FROM articles a
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE a.embedding IS NOT NULL
      ${filters}
    ORDER BY a.embedding <=> ${vecLiteral}::vector ASC
    LIMIT ${limit}
  `);
  return result as unknown as ArticleRow[];
}

async function searchArticlesHybrid(q: SearchQuery, queryVec: number[]): Promise<ArticleRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  const vecLiteral = sql.raw(`'[${queryVec.join(",")}]'`);
  // Weighted sum of keyword ts_rank and vector cosine similarity. The
  // FULL OUTER JOIN lets rows that hit only one side still contribute.
  // COALESCE zero means: no match on that side = zero contribution.
  const result = await db.execute(sql`
    WITH kw AS (
      SELECT
        a.id,
        ts_rank(a.search_tsv, websearch_to_tsquery('english', ${q.q})) AS kw_score,
        ts_headline(
          'english',
          coalesce(a.extracted_content, a.summary, a.title),
          websearch_to_tsquery('english', ${q.q}),
          ${HEADLINE_ARTICLE_OPTS}
        ) AS snippet
      FROM articles a
      INNER JOIN article_analysis aa ON aa.article_id = a.id
      INNER JOIN feeds f ON a.feed_id = f.id
      WHERE a.search_tsv @@ websearch_to_tsquery('english', ${q.q})
        ${filters}
      LIMIT ${PER_MODE_FETCH_CAP}
    ),
    vec AS (
      SELECT a.id, (1 - (a.embedding <=> ${vecLiteral}::vector)) AS vec_score
      FROM articles a
      INNER JOIN article_analysis aa ON aa.article_id = a.id
      INNER JOIN feeds f ON a.feed_id = f.id
      WHERE a.embedding IS NOT NULL
        ${filters}
      ORDER BY a.embedding <=> ${vecLiteral}::vector ASC
      LIMIT ${PER_MODE_FETCH_CAP}
    )
    SELECT
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title,
      a.link,
      a.published_at,
      f.name AS feed_name,
      (COALESCE(kw.kw_score, 0) * 0.5 + COALESCE(vec.vec_score, 0) * 0.5) AS score,
      kw.snippet AS snippet
    FROM (
      SELECT id FROM kw
      UNION
      SELECT id FROM vec
    ) ids
    INNER JOIN articles a ON a.id = ids.id
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    LEFT JOIN kw ON kw.id = a.id
    LEFT JOIN vec ON vec.id = a.id
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result as unknown as ArticleRow[];
}

async function searchArticlesAll(
  q: SearchQuery,
  queryVec: number[] | null,
): Promise<{ rows: ArticleRow[]; mode: SearchMode }[]> {
  switch (q.mode) {
    case "keyword":
      return [{ rows: await searchArticlesKeyword(q), mode: "keyword" }];
    case "fuzzy":
      return [{ rows: await searchArticlesFuzzy(q), mode: "fuzzy" }];
    case "semantic":
      if (!queryVec) return [{ rows: [], mode: "semantic" }];
      return [{ rows: await searchArticlesSemantic(q, queryVec), mode: "semantic" }];
    case "hybrid":
      if (!queryVec) return [{ rows: await searchArticlesKeyword(q), mode: "keyword" }];
      return [{ rows: await searchArticlesHybrid(q, queryVec), mode: "hybrid" }];
  }
}

// ───────────────────── highlights search ─────────────────────

async function searchHighlightsKeyword(q: SearchQuery): Promise<HighlightRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  // No stored tsvector on article_highlights — highlights are short, so
  // an inline to_tsvector is cheap. Same `websearch_to_tsquery` semantics
  // as article-side keyword mode.
  const result = await db.execute(sql`
    SELECT
      h.id AS highlight_id,
      h.text,
      h.note,
      h.created_at,
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title AS article_title,
      a.link AS article_link,
      a.published_at AS article_published_at,
      f.name AS feed_name,
      ts_rank(to_tsvector('english', h.text), websearch_to_tsquery('english', ${q.q})) AS score,
      ts_headline(
        'english',
        h.text,
        websearch_to_tsquery('english', ${q.q}),
        ${HEADLINE_HIGHLIGHT_OPTS}
      ) AS snippet
    FROM article_highlights h
    INNER JOIN articles a ON h.article_id = a.id
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE to_tsvector('english', h.text) @@ websearch_to_tsquery('english', ${q.q})
      AND h.user_id IS NULL
      ${filters}
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result as unknown as HighlightRow[];
}

async function searchHighlightsFuzzy(q: SearchQuery): Promise<HighlightRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  const result = await db.execute(sql`
    SELECT
      h.id AS highlight_id,
      h.text,
      h.note,
      h.created_at,
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title AS article_title,
      a.link AS article_link,
      a.published_at AS article_published_at,
      f.name AS feed_name,
      similarity(h.text, ${q.q}) AS score,
      NULL::text AS snippet
    FROM article_highlights h
    INNER JOIN articles a ON h.article_id = a.id
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE h.text % ${q.q}
      AND h.user_id IS NULL
      ${filters}
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result as unknown as HighlightRow[];
}

async function searchHighlightsSemantic(
  q: SearchQuery,
  queryVec: number[],
): Promise<HighlightRow[]> {
  const filters = buildArticleFilters(q);
  const limit = q.limit + q.offset;
  const vecLiteral = sql.raw(`'[${queryVec.join(",")}]'`);
  const result = await db.execute(sql`
    SELECT
      h.id AS highlight_id,
      h.text,
      h.note,
      h.created_at,
      a.id AS article_id,
      aa.id AS analysis_id,
      a.title AS article_title,
      a.link AS article_link,
      a.published_at AS article_published_at,
      f.name AS feed_name,
      (1 - (h.embedding <=> ${vecLiteral}::vector)) AS score,
      NULL::text AS snippet
    FROM article_highlights h
    INNER JOIN articles a ON h.article_id = a.id
    INNER JOIN article_analysis aa ON aa.article_id = a.id
    INNER JOIN feeds f ON a.feed_id = f.id
    WHERE h.embedding IS NOT NULL
      AND h.user_id IS NULL
      ${filters}
    ORDER BY h.embedding <=> ${vecLiteral}::vector ASC
    LIMIT ${limit}
  `);
  return result as unknown as HighlightRow[];
}

async function searchHighlightsAll(
  q: SearchQuery,
  queryVec: number[] | null,
): Promise<{ rows: HighlightRow[]; mode: SearchMode }[]> {
  switch (q.mode) {
    case "keyword":
      return [{ rows: await searchHighlightsKeyword(q), mode: "keyword" }];
    case "fuzzy":
      return [{ rows: await searchHighlightsFuzzy(q), mode: "fuzzy" }];
    case "semantic":
      if (!queryVec) return [{ rows: [], mode: "semantic" }];
      return [{ rows: await searchHighlightsSemantic(q, queryVec), mode: "semantic" }];
    case "hybrid": {
      // Hybrid for highlights = UNION of keyword + semantic, sorted by
      // combined score. Simpler than articles hybrid because we don't
      // pre-aggregate; just run both and merge in JS below.
      if (!queryVec) {
        return [{ rows: await searchHighlightsKeyword(q), mode: "keyword" }];
      }
      const [kw, vec] = await Promise.all([
        searchHighlightsKeyword(q),
        searchHighlightsSemantic(q, queryVec),
      ]);
      // Merge by highlight_id, averaging scores where both sides match.
      const merged = new Map<string, HighlightRow>();
      for (const row of kw) {
        merged.set(row.highlight_id, { ...row, score: Number(row.score) * 0.5 });
      }
      for (const row of vec) {
        const existing = merged.get(row.highlight_id);
        if (existing) {
          existing.score = Number(existing.score) + Number(row.score) * 0.5;
        } else {
          merged.set(row.highlight_id, { ...row, score: Number(row.score) * 0.5 });
        }
      }
      const rows = Array.from(merged.values()).sort((a, b) => Number(b.score) - Number(a.score));
      return [{ rows, mode: "hybrid" }];
    }
  }
}

// ───────────────────── serializers ─────────────────────

function toIsoOrNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

function articleRowToResult(row: ArticleRow, mode: SearchMode): SearchResult {
  return {
    kind: "article",
    score: Number(row.score),
    matchedMode: mode,
    snippet: row.snippet ?? null,
    article: {
      analysisId: row.analysis_id,
      articleId: row.article_id,
      title: row.title,
      link: row.link,
      feedName: row.feed_name,
      publishedAt: toIsoOrNull(row.published_at),
    },
  };
}

function highlightRowToResult(row: HighlightRow, mode: SearchMode): SearchResult {
  const createdAt = toIsoOrNull(row.created_at) ?? new Date().toISOString();
  return {
    kind: "highlight",
    score: Number(row.score),
    matchedMode: mode,
    snippet: row.snippet ?? null,
    article: {
      analysisId: row.analysis_id,
      articleId: row.article_id,
      title: row.article_title,
      link: row.article_link,
      feedName: row.feed_name,
      publishedAt: toIsoOrNull(row.article_published_at),
    },
    highlight: {
      id: row.highlight_id,
      text: row.text,
      note: row.note,
      createdAt,
    },
  };
}

// ───────────────────── handler ─────────────────────

app.get("/", async (c) => {
  const rawParams = Object.fromEntries(new URL(c.req.url).searchParams);
  const parsed = searchQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return c.json({ error: "Invalid query", issues: parsed.error.issues }, 400);
  }
  const q = parsed.data;

  // Embed the query text once for semantic/hybrid modes. Keyword and
  // fuzzy skip this entirely — no latency penalty for those modes.
  let queryVec: number[] | null = null;
  if (q.mode === "semantic" || q.mode === "hybrid") {
    try {
      queryVec = await embed(q.q);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[search] query embedding failed: ${msg}`);
      // Fall through — semantic/hybrid will degrade to empty or keyword.
    }
  }

  // Run target-specific queries in parallel where applicable.
  const articleSets =
    q.target === "all" || q.target === "articles" ? await searchArticlesAll(q, queryVec) : [];
  const highlightSets =
    q.target === "all" || q.target === "highlights" ? await searchHighlightsAll(q, queryVec) : [];

  // Flatten to a single results array, keeping track of each row's mode.
  const results: SearchResult[] = [];
  for (const set of articleSets) {
    for (const row of set.rows) {
      results.push(articleRowToResult(row, set.mode));
    }
  }
  for (const set of highlightSets) {
    for (const row of set.rows) {
      results.push(highlightRowToResult(row, set.mode));
    }
  }

  // Merge: sort all combined rows by score desc, then slice to the
  // requested window. For single-target queries this is mostly a no-op
  // (already sorted by the SQL), but target=all needs the cross-sort.
  results.sort((a, b) => b.score - a.score);
  const windowed = results.slice(q.offset, q.offset + q.limit);

  const response: SearchResponse = {
    rows: windowed,
    total: results.length,
    limit: q.limit,
    offset: q.offset,
    query: q.q,
    mode: q.mode,
  };
  return c.json(response);
});

export default app;
