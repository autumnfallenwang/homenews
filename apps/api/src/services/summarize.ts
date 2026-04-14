import type { PipelineProgressEvent } from "@homenews/shared";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { articleAnalysis, articles, feeds } from "../db/schema.js";
import { llmExecute } from "./llm-executor.js";

interface SummarizeOptions {
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>;
  /** Mutable cancel flag shared with the pipeline orchestrator. Checked
   *  before each LLM call; in-flight work always completes. */
  signal?: { cancelRequested: boolean };
}

export function buildSummaryPrompt(
  title: string,
  summary: string | null,
  content: string | null,
): string {
  let prompt = `Title: ${title}`;
  if (summary) {
    prompt += `\nSummary: ${summary}`;
  }
  if (content) {
    prompt += `\nContent: ${content.slice(0, 2000)}`;
  }
  return prompt;
}

export function parseSummaryResponse(response: string): string {
  const trimmed = response.trim();
  if (trimmed.length === 0) {
    throw new Error("Empty summary response");
  }
  return trimmed;
}

export async function summarizeArticle(
  title: string,
  summary: string | null,
  content: string | null,
): Promise<string> {
  const prompt = buildSummaryPrompt(title, summary, content);
  const result = await llmExecute("summarize", prompt);
  return parseSummaryResponse(result.raw);
}

export async function summarizeUnsummarized(
  limit?: number,
  options: SummarizeOptions = {},
): Promise<{ summarized: number; errors: number }> {
  const { onProgress, signal } = options;

  const baseQuery = db
    .select({
      analysisId: articleAnalysis.id,
      title: articles.title,
      summary: articles.summary,
      content: articles.content,
      feedName: feeds.name,
    })
    .from(articleAnalysis)
    .innerJoin(articles, eq(articleAnalysis.articleId, articles.id))
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .where(isNull(articleAnalysis.llmSummary));

  const unsummarized = limit && limit > 0 ? await baseQuery.limit(limit) : await baseQuery;
  const total = unsummarized.length;

  await onProgress?.({ type: "summarize-start", total });

  let summarized = 0;
  let errors = 0;

  for (let i = 0; i < unsummarized.length; i++) {
    if (signal?.cancelRequested) break;
    const row = unsummarized[i];
    await onProgress?.({
      type: "summarize-item",
      index: i,
      total,
      title: row.title,
      feedName: row.feedName,
    });
    try {
      const llmSummary = await summarizeArticle(row.title, row.summary, row.content);
      await db
        .update(articleAnalysis)
        .set({ llmSummary })
        .where(eq(articleAnalysis.id, row.analysisId));
      summarized++;
    } catch (err) {
      console.warn(
        `[summarize] Failed for "${row.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      errors++;
    }
  }

  await onProgress?.({ type: "summarize-done", summarized, errors });
  return { summarized, errors };
}
