import type {
  AnalyzedArticle,
  CreateFeed,
  Feed,
  PipelineRun,
  PipelineStatus,
  Setting,
  UpdateFeed,
} from "@homenews/shared";

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
