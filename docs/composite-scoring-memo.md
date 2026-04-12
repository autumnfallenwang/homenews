# LLM Pipeline Redesign — Design Memo

Status: **approved brainstorm / ready for planning** — will drive the next refactor phase after current Phase 5 (iOS) work.

## Summary of decisions

1. **Composite scoring** — replace single relevance score with weighted sum of multiple dimensions
2. **Drop clustering** — remove the separate clustering LLM call and `ranked.cluster` column
3. **Drop labels entirely** — no label concept, tags serve the classification + filter role
4. **Controlled tag vocabulary** — tags picked from a fixed collection, not free-form
5. **Two LLM calls per article** — one structured analyze call, one generative summarize call
6. **Per-task model selection** — cheap model for analyze, better model for summarize

---

## Part 1: Composite Scoring

### Problem

The current single LLM relevance score (0-100) clusters too high — most AI/tech articles from our feeds score 90-100 since they're all relevant by definition. This makes the score useless for ranking and filtering within our feed.

### Solution

Replace the single score with a **composite score** that combines multiple dimensions, each measuring a different aspect of article value. The final rank is a weighted sum.

### Dimensions

| Dimension | Source | Type | Notes |
|-----------|--------|------|-------|
| **Relevance** | LLM (analyze call) | Static | How related to AI/ML (0-100) — existing |
| **Importance** | LLM (analyze call) | Static | How significant/impactful — breakthrough vs. incremental |
| **Freshness** | Algorithm | Dynamic | Exponential decay from `publishedAt` — no LLM needed |
| **Source authority** | Config per feed | Static | Some feeds are higher signal (arXiv, OpenAI blog) |
| **Uniqueness** | Algorithm | Static | Inverse of duplicate count — reduces redundancy |
| **Engagement** | API (future) | Dynamic | HN upvotes, Reddit score — when we add those sources |

### Composite formula

```
finalScore = w1 * relevance
           + w2 * importance
           + w3 * freshness
           + w4 * sourceAuthority
           + w5 * uniqueness
```

All dimensions normalized to 0-1 before weighting. Weights configurable via env vars (and eventually user settings).

**Freshness formula:** `freshness = e^(-λ * hoursOld)`
- λ = 0.03 → half-life ~23 hours (fast news cycle)
- λ = 0.01 → half-life ~69 hours (slower decay)

### Default weights (starting point, needs tuning)

- relevance: 0.15 (less weight since all articles are relevant)
- importance: 0.35 (main differentiator)
- freshness: 0.25 (strong time pressure)
- sourceAuthority: 0.10
- uniqueness: 0.15

### Computation strategy

**Query-time computation** — store individual dimension scores, compute composite in the API query:

```sql
SELECT *,
  (w1 * relevance
   + w2 * importance
   + w3 * exp(-0.03 * hours_old)
   + w4 * source_authority
   + w5 * uniqueness) AS composite_score
FROM ranked
INNER JOIN feeds ON ...
ORDER BY composite_score DESC
```

Freshness is always up-to-date, no periodic recomputation needed.

---

## Part 2: Pipeline Restructure — Two LLM Calls

### Decision

Replace the current 3 LLM steps (score, cluster, summarize) with 2 LLM calls grouped by cognitive task:

**Call 1: `analyze` — structured classification (cheap model)**
- One JSON response per article
- Inputs: title + article summary (not full content)
- Outputs: `{ relevance, importance, tags[] }`

**Call 2: `summarize` — generative writing (better model)**
- Plain text response per article
- Inputs: title + summary + content (truncated to 2000 chars)
- Output: 2-3 sentence natural-language summary

### Why two calls instead of one mega-call or four separate calls

**Against one mega-call:**
- Mixing structured classification with generative writing degrades both
- Can't use different models for different cognitive tasks
- Single parsing failure loses everything

**Against separate calls per dimension:**
- Wastes tokens (send the article 4+ times)
- Relevance/importance/tags are a single cognitive act — "read and classify this article"
- More orchestration, more failure points

**Two calls is the sweet spot:**
- Article content sent ~2 times (not 4+)
- Each prompt has a focused task → better quality
- Classification (cheap) and writing (quality) can use different models
- If one fails, the other still works
- Matches the per-task model config we already built in Task 16

### Why we drop clustering

