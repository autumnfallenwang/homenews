import type { AnalyzedArticle } from "@homenews/shared";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

export function ArticleRow({ item }: { item: AnalyzedArticle }) {
  const composite = Math.round(Number(item.compositeScore) * 100);
  return (
    <article className="group relative border-b border-border py-6 transition-colors hover:bg-card/30">
      <div className="px-1">
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

        <h3 className="font-display text-[22px] font-medium leading-[1.2] tracking-tight text-foreground transition-colors group-hover:text-primary">
          <Link href={`/article/${item.id}`} className="block">
            {item.article.title}
          </Link>
        </h3>

        {(item.llmSummary || item.article.summary) && (
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
            {item.llmSummary ?? item.article.summary}
          </p>
        )}

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
