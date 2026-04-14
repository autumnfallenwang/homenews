# Phase 15 — Find (keyword + fuzzy + semantic search over the corpus)

Locked design memo. Second half of the "Capture + Find" foundation. Phase 14 made articles worth keeping; Phase 15 makes everything you've kept queryable — by humans and by LLMs.

## Why this phase

Capture without retrieval is a storage sink. The moment your corpus grows past ~1 month of highlights / saved articles, you can't find anything without search. Three retrieval modes cover the real needs:

1. **Keyword / human lookup** — "find articles about MoE routing" (exact words, maybe a typo)
2. **Fuzzy / approximate** — "find articles about moe routng" (typos, partial matches)
3. **Semantic / LLM lookup** — "find articles about routing networks" when the saved article never uses the phrase "MoE routing" but does use "mixture of experts routing"

All three should work against the same corpus without orchestration gymnastics.

## Locked design decisions

### 1. Stay on Postgres. Do not add a vector database.

At the scale of a personal knowledge base (~3k articles → ~30k embeddings including highlights), Postgres with `pgvector` and `pg_trgm` handles everything with sub-10ms queries and zero ops burden. Dedicated vector databases (Pinecone, Qdrant, Weaviate) would mean:
- Two services to run, back up, migrate
- Sync logic between PG and the vector store
- Split transactions — no ACID across stores
- Harder to combine vector search with structured filters (read state, tags, date ranges)

Postgres lets you write `WHERE embedding <=> $1 < 0.3 AND starred = true ORDER BY composite_score DESC LIMIT 10` in one query. That joinability is the whole point.

Revisit this decision only if the corpus crosses ~1M vectors, which at current ingest rates is years away.

### 2. Three indexes, one store

| Mode | Mechanism | Index |
|---|---|---|
| Keyword | `tsvector` generated column with `to_tsvector('english', title \|\| ' ' \|\| extracted_content \|\| ' ' \|\| llm_summary)` | GIN on `tsvector` |
| Fuzzy | `pg_trgm` extension | GIN-trgm on `title`, `extracted_content` |
| Semantic | `pgvector` extension | HNSW on `embedding vector(1024)` |

All three populated automatically — the tsvector is a stored generated column, the embedding is written during the analyze pipeline, and pg_trgm needs no separate column (operates on text directly).

### 3. Hybrid is the default mode

Best retrieval is keyword + vector combined. Simple SQL pattern:

```sql
WITH kw AS (
  SELECT id, ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS score
  FROM articles WHERE search_tsv @@ websearch_to_tsquery('english', $1)
  LIMIT 50
),
vec AS (
  SELECT id, 1 - (embedding <=> $2) AS score
  FROM articles WHERE embedding IS NOT NULL
  ORDER BY embedding <=> $2 LIMIT 50
)
SELECT id, SUM(score * weight) AS combined_score
FROM (
  SELECT id, score, 0.5 AS weight FROM kw
  UNION ALL
  SELECT id, score, 0.5 AS weight FROM vec
) t
GROUP BY id
ORDER BY combined_score DESC
LIMIT 20;
```

Simpler modes (`?mode=keyword` / `?mode=fuzzy` / `?mode=semantic`) just run one branch.

### 4. Embed highlights separately

Article-level embeddings are good for "find articles about X." Highlight-level embeddings are what make it feel like a real knowledge base — "find that specific passage about X."

Both `articles` and `article_highlights` get an `embedding vector(1024)` column + HNSW index. Highlights are embedded on creation; articles during the analyze pipeline.

### 5. Embedding model — one-time choice

The embedding model choice matters more than the storage engine. Pick one with stable dimensions and good retrieval quality, embed everything once, stick with it. Switching models later means re-embedding the entire corpus (overnight job, not a crisis).

Candidates (all available via the existing llm-gateway):
- `bge-m3` @ 1024 dim — strong general-purpose, multilingual, proven
- `nomic-embed-text-v1.5` @ 768 dim — smaller, very good at English retrieval
- `mxbai-embed-large` @ 1024 dim — strong on MTEB
- `jina-embeddings-v3` @ 1024 dim — strong on long-context

**Decision**: pick one based on what the llm-gateway currently exposes well. Default recommendation `bge-m3` (1024) for dimension headroom and broad coverage. Store the model name in settings so a future re-embed job knows what to use.

## Schema additions

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- articles: add tsvector (generated, auto-updated) + embedding
ALTER TABLE articles ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(extracted_content, '')
    )
  ) STORED;
CREATE INDEX articles_search_tsv_idx ON articles USING GIN (search_tsv);
CREATE INDEX articles_title_trgm_idx ON articles USING GIN (title gin_trgm_ops);

ALTER TABLE articles ADD COLUMN embedding vector(1024);
CREATE INDEX articles_embedding_idx ON articles
  USING hnsw (embedding vector_cosine_ops);

