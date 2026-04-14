# Phase 14 — Capture (reader mode + per-article interactions)

Locked design memo. First half of the "personal knowledge base" stack — capturing articles well enough that retrieval and synthesis (Phase 15+) have something worth working with.

## Why this phase

Today the dashboard is a news feed. Click an article → leave the app → read on the source. Nothing persists; no state beyond "it was scored and shown". Phase 14 turns every article into a durable object with state, annotations, and its full content stored locally so the next phase (Find) can search, retrieve, and eventually synthesize over a real corpus.

## Locked design decisions

### 1. Reader mode via `@mozilla/readability` + `jsdom`

- **POC validated** — [poc/reader-extract/](../poc/reader-extract/) extracted 8/8 diverse sources (Ars Technica, DeepMind, Hugging Face, MIT Tech Review, Microsoft Research, NVIDIA Developer, OpenAI Blog, arXiv) on the first pass. Plain `fetch()` + Readability is enough for the current corpus — no Playwright, no headless Chrome.
- **Gate extraction on analyze, not summarize, not lazy** — extraction runs inside the analyze phase of the pipeline for every article that earns a composite score. That's the bar for "user could plausibly see this article," so every visible article has full content stored at the same moment it becomes visible. Un-analyzed articles (which are invisible via the `article_analysis_with_feed` view's inner join) are not extracted.
- **Why not lazy on first view** — I originally had this as lazy-on-demand. Rejected because Phase 15 needs the extracted content indexed (tsvector + embedding) during the pipeline, not when the user happens to click. Lazy extraction would leave a large portion of the visible corpus un-searchable.
- **Why not gate on summarize** — summarize is batch-limited and often runs behind analyze. Analyzed-but-not-summarized articles show up on the dashboard *today* with `llm_summary = null`. Gating extraction on summarize would leave them with no full content despite being visible.
- **Side-effect win**: the summarize LLM call can now read `extracted_content` from the DB instead of the often-thin RSS `summary`, so summaries get richer for free.
- **Fallback** — when Readability returns null (some SPAs / strict paywalls), set `extraction_status = 'failed'` + preserve error, show a notice + prominent "Open original ↗" link on the detail page.
- **Skip extraction if we already have full content** — check `articles.content` first (some feeds like arXiv, most Substacks ship full text in RSS). Copy into `extracted_content` directly without a fetch. Only hit the network when `content` is empty or short.
- **Google News proxy URLs**: out of scope for Phase 14. These need a separate redirect-resolver layer. For now, lab-proxy feeds fall back to "Open original" which bounces through Google News anyway.

### 2. State table for partial articles

The pipeline produces articles in three visible states. Every state has a defined fallback so the UI never shows a broken surface.

| State | Visible on dashboard? | `extracted_content` | `llm_summary` | Dashboard card | Detail page | Search |
|---|---|---|---|---|---|---|
| Fetched only | ❌ (view filter) | — | — | — | — | — |
| **Analyzed** (freshly scored) | ✅ | ✅ (filled by new extract step) | ❌ null | Falls back to RSS `summary`; tiny `· PENDING SUMMARY` mono badge in the meta strip | Full `extracted_content` rendered; no AI summary card | Full text indexed; embedding computed |
| **Summarized** | ✅ | ✅ | ✅ | Shows `llm_summary` | Full content + amber AI summary card above | Full text indexed; embedding computed |

Key properties:
- **Reader mode works uniformly** — every visible article has full content in the detail page. The summarize phase becomes purely a presentation enhancement (dashboard blurb + AI summary card).
- **No lazy extraction fallback needed** — the "user opens an article that was never processed" edge case I worried about earlier doesn't exist, because analyze → extract happens in one sweep.
- **`PENDING SUMMARY` badge** is subtle, informational, muted mono small-caps. Disappears automatically when summarize catches up on that article.

### 3. Tags — separate storage, merged UI

**Storage is split, display is flat.** Two different columns, one chip row.

- `article_analysis.tags` — LLM-generated, constrained to `ALLOWED_TAGS`. Unchanged.
- `article_interactions.user_tags` — user-authored, free-form, per-article.
- **Never mutate `ALLOWED_TAGS` from user input.** Adding a user tag writes to `user_tags`; the LLM keeps picking from its own controlled vocabulary.
- **Display**: article detail page and filter bar render one deduplicated chip row. User can't tell (nor needs to) which tags came from which column.
- **Filter semantics**: `?tags=X` matches if X appears in **either** column via SQL `OR` over two `arrayOverlaps` calls. One param, two-column match.
- **Autocomplete**: the tag input on the article page suggests from the union of `ALLOWED_TAGS` + previously-used user tags.

