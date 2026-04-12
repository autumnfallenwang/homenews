# LLM Interactions

How HomeNews uses LLMs. All calls go through a single client (`apps/api/src/services/llm-client.ts`) which proxies to an OpenAI-compatible gateway.

## Infrastructure

```
Scheduler (cron every 30min)
  └─ fetchAllFeeds()
  └─ scoreUnscored()       ← LLM call per article
  └─ clusterArticles()     ← LLM call per batch
  └─ summarizeUnsummarized() ← LLM call per article
```

**Registry:** `apps/api/src/services/llm-registry.ts`
- Central config for all LLM tasks (prompts, output formats, descriptions)
- `getTaskConfig(taskName)` returns the config for a given task
- Source of truth for system prompts — services import from here, not hardcode

**Client:** `apps/api/src/services/llm-client.ts`
- Uses OpenAI SDK pointed at `LLM_GATEWAY_URL`
- Single function: `chatCompletion(prompt, { systemPrompt?, model? })` → string
- Skips `temperature` for Codex/GPT-5 models (unsupported parameter)
- Model configured via `LLM_MODEL` env var

**Current config:**
- Primary: `gpt-5.3-codex` (via llm-gateway)
- Backup: `gemma3:27b` (Ollama, not yet wired as automatic fallback)

---

## Task 1: Relevance Scoring

**File:** `apps/api/src/services/scoring.ts`
**When:** After fetching new articles, one call per unscored article
**Volume:** ~1,479 articles on initial fetch, then incremental

### System Prompt
```
You are a news relevance scorer for an AI/ML/tech news feed.
Rate each article's relevance to AI, machine learning, and technology on a scale of 0-100.
Respond ONLY with valid JSON in this exact format:
{"score": <number 0-100>, "tags": [<string tags>], "reasoning": "<brief explanation>"}
```

### User Prompt
```
Title: <article title>
Summary: <article summary, if available>
```

### Expected Response (JSON)
```json
{"score": 85, "tags": ["ai", "llm"], "reasoning": "Directly about LLM advances"}
```

### Parsing
- Regex extracts first `{...}` from response (handles markdown wrapping)
- Validates score is number 0-100
- Falls back to empty array for missing tags, empty string for missing reasoning
- Stores: `ranked.score`, `ranked.tags`

### Error Handling
- Per-article try/catch — one failure doesn't block others
- Logs warning and increments error counter

---

## Task 2: Topic Clustering

**File:** `apps/api/src/services/clustering.ts`
**When:** After scoring, one call per batch of unclustered articles
**Volume:** Single LLM call for all unclustered articles (batch)

### System Prompt
```
You are a news article clustering assistant.
Given a list of article IDs and titles, group related articles into clusters.
Each cluster should have a short descriptive label (2-5 words).
Respond ONLY with valid JSON in this exact format:
{"clusters": {"article_id": "Cluster Label", "article_id2": "Cluster Label", ...}}
Every article must be assigned to exactly one cluster. Articles that don't fit any group get their own unique cluster label.
```

### User Prompt
```
Group these articles into topic clusters:

- [uuid-1] OpenAI Announces GPT-5
- [uuid-2] Google Releases Gemini 3
- [uuid-3] EU AI Act Enforcement Begins
...
```

### Expected Response (JSON)
```json
{"clusters": {"uuid-1": "AI Model Releases", "uuid-2": "AI Model Releases", "uuid-3": "AI Regulation"}}
```

### Parsing
- Regex extracts first `{...}` from response
- Accepts both `{"clusters": {...}}` and flat `{...}` format
- Only assigns labels for known article IDs (ignores hallucinated IDs)
- Ignores empty/whitespace labels
- Stores: `ranked.cluster`

### Error Handling
- Single try/catch for entire batch — if it fails, no articles get clustered
- Logs warning

---

## Task 3: Article Summarization

**File:** `apps/api/src/services/summarization.ts`
**When:** After clustering, one call per unsummarized article
**Volume:** Same as scoring — one call per article

### System Prompt
```
You are a news article summarizer for an AI/ML/tech news feed.
Write a concise 2-3 sentence summary of the article that captures the key points.
Respond ONLY with the summary text, no preamble or formatting.
```

### User Prompt
```
Title: <article title>
Summary: <article summary, if available>
Content: <first 2000 chars of article content, if available>
```

### Expected Response (plain text)
```
The article discusses advances in local LLM inference, showing that new quantization
techniques allow 70B models to run on consumer GPUs with minimal quality loss.
```

### Parsing
- No JSON extraction — response IS the summary (after trimming)
- Throws on empty/whitespace-only response
- Stores: `ranked.llmSummary`

### Error Handling
- Per-article try/catch — one failure doesn't block others
- Logs warning and increments error counter

---

## Summary Table

| Task | File | Calls | Input | Output Format | Storage |
|------|------|-------|-------|---------------|---------|
| Scoring | `scoring.ts` | 1 per article | title + summary | JSON `{score, tags, reasoning}` | `ranked.score`, `ranked.tags` |
| Clustering | `clustering.ts` | 1 per batch | list of ID+title | JSON `{clusters: {id: label}}` | `ranked.cluster` |
| Summarization | `summarization.ts` | 1 per article | title + summary + content (2k) | Plain text | `ranked.llmSummary` |

## Known Constraints

- **Codex models** don't support the `temperature` parameter — the client auto-detects and skips it
- **Clustering** sends all unclustered articles in one call — may hit token limits with very large batches
- **No automatic fallback** — if the primary model fails, there's no retry with the backup model (future enhancement)
- **Content truncation** — summarization truncates article content to 2000 chars to stay within context limits
