import type { AnalyzedArticle, CreateFeed, Feed, Setting, UpdateFeed } from "@homenews/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchRanked(params?: {
  limit?: number;
  offset?: number;
  minScore?: number;
}): Promise<AnalyzedArticle[]> {
  const url = new URL(`${API_URL}/ranked`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  if (params?.minScore) url.searchParams.set("minScore", String(params.minScore));

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch ranked articles: ${res.status}`);
  return res.json();
}

export async function fetchRankedArticle(id: string): Promise<AnalyzedArticle | null> {
  const res = await fetch(`${API_URL}/ranked/${id}`, { next: { revalidate: 300 } });
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

// --- Admin pipeline triggers ---

export interface FetchPipelineResult {
  feeds: number;
  added: number;
  errors: number;
}

export interface AnalyzePipelineResult {
  analyzed: number;
  errors: number;
  limit?: number;
}

export interface SummarizePipelineResult {
  summarized: number;
  errors: number;
  limit?: number;
}

export interface RunAllPipelineResult {
  fetch: FetchPipelineResult;
  analyze: AnalyzePipelineResult;
  summarize: SummarizePipelineResult;
}

export async function triggerPipelineFetch(): Promise<FetchPipelineResult> {
  const res = await fetch(`${API_URL}/admin/pipeline/fetch`, { method: "POST" });
  if (!res.ok) throw new Error(`Pipeline fetch failed: ${res.status}`);
  return res.json();
}

export async function triggerPipelineAnalyze(limit?: number): Promise<AnalyzePipelineResult> {
  const url = limit
    ? `${API_URL}/admin/pipeline/analyze?limit=${limit}`
    : `${API_URL}/admin/pipeline/analyze`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Pipeline analyze failed: ${res.status}`);
  return res.json();
}

export async function triggerPipelineSummarize(limit?: number): Promise<SummarizePipelineResult> {
  const url = limit
    ? `${API_URL}/admin/pipeline/summarize?limit=${limit}`
    : `${API_URL}/admin/pipeline/summarize`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Pipeline summarize failed: ${res.status}`);
  return res.json();
}

export async function triggerPipelineRunAll(): Promise<RunAllPipelineResult> {
  const res = await fetch(`${API_URL}/admin/pipeline/run-all`, { method: "POST" });
  if (!res.ok) throw new Error(`Pipeline run-all failed: ${res.status}`);
  return res.json();
}
