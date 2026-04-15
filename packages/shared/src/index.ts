import { z } from "zod/v4";

export const healthResponseSchema = z.object({
  status: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const feedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: z.url(),
  category: z.string().nullable(),
  enabled: z.boolean(),
  authorityScore: z.number().min(0).max(1),
  // Per-feed weight for the analyze batch allocation (Phase 10). Separate
  // from authorityScore by design — see phase10-analyze-allocation-memo.md.
  analyzeWeight: z.number().min(0).max(1),
  lastFetchedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Feed = z.infer<typeof feedSchema>;

export const createFeedSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
  authorityScore: z.number().min(0).max(1).optional(),
  analyzeWeight: z.number().min(0).max(1).optional(),
});

export type CreateFeed = z.infer<typeof createFeedSchema>;

export const updateFeedSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.url().optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  authorityScore: z.number().min(0).max(1).optional(),
  analyzeWeight: z.number().min(0).max(1).optional(),
});

export type UpdateFeed = z.infer<typeof updateFeedSchema>;

export const articleSchema = z.object({
  id: z.string().uuid(),
  feedId: z.string().uuid(),
  title: z.string(),
  link: z.url(),
  summary: z.string().nullable(),
  content: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  fetchedAt: z.string(),
  duplicateOfId: z.string().uuid().nullable(),
});

export type Article = z.infer<typeof articleSchema>;

export const articleAnalysisSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  relevance: z.number().int().min(0).max(100),
  importance: z.number().int().min(0).max(100),
  tags: z.array(z.string()).nullable(),
  llmSummary: z.string().nullable(),
  analyzedAt: z.string(),
});

export type ArticleAnalysis = z.infer<typeof articleAnalysisSchema>;

export const analyzedArticleSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  relevance: z.number().int().min(0).max(100),
  importance: z.number().int().min(0).max(100),
  tags: z.array(z.string()).nullable(),
  llmSummary: z.string().nullable(),
  analyzedAt: z.string(),
  freshness: z.number(), // 0..1 — exponential decay from publishedAt/fetchedAt
  compositeScore: z.number(), // weighted sum of all dimensions, computed from settings
  article: z.object({
    title: z.string(),
    link: z.url(),
    summary: z.string().nullable(),
    author: z.string().nullable(),
    publishedAt: z.string().nullable(),
    feedName: z.string(),
    feedAuthorityScore: z.number().min(0).max(1),
    // Phase 14: reader mode fields populated by the analyze-phase extraction
    // cascade. `extractionStatus` is 'ok' | 'failed' | 'pending' | null.
    extractedContent: z.string().nullable(),
    extractedAt: z.string().nullable(),
    extractionStatus: z.string().nullable(),
  }),
});

export type AnalyzedArticle = z.infer<typeof analyzedArticleSchema>;

// --- Settings ---

export const settingValueTypeSchema = z.enum(["number", "string", "boolean", "json"]);
export type SettingValueType = z.infer<typeof settingValueTypeSchema>;

export const settingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  key: z.string(),
  value: z.unknown(),
  valueType: settingValueTypeSchema,
  description: z.string().nullable(),
  updatedAt: z.string(),
});
export type Setting = z.infer<typeof settingSchema>;

export const updateSettingSchema = z
  .object({
    value: z.unknown(),
    description: z.string().optional(),
  })
  .refine((data) => "value" in data && data.value !== undefined, {
    message: "value is required",
    path: ["value"],
  });
export type UpdateSetting = z.infer<typeof updateSettingSchema>;

// --- Pipeline runs (Phase 9) ---
// One row per pipeline execution, manual or scheduler-triggered. Written by
// the pipeline orchestrator; read by the observability endpoints. See
// docs/phase9-observability-memo.md for full rationale.
export const pipelineTriggerSchema = z.enum(["manual", "scheduler"]);
export type PipelineTrigger = z.infer<typeof pipelineTriggerSchema>;

export const pipelineRunStatusSchema = z.enum(["running", "completed", "cancelled", "failed"]);
export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;

export const pipelineRunSchema = z.object({
  id: z.string().uuid(),
  trigger: pipelineTriggerSchema,
  status: pipelineRunStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  fetchAdded: z.number().int().nullable(),
  fetchErrors: z.number().int().nullable(),
  analyzeAnalyzed: z.number().int().nullable(),
  analyzeErrors: z.number().int().nullable(),
  summarizeSummarized: z.number().int().nullable(),
  summarizeErrors: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
});
export type PipelineRun = z.infer<typeof pipelineRunSchema>;