- Free-form labels sprawl (many 1-article clusters)
- No cross-batch label consistency ("ChatGPT workflows" vs "ChatGPT features")
- Adds a 3rd LLM call for marginal value
- Tags (multi-value, controlled vocabulary) serve filtering better than a single cluster label

---

## Part 3: Controlled Tag Vocabulary

### Decision

Tags are picked from a **fixed collection** (Option A: pre-defined taxonomy), not free-form.

### Starting vocabulary (needs tuning with real data)

```
Topic areas:
  ai-research, ml-theory, nlp, computer-vision, reinforcement-learning,
  robotics, ai-safety, ai-ethics, ai-regulation

Products/releases:
  model-release, product-launch, feature-update, open-source

Content types:
  tutorial, explainer, opinion, news, paper, benchmark, interview

Entities:
  openai, anthropic, google, meta, microsoft, apple, nvidia,
  deepmind, huggingface, mistral, xai

Applications:
  coding, agents, chatbot, multimodal, fine-tuning, rag, inference
```

~30-40 tags initially. The LLM picks 1-5 applicable tags per article from this list.

### Why Option A (fixed) instead of Option B (grow-only)

- Simple — no vocabulary management, no cleanup job
- Predictable — UI can show all possible filter buttons up front
- For a personal AI news tool, the vocabulary is narrow and stable
- If we need a new tag, we add it to the config and rescore
- Aligns with "keep it simple" lessons from the project

### Vocabulary storage

Start with a plain TypeScript constant in `llm-registry.ts`:

```ts
export const ALLOWED_TAGS = [
  "ai-research", "model-release", "openai", ...
] as const;

export type Tag = typeof ALLOWED_TAGS[number];
```

The analyze prompt includes the full list and instructs the LLM to pick only from it. Post-parse, we filter out any hallucinated tags not in the list.

---

## Part 4: User-Facing Controls

Once composite scoring + controlled tags are in place, expose these to users:

1. **Multiple ranked views**
   - "Most relevant" (sort by relevance)
   - "Most important" (sort by importance)
   - "Freshest" (sort by freshness)
   - "Balanced" (composite — default)

2. **Weight sliders**
   - Let the user tune `w_relevance`, `w_importance`, `w_freshness`, etc.
   - Save per-user (localStorage for now, user settings DB table later)

3. **Tag filters**
   - Multi-select from the controlled vocabulary
   - Show count per tag (like current cluster filter)

4. **Min-score threshold** — already exists (`?minScore=`), add a slider to the UI

---

## Part 5: Schema Changes

### Add columns

- `ranked.importance` — INTEGER (0-100)
- `feeds.authority_score` — REAL (0-1), defaults to 0.5

### Remove columns (after migration)

- `ranked.cluster` — deprecated, replaced by tags
- `ranked.llmSummary` stays (but now comes from `summarize` call)

### Tag storage

- `ranked.tags` stays as `TEXT[]` — no change needed, just enforce vocabulary at write time

---

## Part 6: Registry Changes

### Remove tasks

- `clustering` — gone entirely

### Modify tasks

**`analyze` (replaces `scoring`)**
- System prompt: "Analyze this article. Return JSON with relevance (0-100), importance (0-100), and tags (pick 1-5 from the allowed list: [...])"
- Output format: `json`
- Model: cheap (e.g. `gemma3:27b` or `gpt-5.1-codex-mini`)

**`summarize` (existing, unchanged format)**
- System prompt: same as today
- Output format: `text`
- Model: better (e.g. `gpt-5.3-codex`)

---

## Part 7: Migration Path

1. Add new columns (`importance`, `authority_score`) via Drizzle migration
2. Build the new `analyze` task in the registry (keep old `scoring` working)
3. Run both in parallel for a test batch — compare results
4. Switch scheduler to call `analyze` + `summarize` (skip `clustering`)
5. Update API query to compute composite score
6. Update frontend to show new dimensions, weight sliders, tag filters
7. Drop `cluster` column in a cleanup migration

---

## Open Questions (for decision before implementation)

Each question has a recommendation. Mark decisions inline as we go.

### Scoring dimensions & weights

**Q1: Freshness decay rate (λ)**
- How fast should articles lose value over time?
- Options: 0.03 (23h half-life, fast news cycle) vs 0.01 (69h half-life, slower)
- **Recommendation:** 0.03 — AI news moves fast
- **Decision:** λ = 0.03 as starting value, stored in DB settings table (see Q1b below)

