import { ALLOWED_TAGS, type AnalyzedArticle, type Feed, type RankedFacets } from "@homenews/shared";
import { fetchFeeds, fetchRanked, type RankedFilters } from "@/lib/api";
import { ArticleListShell } from "./article-list-shell";
import { ArticleRow } from "./article-row";
import { DashboardShell } from "./dashboard-shell";
import { FilterBar } from "./filter-bar";
import { Pager } from "./pager";
import { PipelineControl } from "./pipeline-control";

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
  let facets: RankedFacets | null = null;

  try {
    // Facet counts ride along with every list fetch — the ~15ms overhead on
    // pagination flips is not material, and skipping facets on page 2+ would
    // blank out the chip counts mid-navigation.
    const [rankedRes, feedsList] = await Promise.all([
      fetchRanked({ ...filters, limit: PAGE_SIZE, offset, includeFacets: true }),
      fetchFeeds(),
    ]);
    articles = rankedRes.rows;
    total = rankedRes.total;
    facets = rankedRes.facets ?? null;
    feeds = feedsList;
  } catch {
    // API unavailable — show empty state
  }

  const availableSources = [...new Set(feeds.filter((f) => f.enabled).map((f) => f.name))].sort();
  const availableCategories = [
    ...new Set(feeds.map((f) => f.category).filter((c): c is string => Boolean(c))),
  ].sort();
  const availableTags = [...ALLOWED_TAGS];

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
    <>
      <PipelineControl />
      <DashboardShell>
        <main className="mx-auto max-w-6xl px-6 py-10">
          <DashboardHeader
            articleCount={articles.length}
            totalCount={total}
            sourceCount={sourceCount}
            feedCount={feeds.length}
            avgComposite={avgComposite}
          />
          <FilterBar
            initialFilters={filters}
            availableSources={availableSources}
            availableCategories={availableCategories}
            availableTags={availableTags}
            facets={facets}
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
    </>
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
      No articles yet. Run the pipeline above to fetch the latest from your feeds, or wait for the
      next scheduled tick.
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
    <div className="hidden items-stretch gap-0 overflow-hidden rounded-sm border border-border bg-card/40 sm:flex">
      <Metric label="Shown" value={`${articleCount}/${totalCount}`} />
      <Divider />
      <Metric label="Sources" value={`${sourceCount}/${feedCount}`} />
      <Divider />
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
    <div className="px-4 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`tabular font-mono text-[15px] leading-none mt-1 ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="w-px bg-border" aria-hidden />;
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
