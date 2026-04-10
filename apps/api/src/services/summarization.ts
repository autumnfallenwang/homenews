import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles, ranked } from "../db/schema.js";
import { chatCompletion } from "./llm-client.js";

const SYSTEM_PROMPT = `You are a news article summarizer for an AI/ML/tech news feed.
Write a concise 2-3 sentence summary of the article that captures the key points.
Respond ONLY with the summary text, no preamble or formatting.`;

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
  const response = await chatCompletion(prompt, { systemPrompt: SYSTEM_PROMPT });
  return parseSummaryResponse(response);
}

export async function summarizeUnsummarized(): Promise<{
  summarized: number;
  errors: number;
}> {
  const unsummarized = await db
    .select({
      rankedId: ranked.id,
      title: articles.title,
      summary: articles.summary,
      content: articles.content,
    })
    .from(ranked)
    .innerJoin(articles, eq(ranked.articleId, articles.id))
    .where(isNull(ranked.llmSummary));

  let summarized = 0;
  let errors = 0;

  for (const row of unsummarized) {
    try {
      const llmSummary = await summarizeArticle(row.title, row.summary, row.content);
      await db.update(ranked).set({ llmSummary }).where(eq(ranked.id, row.rankedId));
      summarized++;
    } catch (err) {
      console.warn(
        `[summarization] Failed for "${row.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      errors++;
    }
  }

  return { summarized, errors };
}
