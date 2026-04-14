# HomeNews Pipeline — Final Process Flow

Three persistent layers, each a DB-state transition, each with its own pickup
policy and backlog behavior. The system is designed so that **when capacity <
inflow (steady overload), it degrades gracefully to "best slice" selection
rather than FIFO starvation**.

---

## State machine

Every article lives in one of four states, tracked by DB row presence:

```
  RSS feed
     │
     ▼ Fetch
┌──────────────────────────────────────────────┐
│ STATE 1  RAW                                 │
│ - row in `articles`                          │
│ - no row in `article_analysis`               │
│ - duplicate_of_id IS NULL                    │
└──────────────────────────────────────────────┘
     │
     ▼ Analyze
┌──────────────────────────────────────────────┐
│ STATE 2  ANALYZED                            │
│ - row in `article_analysis`                  │
│ - llm_summary IS NULL                        │
│ - carries relevance / importance / tags      │
└──────────────────────────────────────────────┘
     │
     ▼ Summarize
┌──────────────────────────────────────────────┐
│ STATE 3  SUMMARIZED                          │
│ - article_analysis.llm_summary set           │
│ - appears in dashboard / composite ranking   │
└──────────────────────────────────────────────┘

           (side state)
┌──────────────────────────────────────────────┐
│ STATE 4  DUPLICATE                           │
│ - row in `articles` with duplicate_of_id set │
│ - excluded from analyze forever              │
└──────────────────────────────────────────────┘
```

Transitions are **monotonic and append-only**. A state-1 article only moves
forward to state 2 (or state 4 if caught by the title-bigram dedup). Nothing
ever demotes.

---

## Layer 1 — Fetch

**Purpose**: pull RSS feeds and persist new URLs into the `articles` table.

| Property | Value |
|---|---|
| **Queue** | *None* — driven by the RSS source, no DB-side backlog |
| **State transition** | External → State 1 (or State 4 via title-bigram dedup) |
| **Budget** | Unbounded — fetches everything each RSS source exposes |
| **Dedup** | URL-level via `articles.link` unique constraint (primary). Title-level via bigram Dice coefficient in a 48h window (secondary). |
| **Idempotent?** | Yes — running fetch 100 times in a row adds 0 rows per feed after the first |

**Per-feed policy**:
- Every enabled feed is fetched every run
- No prioritization, no allocation
- Failures are logged per-feed (`[pipeline] fetch:<feedName> ERROR — <msg>`)
  but don't block other feeds

**Backlog behavior under "queue always full"**: N/A — fetch doesn't maintain
a queue. Backlog accumulates in **State 1** (downstream of fetch), not in
fetch itself.

**What `fetched=N` in the run logs means**: N unique new URLs inserted this
run. If the RSS fed us 1500 items and 1487 were already known (URL dedup),
N = 13. This is the common case.

---

## Layer 2 — Analyze

**Purpose**: LLM-score each article (relevance + importance + tags) and
create a State 2 row.

| Property | Value |
|---|---|
| **Queue** | State 1 articles matching the pickup filter |
| **State transition** | State 1 → State 2 |
| **Budget** | `analyze_batch_size` per run (default 100) |
| **Capacity** | ~1200 analyses/day at batch 100 × 12 cron runs |

### Pickup policy (Phase 10)

**State filter**:
- Not duplicate (`duplicate_of_id IS NULL`)
- Not yet analyzed (no row in `article_analysis`)
- Feed enabled (`feeds.enabled = true`)
- In 14-day recency window (`published_at >= NOW() - 14 days` OR
  `published_at IS NULL AND fetched_at >= NOW() - 14 days`)

**Cross-feed distribution**: `allocateSlots(counts, batch)` with weighted
proportional allocation + spillover
- Weight source: `feeds.analyze_weight` (0–1, default 0.5, `0 = never analyze`)
- Low-volume feeds return excess slots to spillover pool
- Spillover redistributes proportionally to feeds with remaining pending
- Converges in ≤3 passes for realistic inputs

**Per-feed selection**: newest-first
(`ORDER BY COALESCE(published_at, fetched_at) DESC`) up to each feed's
allocated slot count

