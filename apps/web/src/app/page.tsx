import type { RankedArticle } from "@homenews/shared";
import { Newspaper, Rss, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchClusters, fetchFeeds, fetchRanked } from "@/lib/api";
import { DashboardFilters } from "./dashboard-filters";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ cluster?: string }>;
}) {
  const params = await searchParams;
  const activeCluster = params.cluster;

  let articles: RankedArticle[] = [];
  let clusters: { cluster: string; count: number }[] = [];
  let feedCount = 0;

  try {
    [articles, clusters, feedCount] = await Promise.all([
      fetchRanked({ limit: 50, cluster: activeCluster }),
      fetchClusters(),
      fetchFeeds().then((f) => f.length),
    ]);
  } catch {
    // API unavailable — show empty state
  }

  const avgScore =
    articles.length > 0
      ? Math.round(articles.reduce((sum, a) => sum + a.score, 0) / articles.length)
      : 0;

  const sourceCount = new Set(articles.map((a) => a.article.feedName)).size;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {activeCluster ? activeCluster : "Today\u2019s Feed"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {articles.length > 0
            ? `${articles.length} articles ranked by relevance`
            : "No articles yet \u2014 feeds will be processed on the next scheduler run."}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Articles</CardTitle>
            <Newspaper className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{articles.length}</div>
            <p className="text-xs text-muted-foreground">from {sourceCount} sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgScore}</div>
            <p className="text-xs text-muted-foreground">relevance score</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sources</CardTitle>
            <Rss className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{feedCount}</div>
            <p className="text-xs text-muted-foreground">active feeds</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Article List */}
      <DashboardFilters articles={articles} clusters={clusters} activeCluster={activeCluster} />
    </main>
  );
}
