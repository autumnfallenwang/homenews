import { eq, getTableColumns } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  pgView,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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

export const articles = pgTable("articles", {
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
});

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
      feedName: feeds.name,
      feedCategory: feeds.category,
      feedAuthorityScore: feeds.authorityScore,
    })
    .from(articleAnalysis)
    .innerJoin(articles, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id)),
);
