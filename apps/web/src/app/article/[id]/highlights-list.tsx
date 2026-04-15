"use client";

import type { ArticleHighlight } from "@homenews/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteArticleHighlight } from "@/lib/api";
import { cn } from "@/lib/utils";

interface HighlightsListProps {
  highlights: ArticleHighlight[];
}

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

export function HighlightsList({ highlights }: HighlightsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteArticleHighlight(id);
      router.refresh();
    } catch {
      // Silent fail — user can retry
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-12 border-t border-border pt-8">
      <div className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
        Highlights{highlights.length > 0 && ` (${highlights.length})`}
      </div>

      {highlights.length === 0 ? (
        <p className="font-display text-[14px] italic text-muted-foreground/70">
          Select any passage above to save a highlight.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {highlights.map((h) => (
            <li
              key={h.id}
              className="group border border-border bg-card/30 px-4 py-3 transition-colors"
            >
              <blockquote className="border-l-2 border-primary/60 pl-4 font-display text-[15px] italic leading-relaxed text-foreground">
                “{h.text}”
              </blockquote>
              {h.note && (
                <p className="mt-2 pl-4 font-mono text-[11px] italic text-muted-foreground">
                  {h.note}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between pl-4 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/60">
                <span>{formatRelativeTime(h.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(h.id)}
                  disabled={deletingId === h.id}
                  className={cn(
                    "opacity-0 transition-opacity group-hover:opacity-100",
                    "hover:text-destructive",
                    deletingId === h.id && "cursor-default opacity-60",
                  )}
                >
                  {deletingId === h.id ? "removing…" : "× remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
