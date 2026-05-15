import { ALLOWED_TAGS } from "@homenews/shared";
import { ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { fetchArticleHighlights, fetchArticleInteraction, fetchRankedArticle } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArticleTagsRow } from "./article-tags-row";
import { HighlightCaptureContent } from "./highlight-capture-content";
import { HighlightsList } from "./highlights-list";

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

// Rough reading-time estimate from extracted HTML length. Over-estimates
// slightly because it counts HTML markup characters too — fine for a hint.
function estimateReadingMinutes(html: string | null): number | null {
  if (!html) return null;
  return Math.max(1, Math.round(html.length / 4400));
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await fetchRankedArticle(id);
  if (!item) notFound();

  // Interactions are keyed on `articleId` (the articles.id UUID), not the
  // analysis UUID. Sequential fetch because we need `item.articleId` first;
  // the ~20ms cost is invisible. Fall back to a synthetic default if the API
  // is unreachable so the detail page still renders.
  const highlights = await fetchArticleHighlights(item.articleId).catch(() => []);

  const interaction = await fetchArticleInteraction(item.articleId).catch(() => ({
    id: null,
    articleId: item.articleId,
    userId: null,
    viewedAt: null,
    readAt: null,
    starred: false,
    note: null,
    userTags: [] as string[],
    followUp: false,
    readingSeconds: null,
    createdAt: null,
    updatedAt: null,
  }));

  const composite = Math.round(Number(item.compositeScore) * 100);
  const freshness = Math.round(Number(item.freshness) * 100);
  const authority = Math.round(Number(item.article.feedAuthorityScore) * 100);
  // Uniqueness is hardcoded to 1.0 in the composite formula until a real signal lands.
  const uniqueness = 100;

  const { extractedContent, extractionStatus } = item.article;
  const readingMinutes = estimateReadingMinutes(extractedContent);
  const hasBody = Boolean(extractedContent);
  const extractionFailed = extractionStatus === "failed";
  const pendingSummary = item.llmSummary === null;

  const headerStatus = (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <ScoreBadge label="Composite" value={composite} accent />
      <ScoreBadge label="Relevance" value={item.relevance} />
      <ScoreBadge label="Importance" value={item.importance} />
      <ScoreBadge label="Freshness" value={freshness} />
      <ScoreBadge label="Authority" value={authority} />
      <ScoreBadge label="Uniqueness" value={uniqueness} />
    </span>
  );

  return (
    <>
      <PageHeader
        title="Article"
        status={headerStatus}
        actions={
          <a
            href={item.article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            aria-label="Open original"
          >
            <ArrowUpRight className="h-3 w-3" />
            <span className="hidden sm:inline">Original</span>
          </a>
        }
      />
      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Meta eyebrow — source · author · publishedAt · reading time · pending badge */}
        <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
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
          {readingMinutes !== null && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{readingMinutes} min read</span>
            </>
          )}
          {pendingSummary && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/60">pending summary</span>
            </>
          )}
        </div>

        {/* Title */}
        <h1 className="font-display text-[2.25rem] font-medium leading-[1.1] tracking-tight text-foreground">
          {item.article.title}
        </h1>

        {/* Phase 18: star / mark-read / follow-up / notes moved into the
            @sidebar parallel-route slot so the reading column is content-only. */}

        {/* AI Summary card — only when llmSummary exists */}
        {item.llmSummary && (
          <section className="mt-10 border-l-2 border-primary/60 pl-5">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
              AI Summary
            </div>
            <p className="text-[15px] leading-relaxed text-foreground">{item.llmSummary}</p>
          </section>
        )}

        {/* Body — reader mode content, or failure / pending notice */}
        <div className="mt-12">
          {hasBody ? (
            <HighlightCaptureContent articleId={item.articleId} html={extractedContent as string} />
          ) : (
            <ExtractionNotice
              failed={extractionFailed}
              fallbackSummary={item.article.summary}
              link={item.article.link}
            />
          )}
        </div>

        {/* Highlights — saved passages from the reader body, with × remove */}
        <HighlightsList highlights={highlights} />

        {/* Tags — merged LLM + user tags, one deduplicated editable row */}
        <div className="mt-12">
          <ArticleTagsRow
            articleId={item.articleId}
            llmTags={item.tags ?? []}
            initialUserTags={interaction.userTags}
            availableTags={[...ALLOWED_TAGS]}
          />
        </div>

        {/* Phase 18: score strip moved into the page header's status slot
            (C / R / I / F / A / U badges). */}

        {/* Open original — permanent secondary CTA */}
        <div className="mt-10 border-t border-border pt-8">
          <a
            href={item.article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground"
          >
            Open original
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>
      </main>
    </>
  );
}

function ExtractionNotice({
  failed,
  fallbackSummary,
  link,
}: {
  failed: boolean;
  fallbackSummary: string | null;
  link: string;
}) {
  return (
    <section className="border-y border-border py-5">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {failed ? "Extraction failed" : "Extraction pending"}
      </div>
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        {failed
          ? "We couldn't extract this article's full content. Read it on the source to get the full text."
          : "Full content not yet extracted for this article. Read it on the source for now — the next pipeline run will fill this in."}
      </p>
      {fallbackSummary && (
        <p className="mt-4 border-l border-border pl-4 text-[14px] italic leading-relaxed text-muted-foreground">
          {fallbackSummary}
        </p>
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 rounded-sm border border-primary/50 bg-primary/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary hover:border-primary hover:bg-primary hover:text-primary-foreground"
      >
        Read on source
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </section>
  );
}

// Compact one-letter score badge for the page header's status slot.
// Renders inline as `C 81` etc. — composite is amber-accented; the rest
// take their tone from scoreColor() so weak signals fade.
function ScoreBadge({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-mono text-[12px] leading-none",
          accent ? "text-primary" : scoreColor(value),
        )}
      >
        {value}
      </span>
    </span>
  );
}
