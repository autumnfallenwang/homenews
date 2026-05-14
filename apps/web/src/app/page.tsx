import type { AnalyzedArticle, Feed } from "@homenews/shared";
import { fetchFeeds, fetchRanked, type RankedFilters } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArticleListShell } from "./article-list-shell";
import { ArticleRow } from "./article-row";
import { DashboardShell } from "./dashboard-shell";
import { Pager } from "./pager";

const PAGE_SIZE = 50;

type RawSearchParams = Record<string, string | string[] | undefined>;

function getOne(sp: RawSearchParams, key: string): string | undefined {
  const v = sp[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function parseFilters(sp: RawSearchParams): RankedFilters {
  const csv = (key: string) => {
    const v = getOne(sp, key);
    return v ? v.split(",").filter(Boolean) : undefined;
  };
  const num = (key: string) => {
    const v = getOne(sp, key);
    return v === undefined ? undefined : Number(v);
  };
  return {
    q: getOne(sp, "q"),
    sources: csv("sources"),
    categories: csv("categories"),
    tags: csv("tags"),
    composite_gte: num("composite_gte"),
    relevance_gte: num("relevance_gte"),
    importance_gte: num("importance_gte"),
    published_at_gte: getOne(sp, "published_at_gte"),
    published_at_lte: getOne(sp, "published_at_lte"),
    sort: getOne(sp, "sort"),
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const rawOffset = Number(getOne(sp, "offset") ?? 0);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  let articles: AnalyzedArticle[] = [];
  let feeds: Feed[] = [];
  let total = 0;

  try {
    // Filter UI moved into the @sidebar slot; this page no longer renders
    // the facet chips itself, but `includeFacets: true` is kept so this
    // request URL matches the sidebar's and Next.js dedups them into one
    // network call per render.
    const [rankedRes, feedsList] = await Promise.all([
      fetchRanked({ ...filters, limit: PAGE_SIZE, offset, includeFacets: true }),
      fetchFeeds(),
    ]);
    articles = rankedRes.rows;
    total = rankedRes.total;
    feeds = feedsList;
  } catch {
    // API unavailable — show empty state
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(totalPages, Math.floor(offset / PAGE_SIZE) + 1);

  const avgCompositeRaw =
    articles.length > 0
      ? (articles.reduce((sum, a) => sum + Number(a.compositeScore || 0), 0) / articles.length) *
        100
      : 0;
  const avgComposite = Number.isFinite(avgCompositeRaw) ? Math.round(avgCompositeRaw) : 0;
  const sourceCount = new Set(articles.map((a) => a.article.feedName)).size;

  return (
    <DashboardShell>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <DashboardHeader
          articleCount={articles.length}
          totalCount={total}
          sourceCount={sourceCount}
          feedCount={feeds.length}
          avgComposite={avgComposite}
        />
        <ArticleListShell>
          {articles.length === 0 ? (
            <EmptyState />
          ) : (
            articles.map((item) => <ArticleRow key={item.id} item={item} />)
          )}
        </ArticleListShell>
        <Pager currentPage={currentPage} totalPages={totalPages} />
      </main>
    </DashboardShell>
  );
}

function DashboardHeader({
  articleCount,
  totalCount,
  sourceCount,
  feedCount,
  avgComposite,
}: {
  articleCount: number;
  totalCount: number;
  sourceCount: number;
  feedCount: number;
  avgComposite: number;
}) {
  return (
    <header className="mb-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Today's Briefing
        </span>
        <MetricStrip
          articleCount={articleCount}
          totalCount={totalCount}
          sourceCount={sourceCount}
          feedCount={feedCount}
          avgComposite={avgComposite}
        />
      </div>
      <h1 className="font-display text-[2.75rem] leading-[1.05] tracking-tight text-foreground">
        The day in <span className="text-primary">AI</span>.
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        <HeaderDescription
          articleCount={articleCount}
          totalCount={totalCount}
          sourceCount={sourceCount}
        />
      </p>
    </header>
  );
}

function HeaderDescription({
  articleCount,
  totalCount,
  sourceCount,
}: {
  articleCount: number;
  totalCount: number;
  sourceCount: number;
}) {
  if (articleCount > 0) {
    return (
      <>
        <span className="text-foreground">{articleCount}</span> of{" "}
        <span className="text-foreground">{totalCount}</span> articles shown, drawn from{" "}
        <span className="text-foreground">{sourceCount}</span> active sources. Refine via the filter
        bar below — all queries run server-side against the full corpus.
      </>
    );
  }
  if (totalCount > 0) {
    return (
      <>
        No articles match the current filters. <span className="text-foreground">{totalCount}</span>{" "}
        articles in the corpus overall — loosen or reset filters to find them.
      </>
    );
  }
  return (
    <>
      No articles yet. Trigger a run from the <span className="text-foreground">Pipeline</span> page
      in the sidebar to fetch the latest from your feeds, or wait for the next scheduled tick.
    </>
  );
}

function MetricStrip({
  articleCount,
  totalCount,
  sourceCount,
  feedCount,
  avgComposite,
}: {
  articleCount: number;
  totalCount: number;
  sourceCount: number;
  feedCount: number;
  avgComposite: number;
}) {
  return (
    <div className="hidden items-baseline gap-6 sm:flex">
      <Metric label="Shown" value={`${articleCount}/${totalCount}`} />
      <Metric label="Sources" value={`${sourceCount}/${feedCount}`} />
      <Metric label="Avg score" value={avgComposite} accent />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-mono text-[15px] leading-none",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
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
