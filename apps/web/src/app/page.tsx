import type { AnalyzedArticle } from "@homenews/shared";
import { Newspaper, Rss, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchFeeds, fetchRanked } from "@/lib/api";
import { DashboardFilters } from "./dashboard-filters";

export default async function Home() {
  let articles: AnalyzedArticle[] = [];
  let feedCount = 0;

  try {
    [articles, feedCount] = await Promise.all([
      fetchRanked({ limit: 50 }),
      fetchFeeds().then((f) => f.length),
    ]);
  } catch {
    // API unavailable — show empty state
  }

  const avgCompositeRaw =
    articles.length > 0
      ? (articles.reduce((sum, a) => sum + Number(a.compositeScore || 0), 0) / articles.length) *
        100
      : 0;
  const avgComposite = Number.isFinite(avgCompositeRaw) ? Math.round(avgCompositeRaw) : 0;

  const sourceCount = new Set(articles.map((a) => a.article.feedName)).size;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Today&apos;s Feed</h1>
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
            <div className="text-2xl font-bold">{avgComposite}</div>
            <p className="text-xs text-muted-foreground">composite score (0-100)</p>
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
      <DashboardFilters articles={articles} />
    </main>
  );
}
