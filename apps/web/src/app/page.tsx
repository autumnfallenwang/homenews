import type { AnalyzedArticle } from "@homenews/shared";
import { fetchFeeds, fetchRanked } from "@/lib/api";
import { DashboardFilters } from "./dashboard-filters";
import { PipelineControl } from "./pipeline-control";

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
    <>
      <PipelineControl />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <DashboardHeader
          articleCount={articles.length}
          sourceCount={sourceCount}
          feedCount={feedCount}
          avgComposite={avgComposite}
        />
        <DashboardFilters articles={articles} />
      </main>
    </>
  );
}

function DashboardHeader({
  articleCount,
  sourceCount,
  feedCount,
  avgComposite,
}: {
  articleCount: number;
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
          sourceCount={sourceCount}
          feedCount={feedCount}
          avgComposite={avgComposite}
        />
      </div>
      <h1 className="font-display text-[2.75rem] leading-[1.05] tracking-tight text-foreground">
        The day in <span className="text-primary">AI</span>.
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        {articleCount > 0 ? (
          <>
            <span className="text-foreground">{articleCount}</span> articles ranked by composite
            score, drawn from <span className="text-foreground">{sourceCount}</span> active sources.
            Filter by tag, search by keyword, or re-sort by individual dimensions below.
          </>
        ) : (
          <>
            No articles yet. Run the pipeline above to fetch the latest from your feeds, or wait for
            the next scheduled tick.
          </>
        )}
      </p>
    </header>
  );
}

function MetricStrip({
  articleCount,
  sourceCount,
  feedCount,
  avgComposite,
}: {
  articleCount: number;
  sourceCount: number;
  feedCount: number;
  avgComposite: number;
}) {
  return (
    <div className="hidden items-stretch gap-0 overflow-hidden rounded-sm border border-border bg-card/40 sm:flex">
      <Metric label="Articles" value={articleCount} />
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
