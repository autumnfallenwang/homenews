import type {
  AnalyzedArticle,
  ArticleHighlight,
  ArticleInteraction,
  CreateArticleHighlight,
  CreateFeed,
  Feed,
  HighlightWithArticle,
  PipelineRun,
  PipelineStatus,
  RankedResponse,
  SearchMode,
  SearchResponse,
  SearchTarget,
  Setting,
  UpdateArticleInteraction,
  UpdateFeed,
} from "@homenews/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Phase 13 server-side filter inputs. Mirror of `rankedQuerySchema` in the
// shared package, one per query param. Snake_case for score/date fields
// matches the backend schema verbatim; `includeFacets` is the lone camelCase
// concession because it's a local TS flag, not a URL field.
export interface RankedFilters {
  q?: string;
  sources?: string[];
  categories?: string[];
  tags?: string[];
  composite_gte?: number;
  relevance_gte?: number;
  importance_gte?: number;
  published_at_gte?: string;
  published_at_lte?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  includeFacets?: boolean;
}

export async function fetchRanked(filters?: RankedFilters): Promise<RankedResponse> {
  const url = new URL(`${API_URL}/ranked`);
  const p = url.searchParams;
  if (filters?.q) p.set("q", filters.q);
  if (filters?.sources?.length) p.set("sources", filters.sources.join(","));
  if (filters?.categories?.length) p.set("categories", filters.categories.join(","));
  if (filters?.tags?.length) p.set("tags", filters.tags.join(","));
  if (filters?.composite_gte !== undefined) p.set("composite_gte", String(filters.composite_gte));
  if (filters?.relevance_gte !== undefined) p.set("relevance_gte", String(filters.relevance_gte));
  if (filters?.importance_gte !== undefined)
    p.set("importance_gte", String(filters.importance_gte));
  if (filters?.published_at_gte) p.set("published_at_gte", filters.published_at_gte);
  if (filters?.published_at_lte) p.set("published_at_lte", filters.published_at_lte);
  if (filters?.sort) p.set("sort", filters.sort);
  if (filters?.limit !== undefined) p.set("limit", String(filters.limit));
  if (filters?.offset !== undefined) p.set("offset", String(filters.offset));
  if (filters?.includeFacets) p.set("include_facets", "1");

  // Always fetch fresh — composite scores depend on live settings that can
  // change between runs, and Next.js's 300s ISR cache was hiding those
  // changes from the dashboard.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ranked articles: ${res.status}`);
  return res.json();
}

// --- Article interactions (Phase 14) ---

export async function fetchArticleInteraction(articleId: string): Promise<ArticleInteraction> {
  const res = await fetch(`${API_URL}/articles/${articleId}/interaction`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch article interaction: ${res.status}`);
  return res.json();
}

export async function updateArticleInteraction(
  articleId: string,
  body: UpdateArticleInteraction,
): Promise<ArticleInteraction> {
  const res = await fetch(`${API_URL}/articles/${articleId}/interaction`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to update article interaction: ${res.status}`);
  return res.json();
}

export async function fetchArticleHighlights(articleId: string): Promise<ArticleHighlight[]> {
  const res = await fetch(`${API_URL}/articles/${articleId}/highlights`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch highlights: ${res.status}`);
  return res.json();
}

export async function fetchAllHighlights(params?: {
  limit?: number;
  offset?: number;
}): Promise<HighlightWithArticle[]> {
  const url = new URL(`${API_URL}/highlights`);
  if (params?.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) url.searchParams.set("offset", String(params.offset));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch highlights: ${res.status}`);
  return res.json();
}

export async function deleteArticleHighlight(highlightId: string): Promise<void> {
  const res = await fetch(`${API_URL}/highlights/${highlightId}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to delete highlight: ${res.status}`);
}

export async function createArticleHighlight(
  articleId: string,
  body: CreateArticleHighlight,
): Promise<ArticleHighlight> {
  const res = await fetch(`${API_URL}/articles/${articleId}/highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to create highlight: ${res.status}`);
  return res.json();
}

export async function trackArticleView(articleId: string): Promise<void> {
  const res = await fetch(`${API_URL}/articles/${articleId}/interaction/view`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to track article view: ${res.status}`);
}

export async function fetchRankedArticle(id: string): Promise<AnalyzedArticle | null> {
  const res = await fetch(`${API_URL}/ranked/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ranked article: ${res.status}`);
  return res.json();
}

export async function fetchFeeds(): Promise<Feed[]> {
  const res = await fetch(`${API_URL}/feeds`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch feeds: ${res.status}`);
  return res.json();
}

export async function createFeed(data: CreateFeed): Promise<Feed> {
  const res = await fetch(`${API_URL}/feeds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create feed: ${res.status}`);
  return res.json();
}

export async function updateFeed(id: string, data: UpdateFeed): Promise<Feed> {
  const res = await fetch(`${API_URL}/feeds/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update feed: ${res.status}`);
  return res.json();
}

export async function deleteFeed(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/feeds/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete feed: ${res.status}`);
}

export async function triggerFetchFeed(id: string): Promise<{ added: number }> {
  const res = await fetch(`${API_URL}/feeds/${id}/fetch`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to trigger fetch: ${res.status}`);
  return res.json();
}

// --- Settings ---

// --- Search (Phase 15) ---

export async function fetchSearch(params: {
  q: string;
  mode?: SearchMode;
  target?: SearchTarget;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const url = new URL(`${API_URL}/search`);
  url.searchParams.set("q", params.q);
  if (params.mode) url.searchParams.set("mode", params.mode);
  if (params.target) url.searchParams.set("target", params.target);
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) url.searchParams.set("offset", String(params.offset));

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to search: ${res.status}`);
  return res.json();
}

export async function fetchSettings(): Promise<Setting[]> {
  const res = await fetch(`${API_URL}/settings`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
  return res.json();
}

export async function updateSetting(
  key: string,
  value: unknown,
): Promise<{ key: string; value: unknown; valueType: string; description: string | null }> {
  const res = await fetch(`${API_URL}/settings/${key}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Failed to update setting ${key}: ${res.status}`);
  return res.json();
}

export async function resetAllSettings(): Promise<{ reset: number }> {
  const res = await fetch(`${API_URL}/settings/reset`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to reset settings: ${res.status}`);
  return res.json();
}

// --- Phase 9 observability endpoints ---

/** SSE stream URL — consumed via `new EventSource(PIPELINE_STREAM_URL)`. */
export const PIPELINE_STREAM_URL = `${API_URL}/admin/pipeline/stream`;

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  const res = await fetch(`${API_URL}/admin/pipeline/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch pipeline status: ${res.status}`);
  return res.json();
}

export async function cancelPipelineRun(runId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/pipeline/runs/${runId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to cancel run: ${res.status}`);
}

export async function fetchPipelineRuns(params?: {
  limit?: number;
  trigger?: "manual" | "scheduler";
}): Promise<PipelineRun[]> {
  const url = new URL(`${API_URL}/admin/pipeline/runs`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.trigger) url.searchParams.set("trigger", params.trigger);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch pipeline runs: ${res.status}`);
  return res.json();
}
