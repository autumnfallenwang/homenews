import type { PipelineProgressEvent } from "@homenews/shared";
import { and, desc, eq, gte, isNull, notExists, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { articleAnalysis, articles, feeds } from "../db/schema.js";
import { llmExecute } from "./llm-executor.js";
import { getSetting } from "./settings.js";

interface AnalyzeOptions {
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>;
  /** Mutable cancel flag shared with the pipeline orchestrator. Checked
   *  before each LLM call; in-flight work always completes. */
  signal?: { cancelRequested: boolean };
}

/** Cutoff for which unanalyzed articles the pipeline will even look at.
 *  Historical backfill (OpenAI goes back to 2015) would otherwise monopolize
 *  the queue with rows that can never score well on freshness. Anything older
 *  is ignored by analyze — see Phase 8 / changelog 2026-04-13. */
const ANALYZE_MAX_AGE_DAYS = 14;

export interface AnalyzeResult {
  relevance: number;
  importance: number;
  tags: string[];
}

export function buildAnalyzePrompt(title: string, summary: string | null): string {
  let prompt = `Title: ${title}`;
  if (summary) {
    prompt += `\nSummary: ${summary}`;
  }
  return prompt;
}

function validateScore(value: unknown, field: string): number {
  if (typeof value !== "number" || value < 0 || value > 100) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return Math.round(value);
}

export function parseAnalyzeResult(
  parsed: unknown,
  allowedTags: readonly string[],
  articleTitle?: string,
): AnalyzeResult {
  const obj = parsed as Record<string, unknown>;

  const relevance = validateScore(obj.relevance, "relevance");
  const importance = validateScore(obj.importance, "importance");

  const rawTags = Array.isArray(obj.tags) ? obj.tags.map(String) : [];
  const allowedSet = new Set(allowedTags);
  const tags: string[] = [];
  for (const tag of rawTags) {
    if (allowedSet.has(tag)) {
      tags.push(tag);
    } else {
      console.warn(
        `[analyze] Dropped unknown tag "${tag}"${articleTitle ? ` for article "${articleTitle}"` : ""}`,
      );
    }
  }

  return { relevance, importance, tags };
}

export async function analyzeArticle(
  title: string,
  summary: string | null,
): Promise<AnalyzeResult> {
  const prompt = buildAnalyzePrompt(title, summary);
  const result = await llmExecute("analyze", prompt);
  const allowedTags = await getSetting<string[]>("allowed_tags");
  return parseAnalyzeResult(result.parsed, allowedTags, title);
}

export async function analyzeUnanalyzed(
  limit?: number,
  options: AnalyzeOptions = {},
): Promise<{ analyzed: number; errors: number }> {
  const { onProgress, signal } = options;

  // Use COALESCE(published_at, fetched_at) as the effective date so feeds that
  // don't populate published_at still get ordered sensibly.
  const effectiveDate = sql<Date>`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`;
  const cutoff = sql<Date>`NOW() - (${ANALYZE_MAX_AGE_DAYS} || ' days')::interval`;

  const baseQuery = db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      feedName: feeds.name,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(
      and(
        isNull(articles.duplicateOfId),
        // Only consider articles from the recency window. `or(isNull, gte)`
        // keeps rows with a NULL published_at (fall back to fetched_at check).
        or(
          and(isNull(articles.publishedAt), gte(articles.fetchedAt, cutoff)),
          gte(articles.publishedAt, cutoff),
        ),
        notExists(
          db
            .select({ one: articleAnalysis.id })
            .from(articleAnalysis)
            .where(eq(articleAnalysis.articleId, articles.id)),
        ),
      ),
    )
    .orderBy(desc(effectiveDate));

  const unanalyzed = limit && limit > 0 ? await baseQuery.limit(limit) : await baseQuery;
  const total = unanalyzed.length;

  await onProgress?.({ type: "analyze-start", total });

  let analyzed = 0;
  let errors = 0;

  for (let i = 0; i < unanalyzed.length; i++) {
    if (signal?.cancelRequested) break;
    const article = unanalyzed[i];
    await onProgress?.({
      type: "analyze-item",
      index: i,
      total,
      title: article.title,
      feedName: article.feedName,
    });
    try {
      const result = await analyzeArticle(article.title, article.summary);
      await db.insert(articleAnalysis).values({
        articleId: article.id,
        relevance: result.relevance,
        importance: result.importance,
        tags: result.tags,
      });
      analyzed++;
    } catch (err) {
      console.warn(
        `[analyze] Failed for "${article.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      errors++;
    }
  }

  await onProgress?.({ type: "analyze-done", analyzed, errors });
  return { analyzed, errors };
}
