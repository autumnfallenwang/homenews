import { eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles, ranked } from "../db/schema.js";
import { llmExecute } from "./llm-executor.js";

export function buildClusteringPrompt(items: { id: string; title: string }[]): string {
  const lines = items.map((a) => `- [${a.id}] ${a.title}`);
  return `Group these articles into topic clusters:\n\n${lines.join("\n")}`;
}

export function parseClusterResult(parsed: unknown, articleIds: string[]): Map<string, string> {
  const result = new Map<string, string>();

  const obj = parsed as Record<string, unknown>;
  const clusters = (obj.clusters ?? obj) as Record<string, unknown>;

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
    const result = await llmExecute("clustering", prompt);
    const clusterMap = parseClusterResult(
      result.parsed,
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
