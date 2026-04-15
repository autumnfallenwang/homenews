import {
  SEARCH_MODES,
  SEARCH_TARGETS,
  type SearchMode,
  type SearchResponse,
  type SearchResult,
  type SearchTarget,
} from "@homenews/shared";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fetchSearch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SearchControls } from "./search-controls";

// Parse ts_headline output — `<b>…</b>` marks around matched terms — into
// React nodes. ts_headline escapes HTML in its input before wrapping `<b>`,
// so the only HTML in the string is literal `<b>` / `</b>`. Regex-based
// parse is safe and avoids dangerouslySetInnerHTML.
function renderSnippet(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /<b>([^<]*)<\/b>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(snippet);
  let key = 0;
  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(snippet.slice(lastIndex, match.index));
    }
    parts.push(
      <mark key={`m${key++}`} className="rounded-sm bg-primary/20 px-0.5 text-primary">
        {match[1]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
    match = regex.exec(snippet);
  }
  if (lastIndex < snippet.length) {
    parts.push(snippet.slice(lastIndex));
  }
  return parts;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function getOne(sp: RawSearchParams, key: string): string | undefined {
  const v = sp[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function parseMode(raw: string | undefined): SearchMode {
  if (raw && (SEARCH_MODES as readonly string[]).includes(raw)) {
    return raw as SearchMode;
  }
  return "hybrid";
}

function parseTarget(raw: string | undefined): SearchTarget {
  if (raw && (SEARCH_TARGETS as readonly string[]).includes(raw)) {
    return raw as SearchTarget;
  }
  return "all";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
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

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const q = (getOne(sp, "q") ?? "").trim();
  const mode = parseMode(getOne(sp, "mode"));
  const target = parseTarget(getOne(sp, "target"));

  let results: SearchResponse | null = null;
  let error: string | null = null;

  if (q) {
    try {
      results = await fetchSearch({ q, mode, target, limit: 30 });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

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
          <span className="italic text-primary">Search.</span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Four modes — <span className="text-foreground">hybrid</span> combines keyword + semantic,{" "}
          <span className="text-foreground">keyword</span> matches exact phrases,{" "}
          <span className="text-foreground">fuzzy</span> tolerates typos,{" "}
          <span className="text-foreground">semantic</span> finds related ideas. Searches span
          articles and highlights across your entire corpus.
        </p>
      </header>

      <SearchControls initialQ={q} initialMode={mode} initialTarget={target} />

      {q && error && (
        <div className="border border-destructive/50 bg-destructive/10 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-destructive">
          Search failed: {error}
        </div>
      )}

      {q && results && results.rows.length === 0 && (
        <div className="border-y border-border py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            No results for "{q}"
          </p>
          <p className="mt-2 font-display text-[13px] italic text-muted-foreground/70">
            Try a different mode or broaden the query.
          </p>
        </div>
      )}

      {q && results && results.rows.length > 0 && (
        <>
          <div className="mb-5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-primary">{results.rows.length}</span> result
            {results.rows.length === 1 ? "" : "s"} · mode: {results.mode}
          </div>
          <ul className="flex flex-col gap-4">
            {results.rows.map((row) => (
              <li
                key={
                  row.kind === "article" ? `a-${row.article.articleId}` : `h-${row.highlight.id}`
                }
              >
                {row.kind === "article" ? (
                  <ArticleResultCard row={row} />
                ) : (
                  <HighlightResultCard row={row} />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!q && (
        <div className="border-y border-border py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Type a query and press Enter
          </p>
          <p className="mt-2 font-display text-[13px] italic text-muted-foreground/70">
            Search across articles and highlights you've captured.
          </p>
        </div>
      )}
    </main>
  );
}

function ArticleResultCard({ row }: { row: Extract<SearchResult, { kind: "article" }> }) {
  return (
    <Link
      href={`/article/${row.article.analysisId}`}
      className="block border border-border bg-card/30 px-5 py-4 transition-colors hover:bg-card/50"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-foreground/80">{row.article.feedName}</span>
        {row.article.publishedAt && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{formatRelativeTime(row.article.publishedAt)}</span>
          </>
        )}
        <span className="text-muted-foreground/40">·</span>
        <ModeBadge mode={row.matchedMode} />
        <span className="ml-auto tabular font-mono text-[10px] text-muted-foreground">
          {row.score.toFixed(2)}
        </span>
      </div>
      <h3 className="font-display text-[18px] font-medium leading-[1.25] tracking-tight text-foreground">
        {row.article.title}
      </h3>
      {row.snippet && (
        <p className="mt-2 font-display text-[13.5px] leading-relaxed text-muted-foreground">
          {renderSnippet(row.snippet)}
        </p>
      )}
    </Link>
  );
}

function HighlightResultCard({ row }: { row: Extract<SearchResult, { kind: "highlight" }> }) {
  return (
    <div className="border border-border bg-card/30 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-primary/80">Highlight</span>
        <span className="text-muted-foreground/40">·</span>
        <ModeBadge mode={row.matchedMode} />
        <span className="ml-auto tabular font-mono text-[10px] text-muted-foreground">
          {row.score.toFixed(2)}
        </span>
      </div>
      <blockquote className="mb-3 border-l-2 border-primary/60 pl-4 font-display text-[15px] italic leading-relaxed text-foreground">
        "{row.snippet ? renderSnippet(row.snippet) : row.highlight.text}"
      </blockquote>
      {row.highlight.note && (
        <p className="mb-3 pl-4 font-mono text-[11px] italic text-muted-foreground">
          {row.highlight.note}
        </p>
      )}
      <Link
        href={`/article/${row.article.analysisId}`}
        className="inline-flex max-w-full items-baseline gap-1 truncate pl-4 font-display text-[13px] italic text-muted-foreground transition-colors hover:text-primary"
      >
        → from {row.article.title}
      </Link>
      <div className="mt-2 flex items-center gap-3 pl-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
        <span>{row.article.feedName}</span>
        <span className="text-muted-foreground/40">·</span>
        <span>{formatRelativeTime(row.highlight.createdAt)}</span>
        <a
          href={row.article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80"
        >
          source
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function ModeBadge({ mode }: { mode: SearchMode }) {
  return (
    <span
      className={cn(
        "border border-border px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.18em]",
        mode === "semantic" || mode === "hybrid" ? "text-primary" : "text-muted-foreground",
      )}
    >
      {mode}
    </span>
  );
}
