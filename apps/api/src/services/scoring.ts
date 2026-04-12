import { and, eq, isNull, notExists } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles, ranked } from "../db/schema.js";
import { llmExecute } from "./llm-executor.js";

export interface ScoreResult {
  score: number;
  tags: string[];
  reasoning: string;
}

export function buildScoringPrompt(title: string, summary: string | null): string {
  let prompt = `Title: ${title}`;
  if (summary) {
    prompt += `\nSummary: ${summary}`;
  }
  return prompt;
}

export function parseScoreResult(parsed: unknown): ScoreResult {
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.score !== "number" || obj.score < 0 || obj.score > 100) {
    throw new Error(`Invalid score: ${obj.score}`);
  }

  return {
    score: Math.round(obj.score),
    tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
    reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "",
  };
}

export async function scoreArticle(title: string, summary: string | null): Promise<ScoreResult> {
  const prompt = buildScoringPrompt(title, summary);
  const result = await llmExecute("scoring", prompt);
  return parseScoreResult(result.parsed);
}

export async function scoreUnscored(): Promise<{ scored: number; errors: number }> {
  const unscored = await db
    .select({ id: articles.id, title: articles.title, summary: articles.summary })
    .from(articles)
    .where(
      and(
        isNull(articles.duplicateOfId),
        notExists(
          db.select({ one: ranked.id }).from(ranked).where(eq(ranked.articleId, articles.id)),
        ),
      ),
    );

  let scored = 0;
  let errors = 0;

  for (const article of unscored) {
    try {
      const result = await scoreArticle(article.title, article.summary);
      await db.insert(ranked).values({
        articleId: article.id,
        score: result.score,
        tags: result.tags,
      });
      scored++;
    } catch (err) {
      console.warn(
        `[scoring] Failed to score "${article.title}": ${err instanceof Error ? err.message : String(err)}`,
      );
      errors++;
    }
  }

  return { scored, errors };
}
