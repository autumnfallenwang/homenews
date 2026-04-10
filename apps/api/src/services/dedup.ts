import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { articles } from "../db/schema.js";

const SIMILARITY_THRESHOLD = 0.7;
const DEDUP_WINDOW_HOURS = 48;

/** Normalize title: lowercase, strip punctuation, collapse whitespace */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract character bigrams from a string */
function bigrams(str: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    result.add(str.slice(i, i + 2));
  }
  return result;
}

/** Dice coefficient similarity (0-1) on normalized titles */
export function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  if (normA.length < 2 || normB.length < 2) return 0;
  if (normA === normB) return 1;

  const bigramsA = bigrams(normA);
  const bigramsB = bigrams(normB);

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/** Find a duplicate among recent articles by title similarity */
export async function findDuplicate(title: string, excludeId?: string): Promise<string | null> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

  const conditions = [gt(articles.fetchedAt, cutoff), isNull(articles.duplicateOfId)];
  if (excludeId) {
    conditions.push(ne(articles.id, excludeId));
  }

  const recent = await db
    .select({ id: articles.id, title: articles.title })
    .from(articles)
    .where(and(...conditions));

  for (const candidate of recent) {
    if (titleSimilarity(title, candidate.title) >= SIMILARITY_THRESHOLD) {
      return candidate.id;
    }
  }

  return null;
}

/** Run dedup on recently inserted articles that haven't been checked */
export async function deduplicateRecent(): Promise<{
  checked: number;
  duplicatesFound: number;
}> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

  const unchecked = await db
    .select({ id: articles.id, title: articles.title })
    .from(articles)
    .where(and(gt(articles.fetchedAt, cutoff), isNull(articles.duplicateOfId)));

  let duplicatesFound = 0;

  for (const article of unchecked) {
    const duplicateOfId = await findDuplicate(article.title, article.id);
    if (duplicateOfId) {
      await db.update(articles).set({ duplicateOfId }).where(eq(articles.id, article.id));
      duplicatesFound++;
    }
  }

  return { checked: unchecked.length, duplicatesFound };
}
