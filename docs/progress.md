# HomeNews — Progress

## Phase 1: Ingestion + Storage

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Monorepo scaffold | Done | Turborepo + pnpm, Hono API + Next.js Web + shared package, Biome + Vitest |
| 2 | PostgreSQL + Drizzle ORM schema | Done | feeds, articles tables + Drizzle config + seed script |
| 3 | RSS fetcher service | Done | rss-parser + mapper + feed-fetcher service |
| 4 | Scheduled feed ingestion | Done | node-cron scheduler with noOverlap, configurable FETCH_INTERVAL |
| 5 | Feed management API | Done | CRUD + manual fetch triggers, Zod validation |

## Phase 2: LLM Processing

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6 | Deduplication | Done | URL unique constraint + bigram title similarity (Dice coefficient) |
| 7 | LLM filtering | Done | OpenAI-compatible LLM client + relevance scoring (0-100) + ranked table |
| 8 | LLM clustering | Done | Batch LLM clustering with topic labels |
| 9 | LLM summarization | Done | Per-article summaries via LLM, stored in ranked.llmSummary |
| 10 | Ranked articles API | Done | GET /ranked (list, filter, paginate), GET /ranked/clusters, GET /ranked/:id |

## Phase 3: Web UI

| # | Task | Status | Notes |
|---|------|--------|-------|
| 11 | Dashboard | Done | Server-component dashboard with stats, cluster filters, article cards, shadcn/ui |
| 12 | Feed management page | Done | /feeds page with table, add dialog, enable/disable toggle, delete, manual fetch trigger |
| 13 | Article detail view | Done | /article/[id] detail page with AI summary, metadata, tags, original link |
| 14 | Filter/search controls | Done | Cluster filter via URL params, text search, source filter (all client-side) |

## Phase 4: LLM Registry Refactor

| # | Task | Status | Notes |
|---|------|--------|-------|
| 15 | LLM task registry | Done | Central registry with task configs (prompts, output formats), services import from registry |
| 16 | Per-task model config | Done | Per-task env var overrides (LLM_MODEL_SCORING, etc.) with fallback chain |
| 17 | Unified LLM executor | Done | llmExecute() with auto JSON extraction, model fallback, timing logs |

## Phase 5: Composite Scoring + Settings

See [composite-scoring-memo.md](composite-scoring-memo.md) for full design and all 15 open-question decisions.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 18 | Schema refactor | Done | `article_analysis` table, `feeds.authority_score`, view, clustering removed, shared/web updated |
| 19 | Settings infrastructure | Done | DB table (forward-compat nullable user_id), CRUD API, Zod schemas, DEFAULT_SETTINGS seed, auto-seed on startup |
| 20 | Type rename cleanup | Done | `Ranked`/`RankedArticle` → `ArticleAnalysis`/`AnalyzedArticle` in shared + web consumers. URL `/ranked` kept |
| 21 | Move LLM model selection to settings | Done | Per-task primary + fallback in settings, async `getModelForTask()`/`getFallbackModelForTask()`, executor hot-reads per call, removed model env vars |
| 22 | LLM registry: `analyze` task | Done | New `analyze` + `summarize` tasks, `getSystemPrompt()` with `{{ALLOWED_TAGS}}` templating, model settings keys, legacy tasks kept until Task 23 |
| 23 | Analyze + summarize pipeline | Done | New `analyze.ts` (relevance + importance + controlled tags), `summarize.ts`, scheduler reads enable toggles + batch sizes from settings, legacy `scoring`/`summarization`/`clustering` tasks dropped |
| 24 | Ranked API with composite score | Done | SQL compute via `article_analysis_with_feed` view + settings, freshness decay, COALESCE for missing dates, sorted by composite |
| 25 | Manual pipeline trigger API | Not started | `POST /admin/pipeline/{fetch,analyze,summarize,run-all}` endpoints |
| 26 | Settings page (web) | Not started | `/settings` route with weights, λ, tags, scheduler, pipeline control buttons, minScore |
| 27 | Dashboard upgrade | Not started | Tag multi-select filter, weight sliders, multi-view sort |
| 28 | Feed management upgrade | Not started | Authority score column in feeds table UI |