**Q1b: Settings storage mechanism (raised during Q1 discussion)**
- Where do tunable constants (weights, λ, thresholds) live — `.env`, DB, or hybrid?
- Discussion: `.env` can't support multi-user future; DB scales naturally by adding nullable `userId` column later
- **Decision:** Hybrid approach — DB table for tunable settings, `.env` for infrastructure
  - **DB `settings` table** holds all tunable values (weights, λ, defaults like `minScore`)
  - **`.env`** stays for infrastructure only (DB URL, LLM gateway URL, model names, port, fetch interval)
  - **Code constants** (`@homenews/shared/DEFAULT_SETTINGS`) provide fallbacks when DB row is missing
- **Schema design (forward-compatible for multi-user):**
  ```ts
  settings = {
    id: uuid,
    userId: uuid | null,    // NULL = system default; added now even though unused
    key: text,              // "weight_relevance", "freshness_lambda", etc.
    value: text,            // always stored as string, parsed per-type
    valueType: "number" | "string" | "boolean" | "json",
    description: text,      // for UI tooltip
    updatedAt: timestamp,
    // unique (userId, key)
  }
  ```
- **Lookup order:** userId-specific → userId-null (system default) → code DEFAULT_SETTINGS
- **Multi-user migration:** just `ALTER TABLE settings` to enforce `userId` — no data migration
- **Includes:** new `/settings` page in web UI, GET/PATCH API endpoints, Zod schemas in shared
- **Defers:** authentication, per-user routing, permissions

**Q2: Default weight values**
- Proposed: relevance 0.15, importance 0.35, freshness 0.25, source authority 0.10, uniqueness 0.15
- Do we keep these defaults, or adjust before implementing?
- **Decision:** Accept proposed values as starting defaults, tunable via settings page (per Q1b). These are seed values in `DEFAULT_SETTINGS` — real values live in DB once edited.

**Q3: Missing publishedAt**
- What freshness value do articles with no publication date get?
- Options: 0.5 (medium), 0 (treat as oldest), fall back to fetchedAt
- **Decision:** Fall back to `fetchedAt` — always present, closest proxy for article recency. Query logic: `COALESCE(published_at, fetched_at)` in the freshness computation.

### Feed authority

**Q4: How to assign source authority scores**
- Manual per-feed config? Default 0.5 with overrides?
- **Decision:** Add `authority_score` REAL column to `feeds` table (default 0.5). Seed with starting values below. Editable via feed management page (new input column in the feeds table UI).
- **Starting values for seeded feeds:**
  - OpenAI Blog: 0.95
  - Google AI Blog: 0.90
  - arXiv cs.AI / cs.CL / cs.LG: 0.90
  - Hugging Face Blog: 0.85
  - MIT Tech Review AI: 0.80
  - Ars Technica AI: 0.70
  - VentureBeat AI: 0.60

### Tag vocabulary

**Q5: Finalize the tag list now?**
- Draft has ~40 tags across 5 categories (topics, products, content types, entities, applications)
- Options: finalize now, leave for implementation, or iterate with real data
- **Decision:** Finalize starting list (below) and store as a **setting** in the DB settings table (key: `allowed_tags`, valueType: `json`), NOT as a code constant. The `analyze` task reads the list from settings at call time, so changes take effect immediately for new articles with no rescoring of existing data.

### Starting tag vocabulary (~40 tags)

**Topic areas (9):**
`ai-research`, `ml-theory`, `nlp`, `computer-vision`, `reinforcement-learning`, `robotics`, `ai-safety`, `ai-ethics`, `ai-regulation`

**Products/releases (4):**
`model-release`, `product-launch`, `feature-update`, `open-source`

**Content types (6):**
`tutorial`, `explainer`, `opinion`, `paper`, `benchmark`, `interview`
(dropped `news` — redundant since everything is news)

**Entities (10):**
`openai`, `anthropic`, `google`, `meta`, `microsoft`, `apple`, `nvidia`, `deepmind`, `huggingface`, `mistral`
(dropped `xai` — less common, add later if needed)

**Applications (9):**
`coding`, `agents`, `chatbot`, `multimodal`, `fine-tuning`, `rag`, `inference`, `video-generation`, `audio-generation`
(added `video-generation`, `audio-generation`, `dataset` for growing areas)

