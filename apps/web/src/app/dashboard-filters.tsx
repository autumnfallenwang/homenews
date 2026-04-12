"use client";

import type { AnalyzedArticle } from "@homenews/shared";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function scoreVariant(score: number) {
  if (score >= 80) return "default" as const;
  if (score >= 60) return "secondary" as const;
  return "outline" as const;
}

function ArticleCard({ item }: { item: AnalyzedArticle }) {
  return (
    <Card className="transition-colors hover:bg-accent/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base leading-snug">
              <Link href={`/article/${item.id}`} className="hover:underline">
                {item.article.title}
              </Link>
            </CardTitle>
            <CardDescription className="text-xs">
              {item.article.feedName} &middot; {formatRelativeTime(item.article.publishedAt)}
            </CardDescription>
          </div>
          <Badge variant={scoreVariant(item.relevance)}>{item.relevance}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-3">
          {item.llmSummary ?? item.article.summary ?? "No summary available."}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {item.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardFilters({ articles }: { articles: AnalyzedArticle[] }) {
  const [query, setQuery] = useState("");
  const [activeSource, setActiveSource] = useState<string | null>(null);

  const sources = useMemo(
    () => [...new Set(articles.map((a) => a.article.feedName))].sort(),
    [articles],
  );

  const filtered = useMemo(() => {
    let result = articles;
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (a) =>
          a.article.title.toLowerCase().includes(q) ||
          (a.llmSummary ?? a.article.summary ?? "").toLowerCase().includes(q),
      );
    }
    if (activeSource) {
      result = result.filter((a) => a.article.feedName === activeSource);
    }
    return result;
  }, [articles, query, activeSource]);

  return (
    <>
      {/* Search + Source Filter */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {sources.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <Button
              variant={activeSource === null ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSource(null)}
            >
              All sources
            </Button>
            {sources.map((s) => (
              <Button
                key={s}
                variant={activeSource === s ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveSource(activeSource === s ? null : s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Separator className="mb-6" />

      {/* Filtered Article List */}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No articles match your filters.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <ArticleCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