## Phase 6: iOS App

| # | Task | Status | Notes |
|---|------|--------|-------|
| 29 | iOS project setup | Not started | Swift package, API client |
| 30 | Feed reader view | Not started | Ranked articles list |
| 31 | Push notifications | Not started | High-score article alerts |

## What's Working

- POC: RSS feed fetching validated (14/14 AI sources working, see poc/ folder)
- Monorepo: Turborepo + pnpm workspace with 3 packages (api, web, shared)
- API: Hono server on port 3001 with health check + feed management endpoints (CRUD, manual fetch triggers) + ranked articles API (composite-scored list/filter/paginate, detail, includes freshness + feedAuthorityScore) + settings API (GET list, GET/PATCH by key, reset)
- Web: Next.js App Router on port 3000 with Tailwind CSS v4 + shadcn/ui components + dashboard (with cluster/search/source filters) + feed management page + article detail view
- Shared: Zod schemas for Feed (with authorityScore), Article, ArticleAnalysis (relevance + importance), AnalyzedArticle, CreateFeed, UpdateFeed, Setting, UpdateSetting + DEFAULT_SETTINGS + ALLOWED_TAGS vocabulary (~39 tags)
- Database: Drizzle ORM schema (feeds + authority_score, articles, article_analysis, settings with nullable user_id), article_analysis_with_feed view, seed scripts for feeds + settings
- RSS Fetcher: rss-parser integration with pure mapping layer, fetchFeed/fetchAllFeeds services, duplicate handling via onConflictDoNothing
- Scheduler: node-cron job runs fetchAllFeeds every 30 min (configurable via FETCH_INTERVAL), noOverlap protection, start/stop exports
- Deduplication: URL-level via unique constraint + title similarity via bigram Dice coefficient, runs inline during fetch, 48h window
- LLM Registry: Central task config (llm-registry.ts) — prompts, output formats, per-task model selection via settings; only `analyze` + `summarize` tasks remain
- LLM Executor: Unified llmExecute() — auto JSON extraction, model fallback from settings, timing logs
- LLM Analyze: New `analyze.ts` service produces relevance (0-100), importance (0-100), and controlled-vocabulary tags in one LLM call; tags filtered against `allowed_tags` setting with unknown-tag warnings
- LLM Summarize: `summarize.ts` produces 2-3 sentence per-article summaries via `summarize` task
- Scheduler: reads `scheduler_enabled` / `analyze_enabled` / `summarize_enabled` / `analyze_batch_size` / `summarize_batch_size` from settings — hot-controllable without restart
- Composite ranking: `GET /ranked` computes `compositeScore = w_rel*rel + w_imp*imp + w_fresh*EXP(-λ*hours) + w_auth*authorityScore + w_uniq*1.0` at query time, sorted DESC. Weights + λ read from settings per request — hot-tunable without restart
- Settings: Central DB-backed key/value store (settings table) with service (getSetting, setSetting, seedDefaults), CRUD API, forward-compat for multi-user via nullable user_id, auto-seed on server startup. Holds weights, λ, tag vocab, scheduler config, per-task LLM model selection (primary + fallback)
- LLM model selection: `getModelForTask()`/`getFallbackModelForTask()` read from settings at call time — hot-swap without restart
- LLM prompt templating: `getSystemPrompt()` resolves `{{ALLOWED_TAGS}}` placeholder from settings for `analyze` task; static prompts returned as-is for other tasks
- Tooling: Biome lint, Vitest (125 tests passing), TypeScript strict mode
- DB scripts: Docker-based PostgreSQL start/stop/reset

## What's Next

Task 25: Manual pipeline trigger API (POST /admin/pipeline/{fetch,analyze,summarize,run-all}).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
