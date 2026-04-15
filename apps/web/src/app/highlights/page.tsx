import type { HighlightWithArticle } from "@homenews/shared";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { fetchAllHighlights } from "@/lib/api";

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function HighlightsPage() {
  const highlights: HighlightWithArticle[] = await fetchAllHighlights({ limit: 100 }).catch(
    () => [],
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to briefing
      </Link>

      <header className="mb-10">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Your knowledge base
        </div>
        <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-tight text-foreground">
          Your <span className="text-primary italic">highlights</span>.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {highlights.length > 0 ? (
            <>
              <span className="text-foreground">{highlights.length}</span> passage
              {highlights.length === 1 ? "" : "s"} saved across all articles, newest first. Click a
              title to revisit the source in reader mode.
            </>
          ) : (
            <>
              No highlights yet. Open any article and select a passage to start building your
              knowledge base.
            </>
          )}
        </p>
      </header>

      {highlights.length > 0 && (
        <ul className="flex flex-col gap-5">
          {highlights.map((h) => (
            <li
              key={h.id}
              className="border border-border bg-card/30 px-5 py-4 transition-colors hover:bg-card/50"
            >
              <blockquote className="border-l-2 border-primary/60 pl-4 font-display text-[16px] italic leading-relaxed text-foreground">
                “{h.text}”
              </blockquote>
              {h.note && (
                <p className="mt-2 pl-4 font-mono text-[11px] italic text-muted-foreground">
                  {h.note}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 pl-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <Link
                  href={`/article/${h.article.analysisId}`}
                  className="inline-flex max-w-full items-baseline gap-1 truncate font-display text-[13px] italic normal-case tracking-normal text-foreground transition-colors hover:text-primary"
                >
                  → {h.article.title}
                </Link>
                <span className="text-muted-foreground/40">·</span>
                <span>{h.article.feedName}</span>
                <span className="text-muted-foreground/40">·</span>
                <span>{formatRelativeTime(h.createdAt)}</span>
                <a
                  href={h.article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80"
                >
                  source
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
