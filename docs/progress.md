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
| 15 | LLM task registry | Not started | Central config for all LLM tasks (prompts, models, output formats) |
| 16 | Per-task model config | Not started | Env var overrides per task (LLM_MODEL_SCORING, etc.) |
| 17 | Unified LLM executor | Not started | Single llmExecute() with auto-parsing, fallback, logging |

## Phase 5: iOS App

| # | Task | Status | Notes |
|---|------|--------|-------|
| 18 | iOS project setup | Not started | Swift package, API client |
| 19 | Feed reader view | Not started | Ranked articles list |
| 20 | Push notifications | Not started | High-score article alerts |

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
- LLM Scoring: OpenAI-compatible client via local llmgw, relevance scoring (0-100 + tags), runs after fetch in scheduler, graceful error handling
- LLM Clustering: Batch clustering of scored articles into topic groups, labels stored in ranked.cluster
- LLM Summarization: Per-article 2-3 sentence summaries via LLM, stored in ranked.llmSummary, runs after clustering in scheduler pipeline
- Tooling: Biome lint, Vitest (82 tests passing), TypeScript strict mode
- DB scripts: Docker-based PostgreSQL start/stop/reset

## What's Next

Debug current pipeline, then Task 15: LLM task registry (Phase 4: LLM Registry Refactor).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