// Response shape of GET /admin/pipeline/status — active run (if any) +
// most recent completed/cancelled/failed run + next scheduled fire time
// for the frontend countdown.
export const pipelineStatusSchema = z.object({
  activeRun: pipelineRunSchema.nullable(),
  lastRun: pipelineRunSchema.nullable(),
  nextRunAt: z.string().nullable(),
});
export type PipelineStatus = z.infer<typeof pipelineStatusSchema>;

// Progress events emitted by the pipeline orchestrator. Consumed by the SSE
// endpoint (Task 44) and ultimately the PipelineControl frontend. The
// `analyze-item` / `summarize-item` variants are defined here but only emitted
// once Task 41 threads per-article progress through analyze/summarize.
export type PipelineProgressEvent =
  | { type: "run-start"; runId: string; trigger: PipelineTrigger; startedAt: string }
  | { type: "fetch-start" }
  | { type: "fetch-done"; added: number; errors: number }
  | { type: "analyze-start"; total?: number }
  | { type: "analyze-item"; index: number; total: number; title: string; feedName: string }
  | { type: "analyze-done"; analyzed: number; errors: number }
  | { type: "summarize-start"; total?: number }
  | { type: "summarize-item"; index: number; total: number; title: string; feedName: string }
  | { type: "summarize-done"; summarized: number; errors: number }
  | {
      type: "run-done";
      status: PipelineRunStatus;
      durationMs: number;
      errorMessage?: string;
    };

// --- Article interactions (Phase 14) ---
// Per-article user state: viewed, read, starred, notes, user tags, follow-up,
// reading time. `id` + timestamps are nullable so the API can return a
// synthetic default for articles the user has never touched (no row exists),
// without the client having to branch on presence.

export const articleInteractionSchema = z.object({
  id: z.string().uuid().nullable(),
  articleId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  viewedAt: z.string().nullable(),
  readAt: z.string().nullable(),
  starred: z.boolean(),
  note: z.string().nullable(),
  userTags: z.array(z.string()),
  followUp: z.boolean(),
  readingSeconds: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type ArticleInteraction = z.infer<typeof articleInteractionSchema>;

// PATCH body. Every field optional — only provided fields are updated.
// `read: true` → server sets `readAt = now()`; `read: false` → clears it.
// `viewedAt` is NOT in this schema — it's server-set via a separate
// lightweight `POST /articles/:id/interaction/view` endpoint (Task 74).
export const updateArticleInteractionSchema = z.object({
  read: z.boolean().optional(),
  starred: z.boolean().optional(),
  note: z.string().nullable().optional(),
  userTags: z.array(z.string()).optional(),
  followUp: z.boolean().optional(),
  readingSeconds: z.number().int().min(0).optional(),
});
export type UpdateArticleInteraction = z.infer<typeof updateArticleInteractionSchema>;

// --- Article highlights (Phase 14B) ---
// Passage-level captures from the article detail page. Full schema mirrors
// the DB row; create schema is the POST body. Highlights are append-only +
// delete-only at this phase — no update schema until note editing becomes
// a real feature request.

export const articleHighlightSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  text: z.string(),
  note: z.string().nullable(),
  charStart: z.number().int().nullable(),
  charEnd: z.number().int().nullable(),
  createdAt: z.string(),
});
export type ArticleHighlight = z.infer<typeof articleHighlightSchema>;

export const createArticleHighlightSchema = z.object({
  text: z.string().min(1, "highlight text cannot be empty"),
  note: z.string().nullable().optional(),
  charStart: z.number().int().min(0).optional(),
  charEnd: z.number().int().min(0).optional(),
});
export type CreateArticleHighlight = z.infer<typeof createArticleHighlightSchema>;

// Cross-article highlight list response shape. Joins article metadata so the
// /highlights route can render each card with its article context + link
// back to the reader-mode detail page. `analysisId` is the article_analysis
// UUID (used for the /article/[id] URL), distinct from `articleId` which is
// the articles.id UUID.
export const highlightWithArticleSchema = z.object({
  id: z.string().uuid(),
  articleId: z.string().uuid(),
  text: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  article: z.object({
    analysisId: z.string().uuid(),
    title: z.string(),
    link: z.url(),
    feedName: z.string(),
    publishedAt: z.string().nullable(),
  }),
});
export type HighlightWithArticle = z.infer<typeof highlightWithArticleSchema>;

// --- Ranked query + response (Phase 13) ---
// Server-side filtering for GET /ranked. See phase13-server-filtering-memo.md
// for the full locked design. The query schema runs against URL search params,
// so numeric/boolean fields use z.coerce and list fields accept comma-separated
// strings that normalize to string[] | undefined.

