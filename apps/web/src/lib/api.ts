import type { ClusterInfo, CreateFeed, Feed, RankedArticle, UpdateFeed } from "@homenews/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchRanked(params?: {
  limit?: number;
  offset?: number;
  minScore?: number;
  cluster?: string;
}): Promise<RankedArticle[]> {
  const url = new URL(`${API_URL}/ranked`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  if (params?.minScore) url.searchParams.set("minScore", String(params.minScore));
  if (params?.cluster) url.searchParams.set("cluster", params.cluster);

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch ranked articles: ${res.status}`);
  return res.json();
}

export async function fetchRankedArticle(id: string): Promise<RankedArticle | null> {
  const res = await fetch(`${API_URL}/ranked/${id}`, { next: { revalidate: 300 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ranked article: ${res.status}`);
  return res.json();
}

export async function fetchClusters(): Promise<ClusterInfo[]> {
  const res = await fetch(`${API_URL}/ranked/clusters`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Failed to fetch clusters: ${res.status}`);
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
