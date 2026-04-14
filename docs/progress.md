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

## Phase 9: Pipeline observability (COMPLETE)

See [phase9-observability-memo.md](phase9-observability-memo.md) for the SSE-vs-polling decision, cancel semantics, and the "scheduler shares the same orchestrator" architectural choice. Design reference at [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html) — open in a browser to see the three production states (idle / running / history-open) in the newsroom-workstation aesthetic.

Triggered by the observation that an 8-minute pipeline run leaves the user staring at an unchanging spinner with no signal about progress, phase, cancellability, or history. Scope: single Run button with real per-article progress via SSE, explicit cancel, persistent run history shared by manual and scheduler runs, next-run countdown computed from the cron expression. Not in scope: job queues, persistent event storage, retry/resume, WebSockets.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 39 | `pipeline_runs` schema + drizzle migration | Done | `pipelineRuns` table in schema.ts with 13 columns + `pipeline_runs_started_at_idx` descending index on started_at. `PipelineRun` + `PipelineTrigger` + `PipelineRunStatus` Zod schemas exported from shared package. 4 new db.test.ts cases (total 135 passing). Schema pushed via drizzle-kit push (no migrations file — matches existing project workflow). |
| 40 | `services/pipeline.ts` orchestrator | Done | `runPipelineWithProgress(trigger, onProgress?)` lives in `services/pipeline.ts`. In-memory `activeRuns` Map enforces singleton via `PipelineBusyError`. Inserts start row, runs fetch→analyze→summarize, updates final row. Phase-level cancel checks between phases (mid-phase cancel is Task 41). Respects `analyze_enabled`/`summarize_enabled` toggles. Full `PipelineProgressEvent` discriminated union defined in shared package (item-level events are placeholders until Task 41). 16 new unit tests in `pipeline.test.ts` — happy path, singleton enforcement, phase toggles, cancellation, error handling, active-run lifecycle. 151 tests passing. |
| 41 | Thread `onProgress` + cancel signal into `analyze.ts` and `summarize.ts` | Done | Both services accept `options: { onProgress?, signal? }` as optional second arg. Each emits `analyze-start/item×N/done` (or `summarize-*` equivalents); `feedName` now joined from the `feeds` table so per-article events carry it. Cancel check happens before each LLM call — in-flight work always completes. Orchestrator stopped emitting phase-start/done and now passes the callback + `activeRuns[runId]` as `signal` through to each service. Existing callers (`admin.ts`, `scheduler.ts`) unchanged because the options param is optional. `pipeline.test.ts` updated with `stubAnalyze` / `stubSummarize` relay helpers + revised `happyPathDefaults`. 151 tests passing (unchanged count — threading task, not new coverage; dedicated service-level progress tests deferred to Task 48). |
| 42 | Scheduler refactor to call `runPipelineWithProgress(trigger="scheduler")` | Done | Scheduler dropped from ~90 lines to ~15 lines of business logic. Tick callback is now a one-liner — `scheduler_enabled` check + `runPipelineWithProgress("scheduler")` + graceful `PipelineBusyError` handling. New exported `runSchedulerTick()` function is directly testable without standing up node-cron. Cron ticks now write to `pipeline_runs` history automatically via the orchestrator. 4 new tests (155 passing). |
| 43 | `services/cron-next.ts` + `cron-parser` dependency | Done | Added `cron-parser@^5.5.0` to `apps/api`. New `getNextScheduledRunAt()` pure function reads `scheduler_enabled` + `fetch_interval` from settings, parses via `CronExpressionParser.parse()`, returns `Date \| null`. Silent null on malformed cron (caller renders as "—"). 8 unit tests (163 passing). Primary consumer: `GET /admin/pipeline/status` in Task 44. |
| 44 | API surface: replace 4 pipeline POSTs with 4 observability endpoints | Done | `admin.ts` rewritten: `GET /pipeline/stream` (SSE via `streamSSE` from `hono/streaming`), `POST /pipeline/runs/:id/cancel`, `GET /pipeline/runs?limit=20&trigger=`, `GET /pipeline/status`. Old fetch/analyze/summarize/run-all POSTs + helper (`ms`, `logFetchResults`) removed entirely. Singleton enforcement: `/stream` returns 409 with the active runId if a run is already in progress. `PipelineStatus` schema added to shared package. `mapPipelineRunRow` + `RawPipelineRunRow` exported from `pipeline.ts` for admin.ts to reuse. `onProgress` callback signature widened to `void \| Promise<void>` across pipeline.ts/analyze.ts/summarize.ts so services can `await stream.writeSSE` for SSE backpressure. 15 new admin.test.ts tests (8 old tests dropped). 170 tests passing. |
| 45 | `PipelineControl` rewrite — idle / running / done state machine | Done | Full component rewrite consuming `GET /admin/pipeline/stream` via native `EventSource`. Reducer-based state machine over `PipelineProgressEvent`, idle/running views, elapsed chronometer (1s tick), phase indicator with 3 columns + progress bars, Fraunces italic live ticker, accumulating totals, Cancel button that flips to "Cancelling" until the server emits run-done. 700ms pause after run-done before transitioning to idle + `router.refresh()`. New helpers `fetchPipelineStatus`, `cancelPipelineRun`, `PIPELINE_STREAM_URL` in `apps/web/src/lib/api.ts`. `PipelineStatus` schema extended with `lastRun` (composed server-side in `/status` endpoint). 5 new CSS utilities in globals.css (`pipeline-hot-pulse`, `pipeline-colon-blink`, `pipeline-progress-bar`, `pipeline-running-wash`). Web build clean, 170 api tests still passing. Reference: [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html). |
| 46 | `PipelineHistory` drawer component | Done | New `pipeline-history.tsx` (~350 lines) with segmented filter (All/Manual/Scheduled), hairline 6-column row grid (trigger chip / status glyph / relative+absolute time / duration / inline counts / chevron), click-to-expand detail panel with status-colored left border, `phaseSummary()` helper. Polls `/admin/pipeline/runs` on mount, filter change, window focus, parent `refreshKey` bump (after run-done), and 60s interval while tab is visible (gated on `visibilitychange`). Expanded state stored as `Set<string>` keyed by run id; survives polling re-renders via stable keys. `PipelineControl` gets `historyOpen` + `historyRefreshKey` state, a disclosure row with rotating chevron, and mounts `PipelineHistory` conditionally. Web build clean, 170 api tests still passing. Dashboard bundle: 7.01 → 8.76 kB. |
| 47 | Next-scheduled countdown ticker | Done | `NextPill` refactored with internal `setInterval` (30s cadence) + `formatCountdown()` helper producing "in 1h 47m" / "in 47m" / "in 2h" / "any moment" labels from the server-authoritative `nextRunAt` prop. Interval is scoped to the pill so it only runs while the idle view is visible. Removed now-unused `formatAbsoluteTime` helper. |
| 48 | Tests: `pipeline.test.ts` — cancellation + progress callback + phase boundaries | Done | 4 new tests covering the per-article event threading contract: full 13-event sequence (start + items + done for each phase), async onProgress ordering preservation (with microtask delay), mid-analyze cancel → summarize skipped, mid-summarize cancel → run marked cancelled. 174 passing. Also **fixed a latent bug** in `pipeline.ts`: mid-summarize cancellation used to finalize as `completed` because the orchestrator had no post-Phase-3 cancel check — added one before the final-status transition. Logged in [changelog.md](changelog.md). |
| 49 | Drop obsolete helpers in `apps/web/src/lib/api.ts` | Done | Removed the 4 old `triggerPipeline*` helpers + their result interfaces. `fetchPipelineStatus` / `fetchPipelineRuns` / `cancelPipelineRun` / `PIPELINE_STREAM_URL` had already landed in Tasks 45-46. Grep confirmed zero callers before deletion. Web build clean, bundle size unchanged (8.86 kB). |

