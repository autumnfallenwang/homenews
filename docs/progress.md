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
| 25 | Manual pipeline trigger API | Done | `POST /admin/pipeline/{fetch,analyze,summarize,run-all}` endpoints with settings-driven batch sizes and `?limit=` override |
| 26 | Settings page (web) | Done | `/settings` route with scoring weights, λ, scheduler config, LLM models, tag vocabulary, pipeline control buttons |
| 27 | Dashboard upgrade | Done | Tag multi-select filter with counts, multi-view sort (composite/relevance/importance/freshness), composite score badge |
| 28 | Feed management upgrade | Done | Authority score column in feeds table with inline editable input |

## Phase 6: iOS App (SKIPPED — deferred indefinitely)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 29 | iOS project setup | Skipped | Swift package, API client |
| 30 | Feed reader view | Skipped | Ranked articles list |
| 31 | Push notifications | Skipped | High-score article alerts |

## Phase 7: UI Redesign + Settings Consolidation (COMPLETE)

See [ui-design-memo.md](ui-design-memo.md) for the design rationale, aesthetic direction (newsroom workstation), and architectural decisions.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 32 | Foundation: theme tokens + fonts + nav | Done | Warm-dark/amber palette in globals.css, Fraunces display + Geist Mono via next/font, forced dark mode, restyled top nav with mono uppercase links + Fraunces wordmark + system status dot. PipelineControl component scaffolded for Task 33 |
| 33 | Dashboard with pipeline control | Done | PipelineControl wired into `/`, restyled page header with Fraunces title + mono metric strip, hairline-divided article rows, restyled filter controls, restyled article detail page, removed pipeline buttons from settings |
| 34 | Tabbed settings layout | Done | Sidebar nav with mono numeric prefixes + dirty dots, 5 sections (Scoring/Freshness/Scheduler/Models/Tags), per-tab dirty tracking, sticky SaveBar, unsaved-changes Dialog, URL state via `?tab=`, immediate save for tags |
| 35 | Theme setting | Done | `theme` setting key (light/dark/system) in DB, ThemeApplier client component with system-mode media query listener, cookie hydration via SSR layout, Theme tab in settings sidebar with 3-option grid |
| 36 | Feeds in settings | Done | FeedList moved into `07 FEEDS` tab via `FeedsSection` wrapper, top-nav Feeds link dropped, `/feeds` redirects to `/settings?tab=feeds` |

## Phase 8: Pipeline tuning (CLOSED — hotfixes only)

Triggered by a diagnostic pass on 2026-04-13 that revealed the analyze queue was starving non-OpenAI feeds and the `/ranked` endpoint was dominated by historical articles. Root cause was the analyze query (missing `ORDER BY`, no date filter) — fixed in the hotfixes logged in [changelog.md](changelog.md). The design-level follow-ups that were originally scoped as tasks 37/38 were closed after the hotfixes landed because the behavior they were meant to address no longer exists.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 37 | Historical backfill policy | Won't do | The 14-day analyze filter (hotfix #1) already prevents LLM spend on old rows. Purging the ~2500 historical unanalyzed rows is disk/tidiness work with no behavior impact at this scale. Revisit only if row counts become a real problem. |
| 38 | Ranked recency filter | Won't do | Composite score already owns recency via `weight_freshness * EXP(-λh)`. Adding a hard cutoff in `/ranked` would be a second mechanism for the same concern and create edge effects at the boundary. If old articles still dominate after the analyze fan-out, tune `freshness_lambda` in settings instead (runtime-tunable, no code change). |

## Phase 9: Pipeline observability

See [phase9-observability-memo.md](phase9-observability-memo.md) for the SSE-vs-polling decision, cancel semantics, and the "scheduler shares the same orchestrator" architectural choice. Design reference at [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html) — open in a browser to see the three production states (idle / running / history-open) in the newsroom-workstation aesthetic.

