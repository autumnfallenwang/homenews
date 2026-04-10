# HomeNews — Design Plan

## Concept

A personal AI news intelligence system. Ingest broadly from RSS and open web sources, then use LLM to filter, rank, deduplicate, and summarize — giving the user control over what matters, not an algorithm.

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo + pnpm |
| Web Frontend | Next.js (App Router) |
| iOS App | Swift + SwiftUI |
| Backend API | Hono |
| Validation | Zod (shared schemas) |
| Database | PostgreSQL + Drizzle ORM |
| Scheduled Jobs | node-cron (in API process) |
| LLM | Claude Haiku (filtering, ranking, summarization) |

## Data Model

```
Feed       { id, name, url, category, enabled, lastFetchedAt, createdAt }
Article    { id, feedId, title, link, summary, content, author, publishedAt, fetchedAt }
Ranked     { id, articleId, score, tags, cluster, llmSummary, rankedAt }
```

## Core Design Principles

- **Ingest broadly, filter later** — no intelligence at ingestion
- **RSS as primary source** — free, structured, no auth, no rate limits
- **LLM generates signals, not decisions** — hybrid ranking (deterministic + LLM)
- **User controls the output** — no hidden personalization

## Source Strategy

### Layer A — RSS (primary)
- AI/tech news: The Verge, Ars Technica, TechCrunch, VentureBeat, MIT Tech Review
- Research: arXiv cs.CL, cs.AI, cs.LG
- Company blogs: OpenAI, Google AI, Hugging Face

### Layer B — Open Web Signals
- Hacker News (best/frontpage)
- Reddit (r/MachineLearning, r/LocalLLaMA)

### Layer C — News APIs (future)
- Supplemental search/global coverage, free tier only

## Build Phases

### Phase 1 — Ingestion + Storage
1. Scaffold monorepo (Turborepo + pnpm + Hono + Next.js)
2. PostgreSQL + Drizzle ORM schema (feeds, articles)
3. RSS fetcher service (feedparser equivalent in TS)
4. Scheduled feed ingestion (node-cron)
5. Feed management API (CRUD feeds, manual trigger)

### Phase 2 — LLM Processing
6. Deduplication (URL + title similarity)
7. LLM filtering — relevance scoring per article
8. LLM clustering — group related articles
9. LLM summarization — per-article and per-cluster summaries
10. Ranked articles API

### Phase 3 — Web UI
11. Dashboard — today's ranked feed
12. Feed management page
13. Article detail view
14. Filter/search controls

### Phase 4 — LLM Registry Refactor
15. LLM task registry — central config for prompts, models, output formats per task
16. Per-task model config — env var overrides (LLM_MODEL_SCORING, LLM_MODEL_SUMMARIZATION, etc.)
17. Unified LLM executor — single llmExecute() with auto-parsing, fallback, logging

### Phase 5 — iOS App
18. iOS project setup
19. Feed reader view
20. Push notifications for high-score articles

### Phase 6 — Future Enhancements (deferred)
- Full article fetching for thin feeds
- Custom topic profiles
- Trend detection over time
- Export/share digests
