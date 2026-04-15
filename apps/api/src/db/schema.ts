import { eq, getTableColumns, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  pgView,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// PG tsvector — drizzle doesn't ship a first-class type, but customType is
// enough to keep the column represented in the schema so drizzle-kit push
// doesn't try to drop it on subsequent runs. Phase 15 full-text search.
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const feeds = pgTable("feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  category: text("category"),
  enabled: boolean("enabled").notNull().default(true),
  authorityScore: real("authority_score").notNull().default(0.5),
  // Per-feed weight for the analyze batch allocation. Separate from
  // authority_score by design: this governs analyze throughput/cost share,
  // not ranking. 0 = never analyze this feed. See Phase 10 memo.
  analyzeWeight: real("analyze_weight").notNull().default(0.5),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedId: uuid("feed_id")
      .notNull()
      .references(() => feeds.id),
    title: text("title").notNull(),
    link: text("link").notNull().unique(),
    summary: text("summary"),
    content: text("content"),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    duplicateOfId: uuid("duplicate_of_id"),
    // Phase 14 — reader mode cache. Populated during the analyze phase by
    // services/reader.ts (Task 71). `extraction_status` is application-level
    // enum: 'ok' | 'failed' | 'pending'.
    extractedContent: text("extracted_content"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    extractionStatus: text("extraction_status"),
    // Phase 15 — full-text search (GIN-indexed below). Generated from
    // title + summary + extracted_content via to_tsvector('english'). We
    // deliberately skip llm_summary because generated columns can't
    // reference other tables — and the extracted_content already contains
    // the source material that the LLM summary is derived from.
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(extracted_content, ''))`,
    ),
    // Phase 15 — semantic search vector. Written during the analyze phase
    // over title + extracted_content (Task 89). HNSW-indexed below.
    // Dimensions match the default embedding model (bge-m3 @ 1024).
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (table) => [
    index("articles_search_tsv_idx").using("gin", table.searchTsv),
    index("articles_title_trgm_idx").using("gin", sql`title gin_trgm_ops`),
    index("articles_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const articleAnalysis = pgTable("article_analysis", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id)
    .unique(),
  relevance: integer("relevance").notNull(),
  importance: integer("importance").notNull().default(0),
  tags: text("tags").array(),
  llmSummary: text("llm_summary"),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
});

// Settings table: central key/value store for all tunable values (weights, lambdas,
// tag vocabulary, scheduler config). userId is nullable — NULL rows are system defaults,
// per-user rows override defaults when multi-user auth arrives (forward-compat per Q1b).
export const settings = pgTable(
  "settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id"),
    key: text("key").notNull(),
    value: text("value").notNull(),
    valueType: text("value_type").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("settings_user_id_key_unique").on(table.userId, table.key)],
);

// Pipeline runs: one row per pipeline execution, manual or scheduler-triggered.
// Used by the orchestrator to persist run history (Phase 9 Task 40). Start row
// is inserted when a run begins; per-phase counts + status are filled in as
// the run progresses. See docs/phase9-observability-memo.md for the full rationale.
export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 'manual' | 'scheduler'
    trigger: text("trigger").notNull(),
    // 'running' | 'completed' | 'cancelled' | 'failed'
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    fetchAdded: integer("fetch_added"),
    fetchErrors: integer("fetch_errors"),
    analyzeAnalyzed: integer("analyze_analyzed"),
    analyzeErrors: integer("analyze_errors"),
    summarizeSummarized: integer("summarize_summarized"),
    summarizeErrors: integer("summarize_errors"),
    errorMessage: text("error_message"),
  },
  (table) => [index("pipeline_runs_started_at_idx").on(table.startedAt.desc())],
);

// Phase 14 — per-article user state. Nullable `user_id` for single-user
// mode + forward-compat for multi-user auth. The unique constraint uses
// NULLS NOT DISTINCT so single-user mode (user_id always NULL) still
// enforces one interaction row per article.
export const articleInteractions = pgTable(
  "article_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    starred: boolean("starred").notNull().default(false),
    note: text("note"),
    userTags: text("user_tags").array().notNull().default(sql`'{}'::text[]`),
    followUp: boolean("follow_up").notNull().default(false),
    readingSeconds: integer("reading_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("article_interactions_article_user_unique")
      .on(table.articleId, table.userId)
      .nullsNotDistinct(),
    index("article_interactions_article_idx").on(table.articleId),
    index("article_interactions_user_idx").on(table.userId),
    // Partial indexes — only the "true" rows are ever queried, keeping the
    // indexes tiny regardless of total interaction count.
    index("article_interactions_starred_idx").on(table.articleId).where(sql`starred = true`),
    index("article_interactions_follow_up_idx").on(table.articleId).where(sql`follow_up = true`),
  ],
);

// Phase 14B — per-article highlights. Text-selection captures from the
// article detail page. `text` is non-null (a highlight without selected
// text is meaningless); `note` is optional annotation; char offsets are
// optional DOM anchors for future re-rendering. `user_id` nullable for
// single-user mode + forward-compat multi-user.
export const articleHighlights = pgTable(
  "article_highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    text: text("text").notNull(),
    note: text("note"),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Phase 15 — semantic search vector for the highlight text. Written
    // synchronously on POST /highlights (Task 90). Matches the articles
    // dimension (bge-m3 @ 1024).
    embedding: vector("embedding", { dimensions: 1024 }),
  },
  (table) => [
    index("article_highlights_article_idx").on(table.articleId),
    index("article_highlights_user_idx").on(table.userId),
    index("article_highlights_created_idx").on(table.createdAt.desc()),
    index("article_highlights_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// View: joins for ranked API queries. No math here — composite score is computed
// in the query layer using settings-driven weights (see Task 22).
export const articleAnalysisWithFeed = pgView("article_analysis_with_feed").as((qb) =>
  qb
    .select({
      ...getTableColumns(articleAnalysis),
      articleTitle: articles.title,
      articleLink: articles.link,
      articleSummary: articles.summary,
      articleAuthor: articles.author,
      articlePublishedAt: articles.publishedAt,
      articleFetchedAt: articles.fetchedAt,
      articleExtractedContent: articles.extractedContent,
      articleExtractedAt: articles.extractedAt,
      articleExtractionStatus: articles.extractionStatus,
      feedName: feeds.name,
      feedCategory: feeds.category,
      feedAuthorityScore: feeds.authorityScore,
    })
    .from(articleAnalysis)
    .innerJoin(articles, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id)),
);
