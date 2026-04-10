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
| 11 | Dashboard | Not started | Today's ranked feed |
| 12 | Feed management page | Not started | Add/remove/toggle feeds |
| 13 | Article detail view | Not started | Full content + LLM summary |
| 14 | Filter/search controls | Not started | By topic, source, date |

## Phase 4: iOS App

| # | Task | Status | Notes |
|---|------|--------|-------|
| 15 | iOS project setup | Not started | Swift package, API client |
| 16 | Feed reader view | Not started | Ranked articles list |
| 17 | Push notifications | Not started | High-score article alerts |

## What's Working

- POC: RSS feed fetching validated (14/14 AI sources working, see poc/ folder)
- Monorepo: Turborepo + pnpm workspace with 3 packages (api, web, shared)
- API: Hono server on port 3001 with health check + feed management endpoints (CRUD, manual fetch triggers) + ranked articles API (list/filter/paginate, clusters, detail)
- Web: Next.js App Router on port 3000 with Tailwind CSS v4
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

Task 11: Dashboard — today's ranked feed (Phase 3: Web UI begins).

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
