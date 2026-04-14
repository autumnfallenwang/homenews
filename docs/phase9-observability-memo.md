# Phase 9 — Pipeline Observability Memo

**Date**: 2026-04-13
**Status**: decisions locked, implementation not yet started
**Design reference**: [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html)

## Problem

The `PipelineControl` component shipped in Phase 7 covers 20% of what pipeline observability needs:

- A pipeline run takes ~8 minutes. The user stares at a spinner for that whole time with no signal about which phase is running, which article is being processed, or how close it is to done.
- There's no way to cancel a run once it starts. Closing the browser tab leaves the backend running blind.
- There's no history. Past runs (manual or scheduler-triggered) leave no trace beyond a stdout log line — if you weren't watching the terminal when a cron tick fired, you don't know whether it succeeded or what it processed.
- There's no indication of when the next scheduler tick will fire.
- The Fetch / Analyze / Summarize split buttons are debug-era ergonomics; in practice you always want to run all three.

## Decisions

### 1. Transport: Server-Sent Events, not polling and not WebSockets

**Chosen**: A single `GET /admin/pipeline/stream` endpoint that emits `text/event-stream` progress events as the run executes. Native browser `EventSource` on the client.

**Why not client-side phase orchestration (three sequential POSTs)**:
Phase-level progress only renames the spinner. A 3-minute "Analyzing…" spinner is the same UX as a 3-minute "Running pipeline…" spinner — the user's actual question is "what article is being processed right now?" and phase boundaries don't answer that. It also makes the client brittle: a 3-minute hanging POST request is vulnerable to tab throttling, proxy timeouts, and mobile WiFi dropouts.

**Why not WebSockets**:
The channel is one-way (server → client). WebSockets add bidirectional framing and a connection handshake we don't need. SSE is the exact primitive for "server pushes a stream of events to a watching client".

**Why not a job queue with polling**:
Would require a job registry, cancellation semantics expressed as state transitions, and a polling interval that's always wrong (too fast = noise, too slow = laggy). Pipeline runs already survive tab closure because `POST /admin/pipeline/run-all` keeps running server-side even if the client disconnects. We gain nothing from persisting "job intent" separately from the run row we're already writing to `pipeline_runs`.

**Tradeoff accepted**: SSE connections don't deliver progress if the user has multiple tabs open — only the tab that initiated the run sees live events. Cron-triggered runs happening in the background don't push events to any tab. We mitigate this by polling `GET /admin/pipeline/status` on tab focus, which returns the active run (if any) and can be used to connect an EventSource to the in-progress run.

### 2. Cancel semantics: flag-based, between LLM calls

When the user clicks Cancel:

1. Client POSTs `/admin/pipeline/runs/:id/cancel`.
2. Server flips the `cancel: true` flag in the in-memory `activeRuns` registry for that run ID.
3. Analyze and summarize services check the flag between articles (between LLM calls).
4. The in-flight LLM call **completes normally** — we do not abort mid-HTTP-request. Work that's already been paid for gets saved.
5. After the current article finishes, the loop breaks.
6. Partial results are written to `pipeline_runs` with `status = 'cancelled'`, along with the counts reached.
7. A final SSE event `{ phase: 'done', status: 'cancelled' }` is emitted and the stream closes.

**Why not `AbortController` through the LLM executor**:
Threading abort signals through `fetch()` calls is fiddly and the 1-3s saved per cancel does not justify the complexity. A cancelled run stops within ~2s of the click, which is acceptable for a personal tool.

**Why not roll back already-written analyze rows**:
They're legitimate work. If analyze has processed 23 articles and is cancelled, those 23 analyses stay in the database — the next run picks up from article 24, not from article 1. This is the "crash safety already works" property of the append-only design.

**Cancel button UX state machine**:
- Disabled when no active run
- Active (destructive-tinted) when run is in progress
- After click: shows "Cancelling…" until the server emits the final event (≤2s)
- Re-disables after the final event

### 3. History persistence: new `pipeline_runs` table, both triggers land here

**Schema**:
```sql
CREATE TABLE pipeline_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger       TEXT NOT NULL CHECK (trigger IN ('manual', 'scheduler')),
  status        TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  duration_ms   INTEGER,
  fetch_added            INTEGER,
  fetch_errors           INTEGER,
  analyze_analyzed       INTEGER,
  analyze_errors         INTEGER,
  summarize_summarized   INTEGER,
  summarize_errors       INTEGER,
  error_message          TEXT
);
CREATE INDEX pipeline_runs_started_at_idx ON pipeline_runs (started_at DESC);
```

