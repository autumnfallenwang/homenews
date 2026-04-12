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
| 18 | Schema refactor | Not started | New `article_analysis` table, `feeds.authority_score`, view, drop old `ranked` |
| 19 | Settings infrastructure | Not started | DB table (multi-user forward-compat), API, Zod schemas, seeds for weights/λ/tags/scheduler config |
| 20 | LLM registry: `analyze` task | Not started | Prompt template with `{{ALLOWED_TAGS}}` from settings, drop old `scoring`/`clustering` |
| 21 | Analyze + summarize pipeline | Not started | New `analyze.ts`, rename `summarization.ts` → `summarize.ts`, scheduler reads enable toggles + batch sizes from settings |
| 22 | Ranked API with composite score | Not started | SQL compute via view + settings, COALESCE for missing dates |
| 23 | Manual pipeline trigger API | Not started | `POST /admin/pipeline/{fetch,analyze,summarize,run-all}` endpoints |
| 24 | Settings page (web) | Not started | `/settings` route with weights, λ, tags, scheduler, pipeline control buttons, minScore |
| 25 | Dashboard upgrade | Not started | Tag multi-select filter, weight sliders, multi-view sort |
| 26 | Feed management upgrade | Not started | Authority score column in feeds table UI |

## Phase 6: iOS App

| # | Task | Status | Notes |
|---|------|--------|-------|
| 27 | iOS project setup | Not started | Swift package, API client |
| 28 | Feed reader view | Not started | Ranked articles list |
| 29 | Push notifications | Not started | High-score article alerts |

## What's Working

- POC: RSS feed fetching validated (14/14 AI sources working, see poc/ folder)
- Monorepo: Turborepo + pnpm workspace with 3 packages (api, web, shared)
- API: Hono server on port 3001 with health check + feed management endpoints (CRUD, manual fetch triggers) + ranked articles API (list/filter/paginate, clusters, detail)
- Web: Next.js App Router on port 3000 with Tailwind CSS v4 + shadcn/ui components + dashboard (with cluster/search/source filters) + feed management page + article detail view
- Shared: Zod schemas for Feed, Article, Ranked, RankedArticle, ClusterInfo, CreateFeed, UpdateFeed consumed by api and web
- Database: Drizzle ORM schema (feeds, articles, ranked), postgres.js connection, drizzle-kit config, seed script with 9 AI/LLM feeds
- RSS Fetcher: rss-parser integration with pure mapping layer, fetchFeed/fetchAllFeeds services, duplicate handling via onConflictDoNothing
- Scheduler: node-cron job runs fetchAllFeeds every 30 min (configurable via FETCH_INTERVAL), noOverlap protection, start/stop exports
- Deduplication: URL-level via unique constraint + title similarity via bigram Dice coefficient, runs inline during fetch, 48h window
- LLM Registry: Central task config (llm-registry.ts) — prompts, output formats, per-task model selection via env vars
- LLM Executor: Unified llmExecute() — auto JSON extraction, model fallback (LLM_FALLBACK_MODEL), timing logs
- LLM Scoring: Relevance scoring (0-100 + tags) via executor, runs after fetch in scheduler
- LLM Clustering: Batch clustering of scored articles into topic groups, labels stored in ranked.cluster
- LLM Summarization: Per-article 2-3 sentence summaries via LLM, stored in ranked.llmSummary, runs after clustering in scheduler pipeline
- Tooling: Biome lint, Vitest (107 tests passing), TypeScript strict mode
- DB scripts: Docker-based PostgreSQL start/stop/reset

## What's Next

Task 18: Schema refactor (Phase 5: Composite Scoring + Settings begins).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
