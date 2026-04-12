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

type SortKey = "composite" | "relevance" | "importance" | "freshness";

const SORT_LABELS: Record<SortKey, string> = {
  composite: "Balanced",
  relevance: "Relevance",
  importance: "Importance",
  freshness: "Freshness",
};

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
  const compositeDisplay = Math.round(Number(item.compositeScore) * 100);
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
          <Badge variant={scoreVariant(compositeDisplay)} title="Composite score">
            {compositeDisplay}
          </Badge>
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
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("composite");

  const sources = useMemo(
    () => [...new Set(articles.map((a) => a.article.feedName))].sort(),
    [articles],
  );

  const sortedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) {
      for (const tag of a.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [articles]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

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
    if (selectedTags.size > 0) {
      result = result.filter((a) => (a.tags ?? []).some((t) => selectedTags.has(t)));
    }
    return result;
  }, [articles, query, activeSource, selectedTags]);

  const sorted = useMemo(() => {
    function keyValue(a: AnalyzedArticle): number {
      switch (sortKey) {
        case "composite":
          return Number(a.compositeScore);
        case "relevance":
          return Number(a.relevance) / 100;
        case "importance":
          return Number(a.importance) / 100;
        case "freshness":
          return Number(a.freshness);
      }
    }
    return [...filtered].sort((a, b) => keyValue(b) - keyValue(a));
  }, [filtered, sortKey]);

  return (
    <>
      {/* Search + Source + Sort */}
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
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Sort:</span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <Button
              key={k}
              variant={sortKey === k ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSortKey(k)}
            >
              {SORT_LABELS[k]}
            </Button>
          ))}
        </div>
      </div>

      {/* Source filter */}
      {sources.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          <span className="text-xs text-muted-foreground mr-1">Source:</span>
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

      {/* Tag filter */}
      {sortedTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-4">
          <span className="text-xs text-muted-foreground mr-1">Tags:</span>
          <Button
            variant={selectedTags.size === 0 ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedTags(new Set())}
          >
            All tags
          </Button>
          {sortedTags.slice(0, 20).map(([tag, count]) => (
            <Button
              key={tag}
              variant={selectedTags.has(tag) ? "secondary" : "ghost"}
              size="sm"
              onClick={() => toggleTag(tag)}
            >
              {tag}
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {count}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      <Separator className="mb-6" />

      {/* Filtered + sorted article list */}
      {sorted.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No articles match your filters.</p>
      ) : (
        <div className="space-y-4">
          {sorted.map((item) => (
            <ArticleCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
