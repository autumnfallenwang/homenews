import type { AnalyzedArticle, Feed } from "@homenews/shared";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { fetchFeeds, fetchRanked, type RankedFilters } from "@/lib/api";
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

  const status = buildStatus(articles.length, total, sourceCount, feeds.length, avgComposite);

  return (
    <DashboardShell>
      <PageHeader title="Dashboard" status={status} actions={<RefreshButton />} />
      <main className="mx-auto max-w-6xl px-6 py-8">
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

function buildStatus(
  articleCount: number,
  totalCount: number,
  sourceCount: number,
  feedCount: number,
  avgComposite: number,
) {
  if (totalCount === 0) {
    return (
      <span>
        No articles yet —{" "}
        <span className="text-foreground/80">run the pipeline to fetch your feeds</span>
      </span>
    );
  }
  return (
    <span>
      <span className="text-foreground">{articleCount}</span>
      <span className="text-muted-foreground/60"> of </span>
      <span className="text-foreground">{totalCount.toLocaleString()}</span>
      <span className="text-muted-foreground/60"> · </span>
      <span className="text-foreground">{sourceCount}</span>
      <span className="text-muted-foreground/60">/{feedCount} sources · avg </span>
      <span className="text-primary">{avgComposite}</span>
    </span>
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
