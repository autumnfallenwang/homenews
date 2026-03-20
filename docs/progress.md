# HomeNews — Progress

## Phase 1: Ingestion + Storage

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Monorepo scaffold | Not started | Turborepo + pnpm, Hono API + Next.js Web + shared package, Biome + Vitest |
| 2 | PostgreSQL + Drizzle ORM schema | Not started | feeds, articles tables |
| 3 | RSS fetcher service | Not started | Parse RSS/Atom feeds |
| 4 | Scheduled feed ingestion | Not started | node-cron in API process |
| 5 | Feed management API | Not started | CRUD feeds, manual trigger fetch |

## Phase 2: LLM Processing

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6 | Deduplication | Not started | URL + title similarity |
| 7 | LLM filtering | Not started | Relevance scoring |
| 8 | LLM clustering | Not started | Group related articles |
| 9 | LLM summarization | Not started | Per-article and per-cluster |
| 10 | Ranked articles API | Not started | Serve processed feed |

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

## What's Next

Task 1: Scaffold monorepo.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