**Key decision**: the scheduler uses the **same orchestrator** (`runPipelineWithProgress`) as the manual trigger. Both code paths write to `pipeline_runs`. This means:
- History is unified — no "scheduler logs" separate from "manual logs"
- The segmented filter in the history drawer (All / Manual / Scheduled) is a simple WHERE clause on `trigger`
- Bug fixes and observability improvements to the orchestrator benefit both code paths for free
- The scheduler stops caring about orchestration details — it's just the "who" for a run, not the "how"

**Retention**: keep rows forever for now. At 1 row per run, 200 bytes per row, and 8-hour cron interval, a year of runs is ~1095 rows = ~220KB. Revisit when it becomes a real concern.

**Indexing**: just `started_at DESC` for the history query. No other queries are planned.

### 4. The in-flight run is a singleton

We enforce at most one active run at a time. Triggering a second run while the first is still active returns `409 Conflict` with the active run's ID. The UI surfaces this by pointing the client at the existing EventSource for the active run instead of refusing the click.

**Why not allow parallel runs**:
- LLM rate limits and cost: running two pipelines in parallel doubles the rate of OpenAI calls for no benefit (we already batch-limit per run)
- Scheduler and manual could otherwise collide mid-analyze on overlapping articles, causing unique constraint violations on `article_analysis` insertions
- Complexity: per-run state is simple when the map has at most one entry

**Implication for scheduler**:
If a cron tick fires while a manual run is in progress, the scheduler skips that tick (with a warn log) and waits for the next. The existing `noOverlap: true` option on node-cron handles the case where one scheduler tick is still running when the next fires; we add an explicit check in `runPipelineWithProgress` to refuse to start if `activeRuns.size > 0`.

### 5. Next-scheduled countdown is computed, not stored

The cron expression lives in the `fetch_interval` setting. We compute the next fire time on demand using `cron-parser` (idiomatic, 4KB, zero alternatives worth evaluating).

- On mount, the frontend calls `GET /admin/pipeline/status` which returns `{ activeRun?, nextRunAt: ISO }` — server is authoritative
- The frontend then ticks a countdown display locally every 30s via `setInterval`, derived from that `nextRunAt`
- On tab focus (`visibilitychange`), we re-fetch `/status` in case the cron expression changed or the clock drifted

**Not stored in the database** — next-run is a pure function of `(fetch_interval, now)`. Caching would mean maintaining another invalidation path for no benefit.

### 6. Refresh cadence (stated explicitly)

| Thing | Cadence | Mechanism |
|---|---|---|
| Active run per-article progress | Live push | SSE |
| Elapsed clock in running card | 1s | Client `setInterval` — no network |
| Next-run countdown | 30s | Client `setInterval` — no network |
| Run history list | On mount + on tab focus + 60s while tab visible | `setInterval` + `visibilitychange` |
| Pipeline status (active + next) | On mount + on tab focus | `fetchPipelineStatus()` |
| Dashboard article list | On SSE "done" event | `router.refresh()` |

**Principle**: expensive things (per-article events) are push-driven via SSE. Cheap things (countdowns, elapsed clocks) don't touch the network. Medium things (history, status) refresh on user intent (mount, focus) rather than aggressive polling.

## Architecture diagram

```
Browser                                       API                            DB
───────                                       ───                            ──
EventSource ────────────────────────────►  GET /admin/pipeline/stream ─► runPipelineWithProgress()
  (receives phase + per-article events)                                      ├ insert pipeline_runs (status=running)
                                                                             ├ fetchAllFeeds() → emit fetch:done
Cancel button ──────────────────────────►  POST /admin/pipeline/runs/:id/cancel
                                             → sets activeRuns[id].cancel = true
                                                                             ├ analyzeUnanalyzed(onProgress, signal)
                                                                             │    ├ emit analyze:item per article
History drawer ─────────────────────────►  GET /admin/pipeline/runs?limit=20
                                                                             │    └ check signal between iterations
Status poll (mount + focus) ────────────►  GET /admin/pipeline/status
                                             returns { activeRun?, nextRunAt }├ summarizeUnsummarized(onProgress, signal)
                                                                             │
Countdown ticker (client-only, 30s)                                          └ update pipeline_runs (status=done/cancelled/failed)
                                                                                final counts + duration + error_message

Scheduler cron tick ────────────────────►  runPipelineWithProgress(trigger="scheduler")
                                             no progress listener; writes same pipeline_runs rows
```

One service, two callers (HTTP SSE handler and cron tick). Both paths write identical history rows, differing only in `trigger`.

## SSE event shapes

