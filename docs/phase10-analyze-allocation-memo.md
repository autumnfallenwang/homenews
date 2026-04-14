# Phase 10 — Analyze Allocation Memo

**Date**: 2026-04-14
**Status**: decisions locked, implementation not yet started
**Prompted by**: post-Phase-9 diagnostic run that landed 99/100 analyze slots in arXiv cs.AI while every lab feed (Anthropic, DeepMind, Meta AI, NVIDIA, Microsoft Research, Mistral, OpenAI) got zero coverage.

## Problem

Phase 8 fixed analyze starvation by adding `ORDER BY COALESCE(published_at, fetched_at) DESC` + a 14-day window. That solved the "OpenAI eats everything" bug but introduced a new failure mode: **arXiv eats everything**.

Root cause: arXiv publishes ~50-300 AI papers per day per category, each with a hyper-fresh `published_at` timestamp (today's dump at 04:00 UTC). Under `ORDER BY published_at DESC LIMIT 100`, arXiv's freshest dump sorts above every lab blog post — lab feeds publish weekly, so their newest items are days older and never make it into the batch.

DB snapshot from the diagnostic run:

```
Pending in 14-day window by feed:
  arXiv cs.AI          1,133  newest 2026-04-14 04:00
  arXiv cs.LG            592  newest 2026-04-14 04:00
  arXiv cs.CL            411  newest 2026-04-14 04:00
  Ars Technica AI         21  newest 2026-04-11
  Anthropic               14  newest 2026-04-14
  NVIDIA Developer        14  newest 2026-04-12
  MIT Tech Review          7  newest 2026-04-08
  Meta AI                  5  newest 2026-04-08
  Mistral AI               5  newest 2026-04-11
  Microsoft Research       2  newest 2026-04-09
  DeepMind                 1  newest 2026-04-02
  OpenAI Blog              1  newest 2026-04-10
  Total                2,206
```

Result of one analyze run with batch=100: 99 arXiv cs.AI + 1 arXiv cs.LG. Every lab feed finished the run with zero new analyses. Dashboard "Sources" metric showed 1/14.

## Decisions

### Decision 1: One score, one thing

Freshness and distribution are separate concerns. A single score should not try to solve both.

- **Freshness score** (`EXP(-λ × hours_since_pub)`): stays exactly as it is. Uniform formula across all sources. If a source feels "too fresh" in the dashboard ranking, the correct lever is lowering its `authority_score` — that weights it down in the final composite without distorting the freshness math.
- **No per-source freshness formulas, no newness-bonus hacks, no split between "analyze recency" and "composite recency".**
- **No switching the freshness input from `published_at` to `fetched_at`.** Backfilled-old-post edge cases bite us there.

This is a user-articulated principle: one dimension, one knob. Don't stack responsibilities onto a single field because it happens to be there.

### Decision 2: New dedicated field `analyze_weight`

Because of Decision 1, we cannot reuse `authority_score` to control analyze batch allocation — those two fields express different things and can legitimately point in opposite directions:

- `authority_score`: how much this source weighs in the composite ranking (editorial trust / importance)
- `analyze_weight`: how much of the analyze budget this source should consume per run (throughput / cost share)

Example: arXiv might be `authority=0.5, analyze_weight=0.15` — trustworthy when it does publish something good, but don't burn 30 LLM calls per run on its volume. Anthropic might be `authority=0.5, analyze_weight=0.6` — same trust level but we want all their posts analyzed the moment they publish.

New column on `feeds` table: `analyze_weight real NOT NULL DEFAULT 0.5`.

**Weight semantics**:
- Range 0-1 (same as authority_score)
- `0` means "never analyze this feed" — escape hatch to freeze analyze for a specific source without disabling the feed's fetching
- Default 0.5 for all existing rows, tunable per-feed via the Feeds settings UI
- Not bundled with any other concern — purely the allocation lever

### Decision 3: Weighted allocation with spillover

The batch size (100 by default) stays the same. What changes is how those slots are distributed across feeds with pending articles.

**Algorithm** (pure function, runs in the app layer):

```
Input:  feeds[] = { feedId, weight, pending_count }, total_slots
Output: allocation: Map<feedId, slot_count>

1. Filter to eligible = feeds where weight > 0 AND pending > 0
2. For each pass (max 10 passes, usually converges in 2-3):
   a. total_weight = sum(weights of still-eligible feeds)
   b. for each feed:
      - proposed = ceil(remaining_slots × weight / total_weight)
      - can_take = min(proposed, pending - already_allocated)
      - allocate can_take, decrement remaining
   c. Drop feeds that have hit their pending ceiling from eligible
3. Return allocation map
```

**Key properties**:
- **Ceiling rounding** in the first pass guarantees small-weight-but-pending feeds get at least 1 slot (no starvation from fractional shares)
- **Spillover** redistributes unused allocation from low-volume feeds to feeds with more pending
- **Capped at pending** per feed — no wasted slots
- **Convergent** — each pass either allocates or removes a feed from eligibility

### Decision 4: Four-phase execution

```
Phase 1 — Count pending per feed (1 SQL query, GROUP BY feed_id)
Phase 2 — Allocate slots (pure TypeScript, O(N_feeds))
Phase 3 — Fetch per-feed articles (N small SQL queries, N ≤ 14, each LIMIT ≤ slot_count)
Phase 4 — Sort across feeds by freshness, then analyze sequentially (existing loop)
```

**N+1 queries instead of one giant JOIN**: the per-feed query is trivial (LIMIT 10 per feed, 14 feeds = 140 row-reads total). Writing one window-function query with variable per-feed caps would be uglier than the 14-query loop. Clarity > micro-optimization.

**Sort order after allocation**: by freshness descending, interleaving across feeds. The live ticker feels better when Anthropic's post slides by between two arXiv papers rather than ten arXiv papers in a row followed by one Anthropic.

### Decision 5: Per-feed fetch log lines restored

Task 44 replaced the old per-feed `[admin] fetch:<feedName>` logging with aggregate-only counts. Lost visibility into specific feed failures (Google AI Blog still silent, no error surfaced anywhere). Phase 10 restores the per-feed log loop inside `pipeline.ts` fetch phase:

```
[pipeline] run abc12345 fetch:OpenAI Blog added=0
[pipeline] run abc12345 fetch:Google AI Blog ERROR — <actual rss-parser error>
[pipeline] run abc12345 fetch:Anthropic added=3
...
```

Cheap, bundled into this commit. Next run will surface the Google AI Blog error that's been hiding since Task 44.

## Settings tuning (separate from code)

Weight values are settings, not code. Phase 10 lands with **default 0.5 for all feeds** — no hardcoded tuning in the migration. After the code ships, we observe one run and tune per-feed values via the UI.

Suggested starting values (subject to revision after observing):

| Feed | authority_score | analyze_weight |
|---|---|---|
| arXiv cs.AI / cs.LG / cs.CL | 0.5 | **0.15** each |
| OpenAI Blog, Google AI Blog, DeepMind, Anthropic | 0.5-0.6 | **0.6** |
| NVIDIA Developer, Microsoft Research | 0.6 | 0.5 |
| Meta AI, Mistral AI, Hugging Face Blog | 0.5 | 0.5 |
| Ars Technica AI, MIT Tech Review AI | 0.5 | 0.5 |

With those values, sum of weights ≈ 6.85. arXiv collectively baseline ≈ `0.45 / 6.85 × 100 = ~7 slots` before spillover; with spillover absorbing returns from low-volume feeds, arXiv ends up ~20-30 slots, labs share ~70-80. Dashboard should show 10+ sources per run.

## What this task does NOT do

- **No changes to composite ranking.** Freshness formula and authority weighting in the `/ranked` query are untouched.
- **No scheduler changes.** The scheduler still calls `runPipelineWithProgress("scheduler")`; allocation happens inside analyze.
- **No new API endpoints.** The existing `GET /feeds` / `PATCH /feeds/:id` surface the new column automatically once the schema has it.
- **No frontend state machine changes.** PipelineControl's progress events are unchanged — `analyze-start.total` reflects the new allocation sum, same as before.
- **No Google AI Blog URL fix.** The per-feed logging will surface the real error; we fix it in a follow-up once we know what it actually is.

## Open questions resolved

| # | Question | Resolution |
|---|---|---|
| 1 | Default `analyze_weight` value for new feeds? | 0.5 (consistent with `authority_score`) |
| 2 | Weight 0 semantics? | "Never analyze this feed" — feed still fetches, just skipped by allocation |
| 3 | When total pending < batch? | Analyze everything — fairness is about scarcity, not a hard cap |
| 4 | Sort order within a run? | By freshness desc (interleaved) — better ticker UX |
| 5 | Seed the tuning values or wait? | Wait. Leave 0.5 everywhere, observe one run, tune via UI. |
| 6 | Show "estimated slots" preview in UI? | Skip — nice-to-have, not blocking |
| 7 | Does analyze_weight affect scheduler vs manual differently? | No. Same allocation either way. |
| 8 | Do Phase 9's progress events change? | No. Same event shapes; only the `total` count reflects new allocation. |
| 9 | Unit tests for `allocateSlots()`? | Yes — pure function, easy to test. ~6 cases. |

## Implementation task breakdown

| # | Task | Notes |
|---|------|-------|
| 50 | Schema: add `analyze_weight real NOT NULL DEFAULT 0.5` to feeds | `drizzle-kit push`, update `db.test.ts` columns assertion |
| 51 | Shared: extend `feedSchema` + create/update schemas with `analyzeWeight` | Zod + type |
| 52 | `allocateSlots()` pure function in `analyze.ts` + unit tests in `analyze.test.ts` | Weighted allocation with spillover |
| 53 | `analyzeUnanalyzed()` refactor: count → allocate → fetch-per-feed → sort → analyze | 4-phase execution |
| 54 | Per-feed fetch log lines in `pipeline.ts` fetch phase | Restores Task 44 observability loss |
| 55 | Feeds settings UI: add "Analyze weight" column next to "Authority" | Inline editable Input, same dirty-track pattern |
| 56 | Changelog entry | 2026-04-14 block |

## Exit criteria

Phase 10 is done when:

1. The `feeds.analyze_weight` column exists, tests cover it
2. `allocateSlots()` has unit tests covering equal weights, unequal weights, spillover, zero-weight exclusion, under-budget runs, and empty input
3. Running a full pipeline from the UI analyzes articles across ≥ 5 feeds (verified against `pipeline_runs` + a manual feed-distribution query)
4. The Feeds settings tab shows the new column and saves correctly
5. Per-feed fetch log lines appear in the terminal
6. `pnpm lint` clean, all tests passing, web build clean