**Applications extras (1):**
`dataset`

Total: ~39 tags. Seeded into DB on first run.

### Behavior when vocabulary changes

- **Adding a tag** — new articles can use it going forward, existing articles unaffected
- **Removing a tag** — existing articles keep their historical tag (frozen in `ranked.tags` array), but it's no longer shown as a filter option
- **No backfill** — we never regenerate tags for existing articles; vocabulary changes are forward-only
- **Write-time validation** — the analyze pipeline filters LLM output against the *current* allowed list at call time, storing only valid tags

### Prompt template with placeholders

Since the tag list is dynamic (stored in settings), the `analyze` system prompt becomes a **template** that injects the current vocabulary at call time:

**Registry shape:**
```ts
analyze: {
  name: "analyze",
  description: "Classify article: relevance, importance, and tags",
  outputFormat: "json",
  model: resolveModel("LLM_MODEL_ANALYZE"),
  systemPromptTemplate: `You are a news article analyzer for an AI/ML/tech news feed.
For each article, produce three classifications:
1. Relevance score (0-100): how related to AI/ML/tech
2. Importance score (0-100): how significant — breakthrough vs incremental
3. Tags: pick 1-5 from the allowed list below. Do NOT invent new tags.

Allowed tags:
{{ALLOWED_TAGS}}

Respond ONLY with valid JSON:
{"relevance": <0-100>, "importance": <0-100>, "tags": [<strings>]}`,
}
```

**Resolver:**
```ts
export async function getSystemPrompt(task: LlmTaskName): Promise<string> {
  const config = llmTasks[task];
  let prompt = config.systemPromptTemplate;
  if (prompt.includes("{{ALLOWED_TAGS}}")) {
    const tags = await getSetting("allowed_tags");
    prompt = prompt.replace("{{ALLOWED_TAGS}}", tags.join(", "));
  }
  return prompt;
}
```

The executor calls `getSystemPrompt(task)` instead of reading the static prompt. Any future dynamic value uses the same `{{PLACEHOLDER}}` pattern.

**Separation principle:** Template (structure) stays in code for version control and auditability. Placeholders (data) live in settings for hot-reload and user control. Users cannot edit the prompt structure itself, only the values injected into it.

**Q6: Handling LLM hallucinated tags**
- If LLM returns a tag not in the allowed list, what do we do?
- Options: drop silently, log warning, error out, keep but flag
- **Decision:** Drop + log warning. Filter tags array against current vocabulary at write time, keep only valid ones. Log format: `[analyze] Dropped unknown tag "chatgpt" for article "GPT-5 Released"`. The rest of the analyze output (relevance, importance) is preserved — invalid tags don't fail the whole call.
- **Future enhancement (deferred):** Track rejected tag counts in settings as a "suggestion queue" — settings page could show frequently-suggested tags for one-click addition to vocabulary. Not in scope for first refactor.

**Q7: Tag storage**
- Keep `ranked.tags TEXT[]` as-is, or create separate `tags` table?
- **Decision:** Keep `ranked.tags TEXT[]` array column. Already implemented, vocabulary enforced at write time, simpler than a join table. Add a GIN index when tag filtering is added: `CREATE INDEX ranked_tags_gin_idx ON ranked USING GIN (tags)` for fast `WHERE 'tag' = ANY(tags)` queries.

### Architecture

**Q8: Composite score storage vs compute**
- Store `ranked.compositeScore` or compute in SQL query every time?
- **Decision:** Compute in query, not stored. Use a Drizzle-managed **view** for joins only (`ranked_with_article` = ranked ⋈ articles ⋈ feeds), then compute freshness and composite score in the API query with weights/λ injected from the settings table.
- **Architecture:**
  - **View** (created once via migration): joins ranked + articles + feeds, no math
  - **API route** per-request flow:
    1. Read weights + λ from settings table (1 small SELECT)
    2. Build query: `SELECT *, EXP(-:lambda*...) AS freshness, (:w_rel * relevance + ...) AS composite FROM ranked_with_article ORDER BY composite DESC`
    3. Execute against Postgres
    4. Return JSON
  - **Settings changes take effect on next request** — no recompute, no cache invalidation, no batch update
  - **Optional optimization:** in-memory settings cache with 10s TTL (defer until needed)
