import { and, desc, eq, gte, isNull, notExists, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { articleAnalysis, articles } from "../db/schema.js";
import { llmExecute } from "./llm-executor.js";
import { getSetting } from "./settings.js";

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
): Promise<{ analyzed: number; errors: number }> {
  // Use COALESCE(published_at, fetched_at) as the effective date so feeds that
  // don't populate published_at still get ordered sensibly.
  const effectiveDate = sql<Date>`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`;
  const cutoff = sql<Date>`NOW() - (${ANALYZE_MAX_AGE_DAYS} || ' days')::interval`;

  const baseQuery = db
    .select({ id: articles.id, title: articles.title, summary: articles.summary })
    .from(articles)
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

  let analyzed = 0;
  let errors = 0;

  for (const article of unanalyzed) {
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

  return { analyzed, errors };
}