Why split at the schema level: keeps the LLM training signal clean for Phase 7 (feedback loop) and makes it possible to ask "which tags did the LLM pick?" vs "which did I add?" even though the UI hides the distinction.

### 4. Phase 14A vs 14B split

**14A is small and shippable in a few days.** 14B (highlights) is the higher-value but substantially more complex half. Ship 14A first so the app is usable while 14B is in flight.

## Schema

### Phase 14A additions

```sql
-- extend articles for reader mode cache
ALTER TABLE articles ADD COLUMN extracted_content text;
ALTER TABLE articles ADD COLUMN extracted_at timestamptz;
ALTER TABLE articles ADD COLUMN extraction_status text; -- 'ok' | 'failed' | 'pending'

-- new per-user, per-article state
CREATE TABLE article_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id uuid NULL,  -- nullable for single-user / forward-compat
  viewed_at timestamptz,
  read_at timestamptz,
  starred boolean NOT NULL DEFAULT false,
  note text,
  user_tags text[] NOT NULL DEFAULT '{}',
  follow_up boolean NOT NULL DEFAULT false,
  reading_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, user_id)
);
CREATE INDEX article_interactions_article_idx ON article_interactions (article_id);
CREATE INDEX article_interactions_user_idx ON article_interactions (user_id);
CREATE INDEX article_interactions_starred_idx ON article_interactions (starred) WHERE starred = true;
CREATE INDEX article_interactions_follow_up_idx ON article_interactions (follow_up) WHERE follow_up = true;
```

### Phase 14B additions

```sql
CREATE TABLE article_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id uuid NULL,
  text text NOT NULL,
  note text,
  char_start integer,  -- optional DOM offset for re-anchoring
  char_end integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX article_highlights_article_idx ON article_highlights (article_id);
CREATE INDEX article_highlights_user_idx ON article_highlights (user_id);
CREATE INDEX article_highlights_created_idx ON article_highlights (created_at DESC);
```

## Reader mode implementation

New service: `apps/api/src/services/reader.ts`

```ts
export async function extractArticle(url: string): Promise<ExtractionResult>;
```