export const RANKED_SORT_FIELDS = [
  "composite",
  "relevance",
  "importance",
  "freshness",
  "published",
  "analyzed",
] as const;
export type RankedSortField = (typeof RANKED_SORT_FIELDS)[number];

export const rankedSortSchema = z
  .string()
  .regex(/^-?(composite|relevance|importance|freshness|published|analyzed)$/, {
    message: "sort field not recognized; prefix with - for descending",
  })
  .default("-composite");

export function parseRankedSort(raw: string): {
  field: RankedSortField;
  direction: "asc" | "desc";
} {
  const desc = raw.startsWith("-");
  const field = (desc ? raw.slice(1) : raw) as RankedSortField;
  return { field, direction: desc ? "desc" : "asc" };
}

const csvList = z
  .string()
  .optional()
  .transform((v) =>
    v && v.length > 0
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  );

export const rankedQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  sources: csvList,
  categories: csvList,
  tags: csvList,
  composite_gte: z.coerce.number().min(0).max(100).optional(),
  relevance_gte: z.coerce.number().int().min(0).max(100).optional(),
  importance_gte: z.coerce.number().int().min(0).max(100).optional(),
  published_at_gte: z.iso.datetime({ offset: true }).optional(),
  published_at_lte: z.iso.datetime({ offset: true }).optional(),
  sort: rankedSortSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  include_facets: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});
export type RankedQuery = z.infer<typeof rankedQuerySchema>;

export const rankedFacetSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
});
export type RankedFacet = z.infer<typeof rankedFacetSchema>;

export const rankedFacetsSchema = z.object({
  sources: z.array(rankedFacetSchema),
  tags: z.array(rankedFacetSchema),
  categories: z.array(rankedFacetSchema),
});
export type RankedFacets = z.infer<typeof rankedFacetsSchema>;

