import { and, eq, isNull, notExists } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles, ranked } from "../db/schema.js";
import { chatCompletion } from "./llm-client.js";

export interface ScoreResult {
  score: number;
  tags: string[];
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a news relevance scorer for an AI/ML/tech news feed.
Rate each article's relevance to AI, machine learning, and technology on a scale of 0-100.
Respond ONLY with valid JSON in this exact format:
{"score": <number 0-100>, "tags": [<string tags>], "reasoning": "<brief explanation>"}`;

export function buildScoringPrompt(title: string, summary: string | null): string {
  let prompt = `Title: ${title}`;
  if (summary) {
    prompt += `\nSummary: ${summary}`;
  }
  return prompt;
}

export function parseScoreResponse(response: string): ScoreResult {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in LLM response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
    throw new Error(`Invalid score: ${parsed.score}`);
  }

  return {
    score: Math.round(parsed.score),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

export async function scoreArticle(title: string, summary: string | null): Promise<ScoreResult> {
  const prompt = buildScoringPrompt(title, summary);
  const response = await chatCompletion(prompt, { systemPrompt: SYSTEM_PROMPT });
  return parseScoreResponse(response);
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