```ts
type PipelineEvent =
  | { type: "run-start";  runId: string; trigger: "manual" | "scheduler"; startedAt: string }
  | { type: "fetch-start" }
  | { type: "fetch-done";  added: number; errors: number; feedResults: FeedFetchResult[] }
  | { type: "analyze-start"; total: number }
  | { type: "analyze-item";  index: number; total: number; title: string; feedName: string }
  | { type: "analyze-done";  analyzed: number; errors: number }
  | { type: "summarize-start"; total: number }
  | { type: "summarize-item";  index: number; total: number; title: string; feedName: string }
  | { type: "summarize-done";  summarized: number; errors: number }
  | { type: "run-done"; status: "completed" | "cancelled" | "failed"; durationMs: number; errorMessage?: string };
```

Each event is serialized as a single SSE `data:` line with a JSON payload. The stream closes after `run-done`.

## What we are explicitly NOT building

To stay inside "best design without over-design":

- **No job queue**, no Redis, no durable queue backend. In-memory is fine for a single-instance personal tool.
- **No retry logic** on failed runs. If a run fails, the user reads the error and decides what to do.
- **No run-level pause/resume.** Cancel-and-restart is the escape hatch.
- **No run-by-run diff view.** The history shows counts; specific-article drilldown is a future task if we ever need it.
- **No multi-user run attribution.** `pipeline_runs` has no `user_id` column. Adding it is trivial when we add multi-user.
- **No WebSocket upgrade path.** SSE is enough and doing both is waste.
- **No background job history beyond 30 days.** We keep everything for now; add retention when it matters.

## Decision log (so we don't re-litigate)

| Question | Answer | Reason |
|---|---|---|
| Split buttons or single Run? | Single | Split was debug ergonomics; real use is always all-three |
| Client orchestration or SSE? | SSE | Client orchestration only gives phase-level progress, doesn't solve the real "what's happening inside the 3-min Analyze phase" problem |
| Cancel via AbortController or flag? | Flag | 2s lag acceptable, avoids threading signals through fetch |
| Scheduler separate service or shared? | Shared | Single source of truth for pipeline runs, unified history |
| Store next-run time or compute? | Compute | Pure function of cron + now; no caching needed |
| One active run or multiple? | One | Cost + collision safety; enforce in registry |
| Keep old pipeline POST endpoints? | No | Remove them. They were transitional; nothing else uses them |
| History row count limit? | 20 in UI, all in DB | 220KB/year is negligible |
| Refresh interval for history? | 60s on focus, none when hidden | Polling noise mitigation |

## Implementation order (strict dependency chain)

1. **Task 39** — `pipeline_runs` schema + migration. Nothing else can run until the table exists.
2. **Task 40** — `services/pipeline.ts` orchestrator with in-memory `activeRuns` registry. Pure function for now, no HTTP.
3. **Task 41** — Thread `onProgress` + cancel signal into analyze/summarize services. Non-breaking: both parameters are optional.
4. **Task 42** — Refactor scheduler to call `runPipelineWithProgress(trigger="scheduler")`. This is the point where cron ticks start writing to `pipeline_runs`.
5. **Task 43** — `cron-parser` dependency + `services/cron-next.ts` utility. Needed by Task 44.
6. **Task 44** — SSE endpoint + cancel + runs list + status endpoints. Drop old pipeline POSTs from `admin.ts`. Tasks 40-43 must be complete before this compiles.
7. **Task 45** — Rewrite `PipelineControl` with idle/running state machine + EventSource client. Requires endpoints from Task 44.
8. **Task 46** — `PipelineHistory` drawer. Requires GET /runs from Task 44.
9. **Task 47** — Next-scheduled countdown ticker. Requires GET /status from Task 44.
10. **Task 48** — Tests for the orchestrator (cancellation, progress ordering, phase boundaries).
11. **Task 49** — Drop obsolete helpers from `apps/web/src/lib/api.ts`.

Each step gates the next. Don't parallelize — the dependency chain is real and premature parallel work on frontend tasks while the backend shape is still shifting would waste context.

## Exit criteria

Phase 9 is done when:

1. Clicking Run from the dashboard shows live per-article progress through analyze + summarize
2. Clicking Cancel mid-run stops it within ~2 seconds and writes a `cancelled` row to `pipeline_runs`
3. The history drawer lists the last 20 runs with their counts, durations, triggers, and allows filtering
4. The Next-scheduled countdown updates every 30s and reflects the current `fetch_interval` setting
5. Both manual and cron-triggered runs appear in the history with correct `trigger` values
6. The old pipeline POST endpoints (`/fetch`, `/analyze`, `/summarize`, `/run-all`) are gone from `admin.ts`
7. `pnpm test` and `pnpm lint` are clean
8. The deployed component visually matches [phase9-pipeline-ops-mockup.html](phase9-pipeline-ops-mockup.html) within sensible porting tolerance
