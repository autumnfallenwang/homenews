import type { HighlightWithArticle } from "@homenews/shared";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
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

  const articleCount = new Set(highlights.map((h) => h.article.analysisId)).size;
  const status =
    highlights.length === 0 ? (
      <span className="text-muted-foreground/70">
        No highlights yet — open an article and select a passage to capture one
      </span>
    ) : (
      <span>
        <span className="text-foreground">{highlights.length}</span>
        <span className="text-muted-foreground/60">
          {" "}
          passage{highlights.length === 1 ? "" : "s"} across{" "}
        </span>
        <span className="text-foreground">{articleCount}</span>
        <span className="text-muted-foreground/60"> article{articleCount === 1 ? "" : "s"}</span>
      </span>
    );

  return (
    <>
      <PageHeader title="Highlights" status={status} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        {highlights.length > 0 && (
          <ul className="flex flex-col">
            {highlights.map((h) => (
              <li key={h.id} className="border-b border-border py-6">
                <blockquote className="border-l-2 border-primary/60 pl-4 font-display text-[16px] italic leading-relaxed text-foreground">
                  “{h.text}”
                </blockquote>
                {h.note && (
                  <p className="mt-2 pl-4 font-mono text-[11px] italic text-muted-foreground">
                    {h.note}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3 pl-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
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
    </>
  );
}