- **Why this works:** composite score is a derived value, not state. View handles boilerplate, query handles math, settings provide parameters. Freshness is always current because `NOW()` is evaluated per query.

**Q9: Rescoring existing articles / migration strategy**
- When we switch to new pipeline, rescore existing articles or only new ones?
- Current state: ~1,400 unprocessed articles + 5 already processed with old pipeline
- **Decision:** **Clean slate for this refactor.** Since we're in dev with only 5 throwaway rows, we rename/drop freely (see Q13) and rescore everything via the new pipeline. The additive migration pattern below is kept as reference material for when we go to production.
- **Clean-slate steps:**
  1. Drop the old `ranked` table (or migrate via Drizzle push --force)
  2. Create new `article_analysis` table with clean schema (see Q13)
  3. Let the scheduler backfill all 1,479 articles via `analyze` + `summarize`
- **Rule of thumb going forward:** in dev, clean breaks are fine; in production, use the additive pattern below.

### Migration principle (reference for future production changes)

**Never remove columns or data. Only add.** Rules:
- Add new columns freely (nullable, with defaults)
- Deprecate old columns by stopping writes, but keep in schema
- Add new tables for new concepts; don't repurpose existing
- Rename via add-new-column + backfill, never `ALTER COLUMN RENAME`
- `COALESCE(new, old)` in queries for graceful fallback

### Phase 1: Expand (schema additions only)

```sql
-- Settings infra with multi-user forward compat
CREATE TABLE settings (
  id UUID PRIMARY KEY,
  user_id UUID NULL,              -- for future multi-user
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

-- New scoring dimensions (nullable — coexist with old score)
ALTER TABLE ranked ADD COLUMN relevance INT;
ALTER TABLE ranked ADD COLUMN importance INT;

-- Feed authority
ALTER TABLE feeds ADD COLUMN authority_score REAL NOT NULL DEFAULT 0.5;

-- View for joins (no math)
CREATE VIEW ranked_with_article AS
SELECT r.*, a.title, a.published_at, a.fetched_at, f.name AS feed_name, f.authority_score
FROM ranked r
INNER JOIN articles a ON r.article_id = a.id
INNER JOIN feeds f ON a.feed_id = f.id;
```

### Phase 2: Migrate (gradual backfill)

**What we KEEP** (never delete in this phase):
- `ranked.score` — existing relevance 0-100
- `ranked.cluster` — existing cluster labels
- `ranked.tags` — existing free-form tags
- `ranked.llmSummary` — existing summaries

**Scheduler logic becomes:**
```
For each article:
  if no ranked row:
    → run full analyze + summarize (new pipeline)
  else if ranked.relevance IS NULL:
    → run analyze only (backfill new dimensions)
  else:
    → skip (fully processed)
```

**Tags during migration:** the `analyze` pipeline overwrites `ranked.tags` with controlled-vocabulary tags when it processes each article. During migration, some articles have old free-form tags, some have new. Invalid old tags just don't match new filters and fade out naturally. Alternative: use a new `tags_v2` column if we want total separation — decide at implementation time.

**Composite score query uses COALESCE** for graceful fallback:
```sql
SELECT *,
  COALESCE(r.relevance, r.score)::real / 100 AS relevance_norm,
  COALESCE(r.importance, 50)::real / 100 AS importance_norm,
  ...
```

Articles with only old data get `importance = 50` (neutral) until backfilled.

### Phase 3: Contract (optional, much later)

Once 100% of articles are backfilled AND no code reads old columns:

```sql
-- Maybe months later, maybe never
ALTER TABLE ranked DROP COLUMN score;
ALTER TABLE ranked DROP COLUMN cluster;
```

For a personal tool, unused columns cost nothing. May skip this phase entirely.

### Why this approach (even for dev)

- **Zero data loss** — the 5 old articles keep their score/tags/summary
- **Zero downtime** — old code still works during deploy
- **Rollback safety** — revert doesn't require data migration
- **Dual-run validation** — could run old and new pipelines side by side to compare
- **Production habit** — forces us to think additively, which pays off later

**Q10: Weight storage (user settings)**
- Server-side DB or localStorage?
- **Decision:** DB-only via the `settings` table (already established in Q1b). No localStorage, no client cache.
  - Phase 1 (now): single-user, rows stored with `user_id = NULL`, everyone reads the same values
  - Phase 2 (future multi-user): authenticated users get `user_id = <uuid>` rows, lookup order is user-specific → NULL default → code default
  - SSR renders with current settings from DB — fast and always correct
  - Settings page edits trigger PATCH + refetch, no sync complexity