Triggered by the observation that an 8-minute pipeline run leaves the user staring at an unchanging spinner with no signal about progress, phase, cancellability, or history. Scope: single Run button with real per-article progress via SSE, explicit cancel, persistent run history shared by manual and scheduler runs, next-run countdown computed from the cron expression. Not in scope: job queues, persistent event storage, retry/resume, WebSockets.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 39 | `pipeline_runs` schema + drizzle migration | Not started | Columns: id, trigger (manual\|scheduler), status (running\|completed\|cancelled\|failed), started_at, ended_at, duration_ms, fetch_added, fetch_errors, analyze_analyzed, analyze_errors, summarize_summarized, summarize_errors, error_message |
| 40 | `services/pipeline.ts` orchestrator | Not started | Single `runPipelineWithProgress(trigger, onProgress?, signal?)` function. In-memory `activeRuns: Map<id, { cancel: boolean }>`. Writes start + final rows. Used by both SSE endpoint and scheduler. |
| 41 | Thread `onProgress` + cancel signal into `analyze.ts` and `summarize.ts` | Not started | Optional params; emit `{ index, total, title, feedName }` between articles, check signal before each LLM call. Completes in-flight call before breaking on cancel (no mid-call abort). |
| 42 | Scheduler refactor to call `runPipelineWithProgress(trigger="scheduler")` | Not started | Scheduler stops calling fetch/analyze/summarize directly — all cron ticks now land in `pipeline_runs` history. |
| 43 | `services/cron-next.ts` + `cron-parser` dependency | Not started | Computes next-fire time from current `fetch_interval` setting. Shared by scheduler and status endpoint. |
| 44 | API surface: replace 4 pipeline POSTs with 4 observability endpoints | Not started | `GET /admin/pipeline/stream` (SSE), `POST /admin/pipeline/runs/:id/cancel`, `GET /admin/pipeline/runs?limit=20&trigger=`, `GET /admin/pipeline/status` (active run + next-scheduled timestamp). Old fetch/analyze/summarize/run-all POSTs removed. |
| 45 | `PipelineControl` rewrite — idle / running / done state machine | Not started | Owns EventSource connection. Single Run button morphs into Cancel during active run. Phase indicator with 3 columns, live article ticker (Fraunces italic), elapsed chronometer, accumulating totals. Reference: [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html). |
| 46 | `PipelineHistory` drawer component | Not started | Collapsible under the main strip via disclosure row. Segmented filter (All/Manual/Scheduled), hairline row list with click-to-expand failure/cancellation detail. Polls `/admin/pipeline/runs` on mount + window focus + 60s interval while tab visible. |
| 47 | Next-scheduled countdown ticker | Not started | Computed client-side from `fetch_interval` setting, 30s `setInterval`. Authoritative next-run timestamp comes from `GET /admin/pipeline/status` at mount to avoid clock drift. |
| 48 | Tests: `pipeline.test.ts` — cancellation + progress callback + phase boundaries | Not started | Unit tests for orchestrator; SSE event ordering verified via direct call to the service. |
| 49 | Drop obsolete helpers in `apps/web/src/lib/api.ts` | Not started | Remove the 4 old `triggerPipeline*` helpers. Add `fetchPipelineStatus()`, `fetchPipelineRuns()`, `cancelPipelineRun(id)`. |

## What's Working

- POC: RSS feed fetching validated (14/14 AI sources working, see poc/ folder)
- Monorepo: Turborepo + pnpm workspace with 3 packages (api, web, shared)
- API: Hono server on port 3001 with health check + feed management endpoints (CRUD, manual fetch triggers) + ranked articles API (composite-scored list/filter/paginate, detail, includes freshness + feedAuthorityScore) + settings API (GET list, GET/PATCH by key, reset) + admin pipeline triggers (`POST /admin/pipeline/{fetch,analyze,summarize,run-all}`)
- Web: Next.js App Router on port 3000 with Tailwind CSS v4 + shadcn/ui components, newsroom-workstation theme (warm dark + amber, Fraunces display, Geist Mono for data, light/dark/system theme switcher) + dashboard (PipelineControl strip at top, Fraunces page header, mono metric strip, hairline-divided article rows, segmented sort + chip filters) + article detail view (newspaper-style with score grid + amber-bordered AI summary) + tabbed settings page (sidebar nav with dirty indicators, per-tab Save/Cancel, unsaved-changes Dialog, URL deep-linking via ?tab=, sections for Scoring/Freshness/Scheduler/LLM Models/Tag Vocabulary/Theme/Feeds — `/feeds` redirects to `/settings?tab=feeds`)
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
- Tooling: Biome lint, Vitest (131 tests passing), TypeScript strict mode
- DB scripts: Docker-based PostgreSQL start/stop/reset

## What's Next

Phase 9: Pipeline observability — plan + design reference locked. Design memo at [phase9-observability-memo.md](phase9-observability-memo.md), visual reference at [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html). Ready to implement starting at task 39 (DB schema). Implementation order is strict: schema → orchestrator → service threading → scheduler refactor → cron util → API → frontend → tests. Each step gates the next.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