-- highlights: same treatment
ALTER TABLE article_highlights ADD COLUMN embedding vector(1024);
CREATE INDEX article_highlights_embedding_idx ON article_highlights
  USING hnsw (embedding vector_cosine_ops);

-- llm_summary and notes could also be indexed as tsvector but leave for later
-- if keyword search on analysis text becomes important
```

Note: `extracted_content` is populated by Phase 14's reader mode. The tsvector only has meaningful content after Phase 14 ships — Phase 15 depends strictly on Phase 14.

## Embedding pipeline

New service: `apps/api/src/services/embed.ts`

```ts
export async function embed(text: string): Promise<number[]>;
export async function embedBatch(texts: string[]): Promise<number[][]>;
```

Calls the llm-gateway's embeddings endpoint (OpenAI-compatible, same pattern as analyze/summarize).

Integration points:
1. **Articles — inside the analyze phase, not summarize**. Embeddings run right after extraction (Phase 14) completes for each article, in the same analyze batch. Input text: `title + first ~500 chars of extracted_content`. **Do not include `llm_summary`** — summarize is gated later and is batch-limited, so relying on it here would leave analyzed-but-not-yet-summarized articles un-embedded. The full extracted content is already a strong semantic signal; the LLM summary is optional. One embedding per article, written to `articles.embedding`.
2. **Highlights**: embed synchronously on POST, on the highlight text itself.
3. **Backfill job**: one-time script to embed existing analyzed articles that have `extracted_content` but no `embedding`. Run after the extraction backfill from Phase 14. ~10 minutes for ~3k articles at ~200ms each.
4. **Re-embed trigger**: settings entry `embedding_model_name`. If it changes, a maintenance task can re-embed. Don't automate — manual trigger only.

**Why not embed during summarize**: summarize is batch-limited and often runs behind analyze, so a meaningful subset of visible articles never reach it in time. Gating embedding on summarize would leave holes in the vector index for exactly the articles the user is most likely to click right now (the freshly-analyzed ones). Aligning embedding with analyze gives every visible article an embedding the moment it becomes visible.

## `GET /search` endpoint

```
GET /search?q=mixture+of+experts
  &mode=hybrid       // hybrid | keyword | fuzzy | semantic
  &target=all        // all | articles | highlights
  &limit=20
  &offset=0
  &starred_only=true
  &sources=Anthropic,DeepMind  // same source/tag filters as /ranked
  &tags=agents
```

Response shape mirrors `/ranked`:
```json
{
  "rows": [
    {
      "kind": "article" | "highlight",
      "article": { /* same fields as /ranked */ },
      "highlight": { /* only for highlight kind */ },
      "score": 0.87,
      "matchedMode": "hybrid"
    }
  ],
  "total": 142,
  "limit": 20,
  "offset": 0
}
```

Separate from `/ranked` because:
- Different primary sort (relevance, not composite score)
- Returns mixed article + highlight results
- Different response shape (needs `kind` + `score` + `matchedMode`)

## Web UI

- **Dedicated `/search` route** with its own page — search input prominent at top, results below
- Or: add a search mode to the existing dashboard that replaces the filter bar when active. Probably cleaner as a separate route initially.
- Keyword/fuzzy/semantic/hybrid as a mode toggle segmented control
- "Articles only" / "Highlights only" / "All" filter
- Each result renders differently: article = article row; highlight = quote card with article context below
- Hit-highlighting on matched terms (keyword mode only — use `ts_headline`)

## Out of scope for Phase 15

- **Re-ranking via a small LLM** — maybe later, not needed at day 1
- **Query expansion / rewriting** — defer
- **Cross-lingual search** — English only for now
- **Filter on embedding similarity alone (without query)** — e.g. "articles similar to this one" — would be a nice addition later as a `/articles/:id/similar` endpoint
- **Real-time incremental indexing** — all three indexes update automatically, no background reindex needed
- **Saved searches** — could be Phase 16

## Dependency on Phase 14

Phase 15 consumes data that only Phase 14 produces:
- `extracted_content` — needs reader mode
- `article_highlights` — needs Phase 14B highlights
- `article_interactions` — needed for `starred_only` / `read` filters on search results

**Strict order**: Phase 14A → 14B → 15. Don't parallelize.

## Why this becomes the "real" knowledge base

Once Phase 15 ships, the flow is:
1. Fetch → score → dashboard surfaces the day's best
2. You read + highlight + tag + note the important ones (Phase 14)
3. Weeks later: "what did I save about routing networks?" → semantic search over highlights → finds the passages you cared about, with article context → your corpus actually answers questions (Phase 15)

This is the floor for the eventually-deferred synthesis stage (weekly digest, Q&A over corpus). Phase 15 makes the corpus queryable; the synthesis stage would layer LLM reasoning on top of the same retrieval primitives.