- Uses `@mozilla/readability` + `jsdom` (already validated in POC)
- Fetches with a browser-like user-agent, follows redirects, 10s timeout
- Returns `{ ok, content, title, byline, excerpt, length, error }`
- Strips `<script>` tags server-side before parsing (defense-in-depth; scripts wouldn't execute server-side anyway)

**Integration point — inside the analyze phase, not a standalone endpoint.**

The analyze loop in `services/analyze.ts` gains a new step per article, before the LLM call:

1. If `articles.extracted_content` is already set → use it
2. Else if `articles.content` has substantial RSS-shipped text → copy it into `extracted_content`, set `extraction_status = 'ok'`, skip fetch
3. Else call `extractArticle(article.link)`:
   - Success → write `extracted_content`, `extracted_at`, `extraction_status = 'ok'`
   - Failure → write `extracted_at`, `extraction_status = 'failed'`, preserve error message, continue with just the RSS fields
4. The analyze LLM call uses whatever's available (`extracted_content` preferred, falls back to RSS `summary`)

**Cost**: one extra HTTP fetch + ~100ms Readability parse per analyzed article. Batches at ~100 articles per scheduler tick → ~30 seconds added per tick. Storage: ~30 KB per article × ~3k analyzed articles = ~90 MB. All trivial.

**Summarize reads from the DB** — no second extraction. By the time summarize runs, `extracted_content` is already populated, and the summarize LLM prompt uses it instead of the thin RSS summary.

**Backfill**: one-off script `apps/api/src/scripts/extract-existing.ts` walks articles with `article_analysis` rows but no `extracted_content`, runs extraction in batches, writes back. Run once after the analyze integration ships. ~15 minutes for the current ~3k corpus.

## Detail page fallback cascade

The article detail page at `/article/[id]` follows a strict cascade so it never renders a broken surface:

1. **Body**: render `extracted_content` inline in the newsroom theme. Always present when the article is visible (per the state table above). If `extraction_status = 'failed'`, skip this and show an inline notice + prominent "Open original ↗" as the primary CTA.
2. **AI summary card** (amber-bordered, above the body):
   - Show `llm_summary` if present
   - Hide the card entirely if null — don't synthesize a placeholder. The full body is right there.
3. **Meta strip** (mono small-caps, under the title):
   - Source + byline + reading time + `extracted_at` timestamp
   - `· PENDING SUMMARY` badge in muted text when `llm_summary` is null. Small, informational, vanishes when summarize catches up.
4. **Open original ↗** button: always present in the header as a secondary action, even on successful extractions.

## Per-article interaction API

New routes in `apps/api/src/routes/interactions.ts`:

- `GET /articles/:id/interaction` — returns the current user's interaction row (or empty defaults)
- `PATCH /articles/:id/interaction` — upserts fields. Body is partial: `{ read?, starred?, note?, user_tags?, follow_up? }`. `viewed_at` is set automatically on first PATCH or on detail-page open. `reading_seconds` is sent from the client when the user scrolls to bottom.
- `POST /articles/:id/interaction/view` — dedicated endpoint for auto-view tracking (lighter than full PATCH)

Zod schemas in `@homenews/shared`:
- `articleInteractionSchema`
- `updateArticleInteractionSchema`

Response shape change on `/ranked`: each row optionally includes an `interaction` object when `?include_interaction=1` is passed. Defer this to Phase 14A task "wire interaction into /ranked response" — initially the dashboard can fetch interactions lazily or just show star/read state from a separate call.

## Web UI changes

### Article detail page (`/article/[id]`)

- Server component fetches article + interaction + extracted content (all in parallel)
- Renders cleaned article body inline using the existing Fraunces/Geist Mono theme
- "Open original ↗" button prominently in the header (not buried)
- **Interaction panel** — floating/sticky aside or top strip:
  - Star toggle (1-click, amber)
  - Read checkbox ("Mark read")
  - Follow-up checkbox ("Revisit later")
  - Notes textarea (auto-saves on blur)
  - User tags input (chip row + autocomplete)
- **Tag row** — merged LLM + user tags, styled uniformly, user tags potentially distinguishable on hover but not visually segregated

### Filter bar

- `Tags` chip row stays as-is
- Filter backend (`/ranked` endpoint) now matches tags against `OR(article_analysis.tags && $tags, article_interactions.user_tags && $tags)`
- No UI change beyond the backend semantic swap

### New filter toggles (optional, shipped with 14A or deferred)

- "Unread only"
- "Starred"
- "Follow-up queue"
- These become new query params on `/ranked` that JOIN on `article_interactions`. Ship if cheap, defer if complicated.

## POC artifact

- [poc/reader-extract/extract.ts](../poc/reader-extract/extract.ts) — the validated extraction script
- [poc/reader-extract/out/index.html](../poc/reader-extract/out/index.html) — extraction results table
- [poc/reader-extract/out/compare.html](../poc/reader-extract/out/compare.html) — side-by-side original vs. reader for all 8 test URLs
- Future reference: the extraction logic in `apps/api/src/services/reader.ts` is lifted nearly verbatim from `extract.ts`. Package deps: `@mozilla/readability`, `jsdom`, `@types/jsdom`.

## Out of scope for Phase 14

- **Archive as a state** — the filter bar already handles "hide read" via `read_at IS NULL` filter. No separate archive concept.
- **Folders / collections** — tags are strictly better. Don't build two organizational axes.
- **Rich-text notes** — plain text is enough; render as markdown later if we feel like it.
- **Browser extension / bookmarklet** — reader mode covers the use case.
- **Voice notes** — cool but orthogonal; flag for later.
- **Review surface / spaced repetition / daily digest** — deferred to Phase 16+ (the "review" stage of the roadmap).
- **Topic tracker layer** — deferred to Phase 16+.
- **Generated syntheses / weekly digest / Q&A over corpus** — deferred indefinitely per user instruction ("we will not touch that in our current stage").
- **Playwright / headless browser fallback** — not needed at current source mix. Revisit only if a new source fails plain-fetch extraction.
- **Google News proxy URL resolution** — lab-proxy feeds stay as "Open original" fallback.
