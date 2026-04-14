"use client";

import type { AnalyzedArticle } from "@homenews/shared";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

function scoreColor(score: number): string {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-foreground";
  return "text-muted-foreground";
}

function ArticleRow({ item }: { item: AnalyzedArticle }) {
  const composite = Math.round(Number(item.compositeScore) * 100);
  return (
    <article className="group relative border-b border-border py-6 transition-colors hover:bg-card/30">
      <div className="px-1">
        {/* Top meta row */}
        <div className="mb-2 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="text-foreground/80">{item.article.feedName}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{formatRelativeTime(item.article.publishedAt)}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
              score
            </span>
            <span
              className={cn("tabular font-mono text-[15px] font-medium", scoreColor(composite))}
            >
              {composite}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="font-display text-[22px] font-medium leading-[1.2] tracking-tight text-foreground transition-colors group-hover:text-primary">
          <Link href={`/article/${item.id}`} className="block">
            {item.article.title}
          </Link>
        </h3>

        {/* Summary */}
        {(item.llmSummary || item.article.summary) && (
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
            {item.llmSummary ?? item.article.summary}
          </p>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-sm border border-border bg-card/40 px-1.5 py-0.5 font-mono text-[10px] lowercase tracking-wide text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function DashboardFilters({ articles }: { articles: AnalyzedArticle[] }) {
  const [query, setQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
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

  function toggleSource(source: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
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
    if (selectedSources.size > 0) {
      result = result.filter((a) => selectedSources.has(a.article.feedName));
    }
    if (selectedTags.size > 0) {
      result = result.filter((a) => (a.tags ?? []).some((t) => selectedTags.has(t)));
    }
    return result;
  }, [articles, query, selectedSources, selectedTags]);

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
    <section>
      {/* Filter controls */}
      <div className="mb-6 space-y-3">
        {/* Search + Sort */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search articles..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-8 font-mono text-[12px]"
            />
          </div>
          <SegmentedSort sortKey={sortKey} onChange={setSortKey} />
        </div>

        {/* Source filter — multi-select; empty set means "all". Always
            rendered (even with 0 or 1 source) to keep the UI layout stable. */}
        <FilterRow label="Source">
          <ChipButton
            active={selectedSources.size === 0}
            onClick={() => setSelectedSources(new Set())}
          >
            All
          </ChipButton>
          {sources.map((s) => (
            <ChipButton key={s} active={selectedSources.has(s)} onClick={() => toggleSource(s)}>
              {s}
            </ChipButton>
          ))}
        </FilterRow>

        {/* Tag filter */}
        {sortedTags.length > 0 && (
          <FilterRow label="Tags">
            <ChipButton active={selectedTags.size === 0} onClick={() => setSelectedTags(new Set())}>
              All
            </ChipButton>
            {sortedTags.slice(0, 24).map(([tag, count]) => (
              <ChipButton key={tag} active={selectedTags.has(tag)} onClick={() => toggleTag(tag)}>
                {tag}
                <span className="ml-1.5 text-muted-foreground/60">{count}</span>
              </ChipButton>
            ))}
          </FilterRow>
        )}
      </div>

      {/* Filtered + sorted article list */}
      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border-t border-border">
          {sorted.map((item) => (
            <ArticleRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function SegmentedSort({
  sortKey,
  onChange,
}: {
  sortKey: SortKey;
  onChange: (k: SortKey) => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-sm border border-border bg-card/40">
      {(Object.keys(SORT_LABELS) as SortKey[]).map((k, i) => (
        <div key={k} className="flex items-stretch">
          {i > 0 && <span className="w-px bg-border" aria-hidden />}
          <button
            type="button"
            onClick={() => onChange(k)}
            className={cn(
              "px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              sortKey === k
                ? "bg-background text-primary"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {SORT_LABELS[k]}
          </button>
        </div>
      ))}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-2 py-0.5 font-mono text-[10px] lowercase tracking-wide transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-card/30 text-muted-foreground hover:border-border hover:bg-card/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="border-y border-border py-16 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        No articles match your filters
      </p>
    </div>
  );
}
