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
  lastFetchedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type Feed = z.infer<typeof feedSchema>;

export const createFeedSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  category: z.string().optional(),
  enabled: z.boolean().optional(),
});

export type CreateFeed = z.infer<typeof createFeedSchema>;

export const updateFeedSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.url().optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  authorityScore: z.number().min(0).max(1).optional(),
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
    value: "*/30 * * * *",
    type: "string",
    description: "Cron expression for feed fetching",
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

  // UI theme
  theme: {
    value: "dark",
    type: "string",
    description: "UI theme: light, dark, or system (follows OS preference)",
  },
};

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
