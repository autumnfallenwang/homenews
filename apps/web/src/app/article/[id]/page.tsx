import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchRankedArticle } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-foreground";
  return "text-muted-foreground";
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await fetchRankedArticle(id);
  if (!item) notFound();

  const composite = Math.round(Number(item.compositeScore) * 100);
  const freshness = Math.round(Number(item.freshness) * 100);
  const authority = Math.round(Number(item.article.feedAuthorityScore) * 100);
  // Uniqueness is hardcoded to 1.0 in the composite formula until a real signal lands.
  const uniqueness = 100;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Back link */}
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to briefing
      </Link>

      {/* Source / time eyebrow */}
      <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-foreground/80">{item.article.feedName}</span>
        {item.article.author && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{item.article.author}</span>
          </>
        )}
        {item.article.publishedAt && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{formatDate(item.article.publishedAt)}</span>
          </>
        )}
      </div>

      {/* Title */}
      <h1 className="font-display text-[2.25rem] font-medium leading-[1.1] tracking-tight text-foreground">
        {item.article.title}
      </h1>

      {/* Score strip */}
      <div className="mt-8 overflow-hidden rounded-sm border border-border bg-card/30">
        <div className="border-b border-border">
          <ScoreCell label="Composite" value={composite} accent />
        </div>
        <div className="grid grid-cols-5">
          <ScoreCell label="Relevance" value={item.relevance} />
          <ScoreCell label="Importance" value={item.importance} />
          <ScoreCell label="Freshness" value={freshness} />
          <ScoreCell label="Authority" value={authority} />
          <ScoreCell label="Uniqueness" value={uniqueness} />
        </div>
      </div>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
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

      {/* AI Summary */}
      {item.llmSummary && (
        <section className="mt-10 border-l-2 border-primary/60 pl-5">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
            AI Summary
          </div>
          <p className="text-[15px] leading-relaxed text-foreground">{item.llmSummary}</p>
        </section>
      )}

      {/* Original Summary */}
      {item.article.summary && item.article.summary !== item.llmSummary && (
        <section className="mt-10">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Original Summary
          </div>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            {item.article.summary}
          </p>
        </section>
      )}

      {/* Read original link */}
      <div className="mt-12 border-t border-border pt-8">
        <a
          href={item.article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground"
        >
          Read original article
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>
    </main>
  );
}

function ScoreCell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="border-r border-border px-4 py-3 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "tabular font-mono text-[20px] leading-none mt-1.5",
          accent ? "text-primary" : scoreColor(value),
        )}
      >
        {value}
      </div>
    </div>
  );
}