## Phase 10: Analyze allocation (COMPLETE)

See [phase10-analyze-allocation-memo.md](phase10-analyze-allocation-memo.md) for the full design — "one score one thing" principle, weighted-allocation-with-spillover algorithm, the `analyze_weight` vs `authority_score` separation, and why we are NOT splitting freshness formulas or switching to `fetched_at`.

Triggered by a Phase 9 diagnostic run that analyzed 99/100 articles from arXiv cs.AI alone while every lab feed (Anthropic, DeepMind, Meta AI, NVIDIA, Microsoft Research, Mistral, OpenAI) got zero coverage. Root cause: arXiv's hyper-fresh `published_at` timestamps sort above every lab feed under the existing `ORDER BY published_at DESC LIMIT 100` query. Scope: introduce a per-feed `analyze_weight` lever + a weighted batch allocation algorithm + restore per-feed fetch logging that Task 44 removed.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 50 | Schema: add `analyze_weight real NOT NULL DEFAULT 0.5` to `feeds` | Done | Column added to `feeds` pgTable in schema.ts. `drizzle-kit push` applied to dev DB, verified via `\d feeds`. `db.test.ts` columns assertion updated (analyzeWeight in expected list + notNull check). 174 tests still passing. Default 0.5 applied to all 15 existing rows automatically. |
| 51 | Shared: extend `feedSchema` / `createFeedSchema` / `updateFeedSchema` with `analyzeWeight` | Done | `analyzeWeight: z.number().min(0).max(1)` added to `feedSchema` (required) and to both `createFeedSchema` / `updateFeedSchema` (optional). Also filled a pre-existing gap: `createFeedSchema` now accepts `authorityScore` on create (was previously PATCH-only). `feeds.test.ts` mock fixture updated. 174 tests still passing, web build clean. |
| 52 | `allocateSlots()` pure function + unit tests in `analyze.test.ts` | Done | Weighted allocation with spillover lives in `analyze.ts` alongside the `FeedAllocation` interface. Pass-snapshot denominator (`passRemaining`) ensures intra-pass fairness; ceiling rounding prevents fractional-share starvation; capped at pending; max 10 spillover passes. **12 unit tests** in `analyze.test.ts` covering empty input, zero/negative slots, single-feed both directions, equal/unequal weights, low-volume spillover, zero-weight exclusion, zero-pending exclusion, under-budget, and a **realistic 12-feed scenario** mirroring today's actual production data — verifies all 12 feeds get representation and arXiv is capped ≤ 20 each. **186 tests passing** (174 → 186). |
| 53 | `analyzeUnanalyzed()` refactor: count → allocate → fetch-per-feed → sort → analyze | Done | Body of `analyzeUnanalyzed()` rewritten as a 4-phase execution. Phase 1: GROUP BY count query joining `articles` + `feeds` + leftJoin `article_analysis` filtering on enabled+window+not-analyzed. Phase 2: `allocateSlots()` with `Number()` coercion for postgres BIGINT. Allocation summary logged via `[analyze] allocation: feed=N/pending …`. Phase 3: N small per-feed fetch queries with LIMIT slotCount. Phase 3.5: in-JS sort across feeds by `COALESCE(published_at, fetched_at)` desc for ticker interleaving. Phase 4: existing analyze loop unchanged (progress events + cancel signal). **Behavior change**: disabled feeds now also stop analyze (was: only stopped fetch). Dropped `notExists` import (replaced by leftJoin pattern). 186 tests still passing. |
| 54 | Per-feed fetch log lines in `pipeline.ts` fetch phase | Done | Inserted a per-feed loop after `fetchAllFeeds()` in the fetch phase. One `[pipeline] run <id> fetch:<feedName> added=N` info line per successful feed, `[pipeline] run <id> fetch:<feedName> ERROR — <msg>` warn line per failure. Restores the observability lost when Task 44 deleted the old `admin.ts` per-feed log helper. Next manual run will surface the still-unknown Google AI Blog error in the terminal. |
| 55 | Feeds settings UI: add "Analyze weight" column next to "Authority" | Done | `feed-list.tsx`: extended `FeedEdit` with `analyzeWeight?`, added `effectiveAnalyzeWeight()` + `handleAnalyzeWeightChange()` helpers, extended `setEdit()` diff to handle the third field, generalized `AuthorityInput` → `WeightInput` taking an `id` prop so it works for both columns, added new `<TableHead>Analyze</TableHead>` + `<TableCell>` row. Existing dirty-tracking + SaveBar wiring picks it up automatically — `feeds-section.tsx` only imports the `FeedEdit` type and forwards everything via `updateFeed()`. Web build clean, settings page 34.9 → 35.0 kB. |
| 56 | Changelog entry | Done | 2026-04-14 entries for `feat(analyze)` weighted allocation, `chore(pipeline)` per-feed fetch logging, `feat(feeds-ui)` Analyze column, `feat(shared)` schema extension. Phase 10 closed. |