**Iteration order within the batch**: round-robin across feed buckets,
ordered by weight desc
- Cancel-fairness: cancelling mid-run leaves every feed with at least
  `floor(processed / feedCount)` articles
- No single feed can be starved by the iteration order

### Backlog behavior under overload

Steady-state queue size per feed ≈ `min(14d × inflow_rate, unbounded)`.
Articles older than 14 days that never made the cut are **permanently
stranded** — they sit in State 1 until... nothing ever happens to them.
They're not errors, they're just irrelevant.

**The 14-day window is the backstop**. It means:
- Bounded memory growth — backlog per feed can't exceed `14d × inflow_rate`
- Graceful degradation — when inflow > allocated capacity, the **newest**
  articles get picked, the oldest age out
- No manual queue pruning needed

**What this looks like for a feed at capacity**:

```
Feed: arXiv cs.AI  (weight 0.2, pending 1133, allocated slots/run ~15)

Day 1, 04:00 UTC: arXiv dumps 60 papers → state 1 queue = 60
Day 1, 06:00 UTC: analyze run picks newest 15 → state 2
                  remaining state 1 queue = 45 (newest-first cursor)
Day 1, 08:00 UTC: run picks next 15 → remaining 30
... 12h later, all 60 of today's papers analyzed

Day 15, 04:00 UTC: arXiv dumps another 60 papers
                   Day 1's unpicked remainder (hypothetically N)
                   ages out of the 14-day window here
                   → silently dropped from all future queries
```

In practice, arXiv at weight 0.2 with a 100-slot batch and 12 runs/day =
~240 slots/day → it never falls behind. Weight tuning is the pressure valve.

### Value degradation ordering

**Newest-first within each feed** is deliberate. The alternative
(oldest-first / FIFO) would waste LLM budget on yesterday's papers while
today's piled up. We want the queue to always reflect "today's frontier",
and let the tail age out.

---

## Layer 3 — Summarize *(proposed — Phase 11)*

**Purpose**: LLM-generate a 2-3 sentence summary for each analyzed article
and write it to `article_analysis.llm_summary`.

| Property | Value |
|---|---|
| **Queue** | State 2 articles matching the pickup filter |
| **State transition** | State 2 → State 3 |
| **Budget** | `summarize_batch_size` per run (default 100) |
| **Capacity** | ~1200 summaries/day at batch 100 × 12 cron runs |

### Pickup policy (proposed, replaces the current no-ORDER-BY query)

**State filter**:
- Has `article_analysis` row
- `llm_summary IS NULL`
- Feed enabled (`feeds.enabled = true`)
- In 14-day recency window (same window as analyze — consistency > tightness)

**Ordering** (**different from analyze** — this is the key insight):

```sql
ORDER BY (relevance + importance) DESC,  -- highest value first
         published_at DESC                -- tiebreak: newer wins
```

**Why value-first, not newest-first like analyze?**

Because at this stage we already have the LLM scores. Analyze had to guess
by timestamp; summarize can use actual measured value. Since summarize is
the last stop before the dashboard, it should always process the articles
*most likely to show up in front of the user* first.

**No per-feed allocation** — analyze already did the fair distribution when
writing State 2 rows. Adding per-feed allocation here would be
double-counting. Summarize picks the best-scored items regardless of which
feed they came from, which is correct: the user wants the best articles
summarized, not a fair distribution of mediocre ones.

**No relevance threshold** — today all feeds score ≥30, so filtering by
threshold has no effect. If the LLM prompt is ever tuned to be more
permissive, add `relevance >= 30` as a cheap cost-saver.

### Backlog behavior under overload

Steady-state queue size ≈ bounded by the 14-day window, same as analyze.
But degradation shape is different:

```
When capacity < inflow, what gets processed?

Analyze:   newest-per-feed wins.    Oldest items age out.
Summarize: highest-value wins.      Lowest-value items age out.
```

**Under sustained overload**, low-value articles accumulate in State 2
forever. They never get summarized. They never show up in the dashboard
anyway (low relevance/importance → low composite score → not in top 50).
They age out of the 14-day window and are effectively lost without ever
costing a summarize LLM call. **This is correct behavior** — it's graceful
degradation to "summarize only the articles the user will actually see".

### Explicit trade-off

