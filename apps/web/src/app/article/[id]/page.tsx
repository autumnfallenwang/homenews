import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchRankedArticle } from "@/lib/api";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreVariant(score: number) {
  if (score >= 80) return "default" as const;
  if (score >= 60) return "secondary" as const;
  return "outline" as const;
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await fetchRankedArticle(id);
  if (!item) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to feed
      </Link>

      {/* Title */}
      <h1 className="text-2xl font-bold tracking-tight leading-tight mb-4">{item.article.title}</h1>

      {/* Metadata */}
      <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground mb-6">
        <span>{item.article.feedName}</span>
        {item.article.author && (
          <>
            <span>&middot;</span>
            <span>{item.article.author}</span>
          </>
        )}
        {item.article.publishedAt && (
          <>
            <span>&middot;</span>
            <span>{formatDate(item.article.publishedAt)}</span>
          </>
        )}
      </div>

      {/* Scores + Tags */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <Badge variant={scoreVariant(item.relevance)}>Relevance: {item.relevance}</Badge>
        <Badge variant={scoreVariant(item.importance)}>Importance: {item.importance}</Badge>
        {item.tags?.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      <Separator className="mb-6" />

      {/* LLM Summary */}
      {item.llmSummary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">AI Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{item.llmSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Original Summary */}
      {item.article.summary && item.article.summary !== item.llmSummary && (
        <div className="mb-6">
          <h2 className="text-sm font-medium mb-2 text-muted-foreground">Original Summary</h2>
          <p className="text-sm leading-relaxed">{item.article.summary}</p>
        </div>
      )}

      {/* Read original link */}
      <div className="mt-8">
        <a
          href={item.article.link}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants()}
        >
          Read original article
          <ExternalLink className="h-4 w-4 ml-2" />
        </a>
      </div>
    </main>
  );
}