## Phase 11: Summarize policy (COMPLETE)

Small follow-up to Phase 10. Current `summarizeUnsummarized()` has no `ORDER BY`, no recency filter, and no enabled-feed check. Under sustained overload it processes low-value articles in insertion order while high-relevance items wait. Proposed fix: value-first ordering + 14-day window + enabled filter. Design rationale in [pipeline-flow.md](pipeline-flow.md) Layer 3 and the "value-first, not newest-first" decision explained there.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 57 | `summarize.ts` query rewrite | Done | Added `SUMMARIZE_MAX_AGE_DAYS = 14` constant (same window as analyze). Extended the query with `and(isNull(llmSummary), eq(feeds.enabled, true), inWindow)` and `.orderBy(desc(relevance + importance), desc(publishedAt))`. Value-first priority using SQL `(relevance + importance)` composite, fresher content wins on ties. No per-feed allocation — analyze already distributed state-2 rows fairly. 186 tests still passing. |
| 58 | Changelog entry | Done | 2026-04-14 `feat(summarize)` entry explaining value-first policy + graceful degradation. |

## Phase 12: Active run re-attach on mount (COMPLETE)

Fix for: navigating away from the dashboard during a manual run and returning makes PipelineControl show as idle with no cancel button, even though the backend run is still in progress. Root cause: EventSource closes on unmount and can't be re-attached to an in-flight run (the `/stream` endpoint is one-shot). Frontend-only fix via polling `/status` and rendering a "watching" sub-state with reduced info.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 59 | Watching sub-state in `PipelineControl` | Done | On mount (or after navigation return), if `status.activeRun != null`, render a stripped-down running view: state badge + elapsed chronometer + trigger chip + Cancel button. No phase indicator, no article ticker, no progress bar (those require the live EventSource which only the originating tab has). Added a 5s polling effect on `/status` scoped to watching state, a guard effect that resets `cancelling` when `activeRun` clears, and extended the elapsed-clock interval to fire while watching. New `cancelWatchingRun()` handler POSTs to `/runs/:id/cancel` using the runId from `status.activeRun`. `showRunningChrome` boolean combines owned-run + watching to apply the amber rail and wash in both cases. Dashboard bundle 8.89 → 9.09 kB. |

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

Phases 10-12 complete. All three pipeline layers have well-defined pickup policies ([pipeline-flow.md](pipeline-flow.md)), and the dashboard now re-attaches to in-flight runs when the user navigates back. Still unsolved: Google AI Blog fetch error (next manual run will surface it via the Task 54 per-feed log loop). Next direction TBD.

## Reference Docs

- [design-plan.md](design-plan.md) — app design, tech stack, build phases