- This makes Q10 a duplicate of Q1b — kept for clarity, same storage mechanism applies.

### Scheduler / pipeline

**Q11: Partial success handling**
- If `analyze` succeeds but `summarize` fails, does the article still show up?
- **Decision:** Keep graceful nulls with one explicit rule: **`analyze` is required, `summarize` is optional**.

### Rules

- **Analyze must succeed** for an article to appear in `/ranked`. Without scores (relevance, importance), there's nothing to rank by. If analyze fails, skip the article — it will be retried on the next scheduler run.
- **Summarize is best-effort.** If it fails, the article still ranks and the UI falls back to `article.summary` (the original RSS summary) for display.

### Scheduler/pipeline flow

```ts
// For each unprocessed article:
try {
  const analysis = await llmExecute("analyze", prompt);
  await db.insert(ranked).values({
    articleId: article.id,
    relevance: parsed.relevance,
    importance: parsed.importance,
    tags: filterTagsAgainstVocab(parsed.tags),
  });
} catch (err) {
  // Skip — retry next run
  continue;
}

// Summarize is best-effort, independent try/catch
try {
  const summary = await llmExecute("summarize", prompt);
  await db.update(ranked).set({ llmSummary: summary.raw }).where(...);
} catch (err) {
  // Log but don't fail — article still appears without AI summary
}
```

### Retry behavior

On the next scheduler run:
- Articles with no `ranked` row → retry `analyze` (+ `summarize` if analyze succeeds)
- Articles with `ranked` row but `llmSummary IS NULL` → retry `summarize` only

Same "find rows where X IS NULL" pattern the old pipeline already uses.

**Q12: Migration path safety — dropping old columns**
- Keep old `cluster` column during migration or drop immediately?
- **Decision:** **Keep forever (for now).** Per Q9's additive migration principle, never delete columns. The `cluster` column stays in the schema with a deprecation comment. New pipeline doesn't write to it. Existing 5 rows keep their cluster values as historical data.
- **Drizzle schema:** keep the `cluster` column definition with a `// deprecated — no longer written, kept for historical data` comment. Drizzle still manages it (migrations work), but no code writes to it.
- **API query:** simply omit `cluster` from SELECT/response shape.
- **Future cleanup:** if/when we ever need to drop it, do it as a separate contract-phase migration after long verification. For a personal tool with tiny data, likely never.

### Naming

**Q13: Rename the `ranked` table?**
- Currently misleading — table stores analysis data, not a ranking
- **Decision:** **Rename `ranked` → `article_analysis`** in both SQL and TypeScript. Drop legacy columns. Clean schema from day one.

### Clean target schema