The cost of priority-first summarize: **low-value articles never get
summarized**, even if the queue is empty. If you ever want "completeness"
(every analyzed article also summarized regardless of score), you'd need
to either:
- Remove the value ORDER BY (back to FIFO)
- Add a "second-chance" mode that drains the tail during off-peak hours

Recommendation: **stay with value-first**. If you wanted every article
summarized, you wouldn't have bothered ranking them. The whole point of
the pipeline is selection under budget pressure.

---

## The "queue always full" steady-state picture

Combining all three layers when the system is at capacity:

```
                     RSS feeds publish
                          │
                          ▼
                ┌──────────────────┐
                │  Fetch (always)  │  ← unbounded inflow, URL-dedup
                └──────────────────┘
                          │
                          ▼
              State 1 queue (unanalyzed)
              ───────────────────────────
              Size ≈ inflow × 14 days
              Truncation: age-out at 14d
              Pickup: newest-per-feed,
                      fair allocation across feeds
                          │
                          ▼ analyze_batch_size per run
                          │
              ┌──────────────────┐
              │  Analyze (batch) │
              └──────────────────┘
                          │
                          ▼
              State 2 queue (unsummarized)
              ───────────────────────────
              Size ≈ inflow × 14 days
                      (analyze-fair)
              Truncation: age-out at 14d
              Pickup: highest-value first
                          │
                          ▼ summarize_batch_size per run
                          │
              ┌──────────────────┐
              │ Summarize (batch)│
              └──────────────────┘
                          │
                          ▼
              State 3 (visible on dashboard)
              Composite score = LLM scores + freshness
                                + authority + uniqueness
              Top 50 shown to user
```

### Three properties that make overload safe

1. **Bounded memory**: Every queue is capped at `daily_inflow × 14_days`
   by the recency window. The DB grows linearly with inflow, not
   quadratically with backlog.

2. **Graceful degradation**: When inflow > capacity, the system doesn't
   panic, doesn't queue infinitely, doesn't FIFO-starve. Each layer picks
   its "best slice" by a well-defined criterion:
   - Fetch picks **everything** (inflow side is unbounded but State 1 is capped)
   - Analyze picks **newest-per-feed** with **fair distribution**
   - Summarize picks **highest-value** across all feeds
   - The long tail is silently dropped

3. **Independent budgets**: Analyze and summarize have separate `batch_size`
   settings. You can tune them independently based on LLM cost vs.
   user-facing latency. If summaries feel slow, raise `summarize_batch_size`.
   If analyze is slow, raise `analyze_batch_size`. No coupling.

### Three user-facing knobs for policy control

All of these are settings, tunable via the UI without code changes:

| Knob | Controls | Where it lives |
|---|---|---|
| `analyze_weight` per feed | Share of analyze budget that feed gets per run | Feeds settings tab |
| `authority_score` per feed | Weight in composite ranking (dashboard sort order) | Feeds settings tab |
| `analyze_batch_size` / `summarize_batch_size` | LLM budget per run | Scheduler settings tab |
| `weight_*` + `freshness_lambda` | Composite score formula | Scoring settings tab |

**Rule of thumb for tuning under overload**:
- Dashboard too skewed toward one feed → lower that feed's `authority_score`
- Backlog growing for a feed you care about → raise that feed's `analyze_weight`
- Backlog growing system-wide → raise `analyze_batch_size` (costs more LLM
  but scales capacity)
- Too much LLM cost → lower `analyze_batch_size` (accepts more aging-out
  at the cost of coverage)

---

## Implementation status

| Layer | Pickup policy | Status |
|---|---|---|
| Fetch | URL-dedup + per-feed logging | ✅ Phase 5 + Phase 10.1 |
| Analyze | Weighted allocation + spillover + round-robin + 14d window | ✅ Phase 10 + 10.1 |
| Summarize | Value-first + 14d window + enabled filter | 🔲 **Proposed as Phase 11** |

**Phase 11 scope** (if approved): rewrite the `summarizeUnsummarized()`
query in `apps/api/src/services/summarize.ts` to add
`ORDER BY (relevance + importance) DESC, published_at DESC`, the 14-day
window filter, and the `feeds.enabled = true` check. ~15 lines of code,
no new schema, no new settings, no new tests required (the summarize mock
doesn't care about the internal query shape).
