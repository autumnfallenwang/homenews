import { eq } from "drizzle-orm";
import Parser from "rss-parser";
import { db } from "../db/index.js";
import { articles, feeds } from "../db/schema.js";
import { findDuplicate } from "./dedup.js";
import { mapRssItem } from "./rss-mapper.js";

const parser = new Parser({ timeout: 10_000 });

export interface FetchResult {
  feedId: string;
  feedName: string;
  added: number;
  error?: string;
}

export async function fetchFeed(feed: {
  id: string;
  name: string;
  url: string;
}): Promise<FetchResult> {
  const result: FetchResult = { feedId: feed.id, feedName: feed.name, added: 0 };

  try {
    const parsed = await parser.parseURL(feed.url);
    const items = parsed.items
      .map((item) => mapRssItem(feed.id, item))
      .filter((a) => a.link !== "");

    if (items.length > 0) {
      const inserted = await db
        .insert(articles)
        .values(items)
        .onConflictDoNothing({ target: articles.link })
        .returning({ id: articles.id, title: articles.title });
      result.added = inserted.length;

      // Run title-based dedup on newly inserted articles
      for (const article of inserted) {
        const duplicateOfId = await findDuplicate(article.title, article.id);
        if (duplicateOfId) {
          await db.update(articles).set({ duplicateOfId }).where(eq(articles.id, article.id));
        }
      }
    }

    await db.update(feeds).set({ lastFetchedAt: new Date() }).where(eq(feeds.id, feed.id));
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

export async function fetchAllFeeds(): Promise<FetchResult[]> {
  const enabledFeeds = await db
    .select({ id: feeds.id, name: feeds.name, url: feeds.url })
    .from(feeds)
    .where(eq(feeds.enabled, true));

  const results: FetchResult[] = [];
  for (const feed of enabledFeeds) {
    results.push(await fetchFeed(feed));
  }
  return results;
}