export const rankedResponseSchema = z.object({
  rows: z.array(analyzedArticleSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  facets: rankedFacetsSchema.optional(),
});
export type RankedResponse = z.infer<typeof rankedResponseSchema>;

// --- Search (Phase 15 Task 92) ---
// Four modes (keyword via tsvector, fuzzy via pg_trgm, semantic via pgvector
// cosine, hybrid via weighted combination) over three targets (articles,
// highlights, or both). See phase15-find-memo.md for the full design.

export const SEARCH_MODES = ["keyword", "fuzzy", "semantic", "hybrid"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SEARCH_TARGETS = ["all", "articles", "highlights"] as const;
export type SearchTarget = (typeof SEARCH_TARGETS)[number];

// Shared csvList pattern (mirrors the one in rankedQuerySchema — same
// semantics: comma-separated string collapsed to `string[] | undefined`).
const searchCsvList = z
  .string()
  .optional()
  .transform((v) =>
    v && v.length > 0
      ? v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  );

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  mode: z.enum(SEARCH_MODES).default("hybrid"),
  target: z.enum(SEARCH_TARGETS).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  sources: searchCsvList,
  tags: searchCsvList,
  published_at_gte: z.iso.datetime({ offset: true }).optional(),
  published_at_lte: z.iso.datetime({ offset: true }).optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// Compact article context attached to every search result (both article and
// highlight kinds). Distinct from AnalyzedArticle — search returns a smaller
// shape focused on retrieval display.
export const searchArticleSchema = z.object({
  analysisId: z.string().uuid(),
  articleId: z.string().uuid(),
  title: z.string(),
  link: z.url(),
  feedName: z.string(),
  publishedAt: z.string().nullable(),
});
export type SearchArticle = z.infer<typeof searchArticleSchema>;

export const searchHighlightPayloadSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type SearchHighlightPayload = z.infer<typeof searchHighlightPayloadSchema>;

// `snippet` is a short text fragment with `<b>…</b>` marks around matched
// terms, produced by `ts_headline` on the server. Populated for keyword and
// hybrid modes; null for fuzzy (no position data) and semantic (no word-
// level match). Web renders it via a small regex parser that maps `<b>`
// to React `<mark>` elements — no dangerouslySetInnerHTML.
export const searchResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("article"),
    score: z.number(),
    matchedMode: z.enum(SEARCH_MODES),
    snippet: z.string().nullable(),
    article: searchArticleSchema,
  }),
  z.object({
    kind: z.literal("highlight"),
    score: z.number(),
    matchedMode: z.enum(SEARCH_MODES),
    snippet: z.string().nullable(),
    article: searchArticleSchema,
    highlight: searchHighlightPayloadSchema,
  }),
]);
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  rows: z.array(searchResultSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  query: z.string(),
  mode: z.enum(SEARCH_MODES),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// --- Allowed tag vocabulary (memo Q5) ---
export const ALLOWED_TAGS = [
  // Topic areas
  "ai-research",
  "ml-theory",
  "nlp",
  "computer-vision",
  "reinforcement-learning",
  "robotics",
  "ai-safety",
  "ai-ethics",
  "ai-regulation",
  // Products/releases
  "model-release",
  "product-launch",
  "feature-update",
  "open-source",
  // Content types
  "tutorial",
  "explainer",
  "opinion",
  "paper",
  "benchmark",
  "interview",
  // Entities
  "openai",
  "anthropic",
  "google",
  "meta",
  "microsoft",
  "apple",
  "nvidia",
  "deepmind",
  "huggingface",
  "mistral",
  // Applications
  "coding",
  "agents",
  "chatbot",
  "multimodal",
  "fine-tuning",
  "rag",
  "inference",
  "video-generation",
  "audio-generation",
  "dataset",
] as const;
export type AllowedTag = (typeof ALLOWED_TAGS)[number];

// --- Default settings (source of truth for seeds and fallback lookups) ---
export interface DefaultSetting {
  value: unknown;
  type: SettingValueType;
  description: string;
}

export const DEFAULT_SETTINGS: Record<string, DefaultSetting> = {
  // Scoring weights (approx sum 1.0)
  weight_relevance: {
    value: 0.15,
    type: "number",
    description: "Weight for relevance in composite score",
  },
  weight_importance: {
    value: 0.35,
    type: "number",
    description: "Weight for importance in composite score",
  },
  weight_freshness: {
    value: 0.25,
    type: "number",
    description: "Weight for freshness (time decay) in composite score",
  },
  weight_authority: {
    value: 0.1,
    type: "number",
    description: "Weight for source authority in composite score",
  },
  weight_uniqueness: {
    value: 0.15,
    type: "number",
    description: "Weight for uniqueness (inverse duplicate) in composite score",
  },

  // Freshness decay
  freshness_lambda: {
    value: 0.03,
    type: "number",
    description: "Exponential decay rate per hour for freshness (0.03 ≈ 23h half-life)",
  },

  // Tag vocabulary
  allowed_tags: {
    value: ALLOWED_TAGS as readonly string[],
    type: "json",
    description: "Allowed tag vocabulary — LLM picks from this list for each article",
  },

  // Filters
  min_score_default: {
    value: 0,
    type: "number",
    description: "Default minimum score threshold for the ranked feed",
  },

  // Scheduler
  scheduler_enabled: {
    value: true,
    type: "boolean",
    description: "Master scheduler on/off switch",
  },
  fetch_interval: {
    value: "0 */2 * * *",
    type: "string",
    description: "How often the scheduler fetches feeds (cron expression)",
  },
  analyze_enabled: {
    value: true,
    type: "boolean",
    description: "Allow analyze LLM task to run automatically in scheduler",
  },
  summarize_enabled: {
    value: true,
    type: "boolean",
    description: "Allow summarize LLM task to run automatically in scheduler",
  },
  analyze_batch_size: {
    value: 100,
    type: "number",
    description: "Max articles to analyze per scheduler tick",
  },
  summarize_batch_size: {
    value: 100,
    type: "number",
    description: "Max articles to summarize per scheduler tick",
  },

  // LLM model selection (per-task primary + fallback)
  llm_model_analyze: {
    value: "gpt-5.1-codex-mini",
    type: "string",
    description: "Primary LLM model for analyze task (classification: relevance, importance, tags)",
  },
  llm_model_analyze_fallback: {
    value: "gemma3:27b",
    type: "string",
    description: "Fallback LLM model for analyze task if primary fails",
  },
  llm_model_summarize: {
    value: "gpt-5.3-codex",
    type: "string",
    description: "Primary LLM model for summarize task (text generation)",
  },
  llm_model_summarize_fallback: {
    value: "gemma3:27b",
    type: "string",
    description: "Fallback LLM model for summarize task if primary fails",
  },

  // Embeddings (Phase 15)
  embedding_model_name: {
    value: "bge-m3",
    type: "string",
    description:
      "Embedding model for semantic search. Changing this requires re-embedding existing content via the backfill job — dimensions must match the vector(1024) column.",
  },

  // UI theme
  theme: {
    value: "dark",
    type: "string",
    description: "UI theme: light, dark, or system (follows OS preference)",
  },
};

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
