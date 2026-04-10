import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles, ranked } from "../db/schema.js";
import { chatCompletion } from "./llm-client.js";

const SYSTEM_PROMPT = `You are a news article clustering assistant.
Given a list of article IDs and titles, group related articles into clusters.
Each cluster should have a short descriptive label (2-5 words).
Respond ONLY with valid JSON in this exact format:
{"clusters": {"article_id": "Cluster Label", "article_id2": "Cluster Label", ...}}
Every article must be assigned to exactly one cluster. Articles that don't fit any group get their own unique cluster label.`;

export function buildClusteringPrompt(items: { id: string; title: string }[]): string {
  const lines = items.map((a) => `- [${a.id}] ${a.title}`);
  return `Group these articles into topic clusters:\n\n${lines.join("\n")}`;
}

export function parseClusterResponse(response: string, articleIds: string[]): Map<string, string> {
  const result = new Map<string, string>();

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in LLM response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const clusters = parsed.clusters ?? parsed;

  if (typeof clusters !== "object" || clusters === null) {
    throw new Error("Invalid cluster response format");
  }

  const idSet = new Set(articleIds);
  for (const [id, label] of Object.entries(clusters)) {
    if (idSet.has(id) && typeof label === "string" && label.trim().length > 0) {
      result.set(id, label.trim());
    }
  }

  return result;
}

export async function clusterArticles(): Promise<{
  clustered: number;
  errors: number;
}> {
  // Find scored but unclustered articles
  const unclustered = await db
    .select({
      rankedId: ranked.id,
      articleId: ranked.articleId,
      title: articles.title,
    })
    .from(ranked)
    .innerJoin(articles, eq(ranked.articleId, articles.id))
    .where(isNull(ranked.cluster));

  if (unclustered.length === 0) {
    return { clustered: 0, errors: 0 };
  }

  const items = unclustered.map((r) => ({ id: r.articleId, title: r.title }));

  try {
    const prompt = buildClusteringPrompt(items);
    const response = await chatCompletion(prompt, { systemPrompt: SYSTEM_PROMPT });
    const clusterMap = parseClusterResponse(
      response,
      items.map((i) => i.id),
    );

    let clustered = 0;
    for (const row of unclustered) {
      const label = clusterMap.get(row.articleId);
      if (label) {
        await db.update(ranked).set({ cluster: label }).where(eq(ranked.id, row.rankedId));
        clustered++;
      }
    }

    return { clustered, errors: 0 };
  } catch (err) {
    console.warn(`[clustering] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return { clustered: 0, errors: 1 };
  }
}