```ts
export const articleAnalysis = pgTable("article_analysis", {
  id: uuid("id").primaryKey().defaultRandom(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id)
    .unique(),
  relevance: integer("relevance").notNull(),       // 0-100
  importance: integer("importance").notNull(),     // 0-100
  tags: text("tags").array().notNull().default([]), // controlled vocabulary
  llmSummary: text("llm_summary"),                  // nullable (summarize is best-effort)
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### Dropped from the old schema

- `score` — replaced by `relevance`
- `cluster` — no clustering in new pipeline
- `rankedAt` — renamed to `analyzedAt` to match the new concept

### Renamed column

- `ranked_at` → `analyzed_at`

### Benefits

- **Self-documenting table name** — `article_analysis` matches what it actually stores
- **No COALESCE fallback logic** — every row has relevance and importance (NOT NULL)
- **No dead columns** — clean schema inspection
- **Matches the new model** — no tension between legacy and new concepts

### Related view renaming

The view in Q8 also gets a cleaner name:
```sql
CREATE VIEW article_analysis_with_feed AS
SELECT aa.*, a.title, a.published_at, a.fetched_at, f.name AS feed_name, f.authority_score
FROM article_analysis aa
INNER JOIN articles a ON aa.article_id = a.id
INNER JOIN feeds f ON a.feed_id = f.id;
```

**Q15: Scheduler settings & manual pipeline triggers**
- Should scheduler config (FETCH_INTERVAL, enable toggles, batch size) live in the settings table?
- Should there be UI buttons to manually trigger each pipeline step?
- **Decision:** Yes to both.

### Scheduler settings

Move scheduler config into the settings table with bootstrap fallback to `.env`:

- `scheduler_enabled` — boolean, master on/off
- `fetch_interval` — cron expression, default from `FETCH_INTERVAL` env var
- `analyze_enabled` — boolean, allow auto-run of analyze task
- `summarize_enabled` — boolean, allow auto-run of summarize task
- `analyze_batch_size` — integer, max articles to analyze per scheduler tick (rate limiting)
- `summarize_batch_size` — integer, max articles to summarize per scheduler tick

Changing `fetch_interval` requires an internal `scheduler.stop()` + `scheduler.start()` — implement a hook that runs when the setting is updated.

### Manual pipeline triggers

New admin API endpoints:
- `POST /admin/pipeline/fetch` — trigger fetch for all enabled feeds (already exists as `/feeds/fetch`, may reuse)
- `POST /admin/pipeline/analyze` — run analyze on all unanalyzed articles
- `POST /admin/pipeline/summarize` — run summarize on all unsummarized articles
- `POST /admin/pipeline/run-all` — fetch + analyze + summarize in sequence

UI: a **Pipeline Control** section on the settings page with:
- "Run fetch now" button
- "Run analyze now" button
- "Run summarize now" button
- "Run full pipeline" button
- Display last-run timestamps and stats (X fetched, Y analyzed, Z summarized)

### Settings page structure (revised)

```
/settings page sections:
├── Scoring weights
│   ├── w_relevance, w_importance, w_freshness, w_authority, w_uniqueness sliders
│   └── reset to defaults button
├── Freshness
│   └── λ decay rate slider
├── Tag vocabulary
│   ├── Editable list (add/remove tags)
│   └── Warning: "Changes apply to new articles only"
├── Scheduler
│   ├── Master enable toggle
│   ├── Fetch interval cron input
│   ├── Analyze enable toggle + batch size
│   └── Summarize enable toggle + batch size
├── Pipeline control (manual triggers)
│   ├── Run fetch / analyze / summarize / full pipeline buttons
│   └── Last-run stats display
└── Default filters
    └── minScore default slider
```

---

**Q14: Rename the LLM tasks**
- `scoring` → `analyze`? Since it now does more than score.
- Also rename `summarization` → `summarize` for consistency (both as verbs).
- **Decision:** Rename both tasks.
  - `scoring` → `analyze` (produces relevance, importance, tags — classification)
  - `summarization` → `summarize` (text generation)
  - `clustering` → removed entirely (dropped in Q5/pipeline restructure)

### Registry changes

```ts
// Remove old
scoring: { ... }       // gone
clustering: { ... }    // gone

// Add new
analyze: {
  name: "analyze",
  description: "Classify article: relevance, importance, and tags",
  systemPromptTemplate: `...{{ALLOWED_TAGS}}...`,
  outputFormat: "json",
  model: resolveModel("LLM_MODEL_ANALYZE"),
}

// Rename
summarization → summarize: {
  name: "summarize",
  description: "Write 2-3 sentence article summaries",
  systemPromptTemplate: `...`,
  outputFormat: "text",
  model: resolveModel("LLM_MODEL_SUMMARIZE"),
}
```

### Env var changes

- `LLM_MODEL_SCORING` → `LLM_MODEL_ANALYZE`
- `LLM_MODEL_CLUSTERING` → removed
- `LLM_MODEL_SUMMARIZATION` → `LLM_MODEL_SUMMARIZE`

### File renames

- Delete: `apps/api/src/services/scoring.ts`, `clustering.ts`
- New: `apps/api/src/services/analyze.ts`
- Rename: `summarization.ts` → `summarize.ts`
- Tests follow the same pattern

## Next Steps

When we pick this up as a new phase:

1. Draft the `analyze` system prompt + test on sample articles
2. Add schema migration for `importance` and `authority_score`
3. Build new `analyze` task in llm-registry (side-by-side with old `scoring` for comparison)
4. Update scheduler to call `analyze` + `summarize` in sequence
5. Compute composite score in API query
6. Update frontend: new tag filter UI, weight sliders, multi-view sort
7. Drop old `scoring`, `clustering` tasks and `cluster` column
